/**
 * Physics loop update tick with Harmonic Procedural Sway, particle animation & camera lerp.
 */
import { BLOCK_H, GROUND_MARGIN, BLOCK_TYPES, PHYSICS_CONFIG } from "./config.js";
import { state, spawnParticles, spawnFloatingText, uiScale, getFloorCount, getBlockSwayX, getCriticalTilt, getMoverLimits, getLaneBounds, spawnMover } from "./gameState.js";
import { handleGameOver, PhysicsEngine } from "./physics.js";
import { updateHUD } from "../ui/uiManager.js";
import { ActiveCatSystem } from "./physics/ActiveCatSystem.js";

// Accumulator for fixed timestep
let physicsAccumulator = 0;

export function update(dt) {
  const k = (dt * 60) / 1000;

  // 1. Smooth Camera Lerp
  const isSingleFall = (state.status === "collapsing" || state.status === "over") && (
    state.blocks.filter(b => b.isFalling).length > 0 || state.debris.length > 0
  );
  const cameraLerpRate = isSingleFall ? 0.15 : 0.1;
  state.cameraY += (state.targetCameraY - state.cameraY) * cameraLerpRate * k;

  // 2. Physical Inverted Pendulum & Collapse Dynamics
  if (state.status === "collapsing" || state.status === "over") {
    // Keep swaying the remaining tower during Game Over!
    physicsAccumulator += dt;
    const substepMs = PHYSICS_CONFIG.PHYSICS_SUBSTEP_MS;
    if (physicsAccumulator > 200) physicsAccumulator = 200;
    while (physicsAccumulator >= substepMs) {
      physicsAccumulator -= substepMs;
      physicsTick(substepMs / 1000, true);
    }

    const fallingBlocks = state.blocks.filter(b => b.isFalling);
    if (fallingBlocks.length > 0) {
      // If full explosion happened, targetCameraY was set to 0. 
      // Otherwise (partial collapse/single fall), track the lowest falling block.
      if (state.targetCameraY !== 0) {
        const lowestY = Math.min(...fallingBlocks.map(b => b.y));
        state.targetCameraY = Math.max(0, lowestY - state.H * 0.45);
      }
    } else if (state.debris.length > 0 && fallingBlocks.length === 0) {
      if (state.targetCameraY !== 0) {
        state.targetCameraY = Math.max(0, state.debris[0].y - state.H * 0.45);
      }
    }

    // dt from main.js is in milliseconds, but physics expects SECONDS!
    PhysicsEngine.stepCollapsingBlocks(state.blocks, state.H, dt / 1000, state);
    
    // User requested EXACT timer for showing the Game Over screen
    if (state.status === "collapsing") {
      state.gameOverTimer -= dt;
      if (state.gameOverTimer <= 0) {
        state.status = "over";
        updateHUD();
      }
    }
  } else if (state.status === "playing" && state.blocks.length > 1) {
    physicsAccumulator += dt;
    const substepMs = PHYSICS_CONFIG.PHYSICS_SUBSTEP_MS;
    if (physicsAccumulator > 200) physicsAccumulator = 200;

    while (physicsAccumulator >= substepMs && state.status === "playing" && state.blocks.length > 1) {
      physicsAccumulator -= substepMs;
      physicsTick(substepMs / 1000, false);
    }
  }

  // 3. Mover Movement & Golden Sparkles
  if (state.status === "playing" && state.mover) {
    ActiveCatSystem.update(state.mover, k, state);

    if (state.mover.state === "missed") {
      spawnMover();
    } else if (state.mover.isGolden && Math.random() < 0.3) {
      const sy = state.H - GROUND_MARGIN - (state.mover.y - state.cameraY) - BLOCK_H / 2;
      spawnParticles(state.mover.x + state.mover.width / 2, sy, 1, ["#ffe08a", "#fff3c4"], 1, 400);
    }
  }

  // 4. Cat Block Squish & Stretch Spring Physics
  // Only the most recently placed blocks can still be mid-animation; older ones settled long ago.
  const squishScanStart = Math.max(0, state.blocks.length - 40);
  for (let i = squishScanStart; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    if (b.squishX && (Math.abs(b.squishX - 1) > 0.01 || Math.abs(b.squishY - 1) > 0.01)) {
      const forceX = (1 - b.squishX) * 0.25;
      const forceY = (1 - b.squishY) * 0.25;
      b.squishVelX = (b.squishVelX + forceX) * 0.75;
      b.squishVelY = (b.squishVelY + forceY) * 0.75;
      b.squishX += b.squishVelX * k;
      b.squishY += b.squishVelY * k;
    } else {
      b.squishX = 1;
      b.squishY = 1;
    }
  }

  // 5. Debris Falling
  for (let i = state.debris.length - 1; i >= 0; i--) {
    const d = state.debris[i];
    d.vy -= 0.38 * k; // Gravity pulls vy negative (downwards towards bottom of screen)
    d.x += d.vx * k;
    d.y += d.vy * k;
    d.rot += d.vrot * k;
    if (d.y - state.cameraY < -200) { // Off bottom of screen
      state.debris.splice(i, 1);
    }
  }

  // 6. Particles update
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * k;
    p.y += p.vy * k;
    p.vy += 0.12 * k;
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }

  // 7. Floating Text Popups
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const f = state.floatingTexts[i];
    f.y -= 0.6 * k;
    f.life -= dt;
    if (f.life <= 0) {
      state.floatingTexts.splice(i, 1);
    }
  }

  // 8. Screen Shake Decay
  if (state.shakeMag > 0.2) {
    state.shakeMag *= 0.86;
  } else {
    state.shakeMag = 0;
  }

  // 9. Screen Flash Decay
  if (state.screenFlash) {
    state.screenFlash.alpha *= 0.82;
    if (state.screenFlash.alpha < 0.02) {
      state.screenFlash = null;
    }
  }

  // 10. Milestone Banner Lifetime
  if (state.milestoneBanner) {
    state.milestoneBanner.life -= dt;
    if (state.milestoneBanner.life <= 0) {
      state.milestoneBanner = null;
    }
  }
}

/**
 * Тонкая обёртка над новым PhysicsWorld.
 * Вся логика интеграции перенесена в PhysicsWorld.step().
 */
function physicsTick(dt, isGameOver = false) {
  if (!state.physicsWorld) return;
  state.physicsWorld.step(dt, state, isGameOver);
}
