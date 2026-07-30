/**
 * Physics loop update tick with Harmonic Procedural Sway, particle animation & camera lerp.
 */
import { BLOCK_H, GROUND_MARGIN, BLOCK_TYPES, PHYSICS_CONFIG } from "./config.js";
import { state, spawnParticles, spawnFloatingText, uiScale, getFloorCount, getBlockSwayX, getCriticalTilt, getMoverLimits, getLaneBounds } from "./gameState.js";
import { handleGameOver, PhysicsEngine } from "./physics.js";
import { updateHUD } from "../ui/uiManager.js";

// Accumulator for fixed timestep
let physicsAccumulator = 0;

export function update(dt) {
  const k = (dt * 60) / 1000;

  // 1. Smooth Camera Lerp
  state.cameraY += (state.targetCameraY - state.cameraY) * 0.1 * k;

  // 2. Physical Inverted Pendulum & Collapse Dynamics
  if (state.status === "collapsing") {
    const allCleared = PhysicsEngine.stepCollapsingBlocks(state.blocks, state.H, dt);
    if (allCleared) {
      state.status = "over";
      updateHUD();
    }
  } else if (state.status === "playing" && state.blocks.length > 1) {
    physicsAccumulator += dt;
    const substepMs = PHYSICS_CONFIG.PHYSICS_SUBSTEP_MS;
    if (physicsAccumulator > 200) physicsAccumulator = 200;

    while (physicsAccumulator >= substepMs && state.status === "playing" && state.blocks.length > 1) {
      physicsAccumulator -= substepMs;
      physicsTick(substepMs / 1000);
    }
  }

  // 3. Mover Movement & Golden Sparkles
  if (state.status === "playing" && state.mover) {
    state.mover.x += state.mover.dir * state.mover.speed * k;
    const limits = getMoverLimits();

    if (state.mover.x < limits.left) {
      state.mover.x = limits.left;
      state.mover.dir = 1;
    }
    if (state.mover.x > limits.right) {
      state.mover.x = limits.right;
      state.mover.dir = -1;
    }

    if (state.mover.isGolden && Math.random() < 0.3) {
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
 * Single fixed-timestep physics tick for the inverted pendulum tower model.
 * dt is in seconds (e.g. 0.004 for a 4ms substep).
 */
function physicsTick(dt) {
  if (!state.blocks || state.blocks.length <= 1) return;
  const P = PHYSICS_CONFIG;

  // --- Compute Viewport-Based Center of Mass ---
  // Only blocks visible on the screen (plus margin) affect the current balance & physics
  const minY = state.cameraY - 40;
  const maxY = state.cameraY + state.H + 40;

  const visibleBlocks = [];
  for (let i = 0; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    if (b.y >= minY && b.y <= maxY) {
      visibleBlocks.push({ block: b, originalIdx: i });
    }
  }

  // Fallback if camera hasn't updated: use top blocks
  if (visibleBlocks.length < 2) {
    const startIdx = Math.max(0, state.blocks.length - 10);
    for (let i = startIdx; i < state.blocks.length; i++) {
      visibleBlocks.push({ block: state.blocks[i], originalIdx: i });
    }
  }

  let totalMass = 0;
  let totalWeightedMass = 0;
  let weightedX = 0;
  let weightedY = 0;
  const pivotX = state.columnLeft + state.columnWidth / 2;
  const count = visibleBlocks.length;

  for (let v = 0; v < count; v++) {
    const { block: b, originalIdx: i } = visibleBlocks[v];
    const type = BLOCK_TYPES[b.typeId] || BLOCK_TYPES.normal;
    let mass = type.weight;
    if (i === 0) mass = 10; // Ground base block is heavy
    else if (b.isGolden) mass *= 1.5;

    // Viewport Leverage: higher visible blocks have up to 3x leverage on balance
    const leverage = 1 + (v / Math.max(1, count - 1)) * 2.0;
    const staticX = b.x + b.width / 2;

    totalMass += mass;
    totalWeightedMass += mass * leverage;
    weightedX += staticX * mass * leverage;
    weightedY += (b.y + BLOCK_H / 2) * mass;
  }

  const comX = (weightedX / totalWeightedMass) - pivotX; // Horizontal offset from pivot
  const comY = weightedY / totalMass;             // Average height

  // Level difficulty: use the blended value computed in spawnMover (see getLevelBlend)
  // so sway sensitivity ramps across a boundary instead of jumping instantly.
  const swaySens = state.swaySens;

  // 1. Gravity torque: off-center mass wants to topple the tower
  const gravityTorque = P.GRAVITY_FACTOR * totalMass * comX * swaySens;

  // 2. Restoring spring: foundation fights the tilt
  //    Logarithmic scaling: grows gently with mass so tall towers aren't frozen
  const stiffnessScale = 1 + Math.log(1 + totalMass * 0.5);
  const springTorque = -P.BASE_STIFFNESS * stiffnessScale * state.towerAngle;

  // 3. Damping: friction resists angular velocity
  const dampingScale = 1 + Math.log(1 + totalMass * 0.3);
  const dampingTorque = -P.BASE_DAMPING * dampingScale * state.towerAngularVelocity;

  // 4. Wind: gentle persistent push
  const windTorque = state.wind * comY * 0.00008 * swaySens;

  // --- Moment of Inertia (simplified rod approximation) ---
  const lastBlock = state.blocks[state.blocks.length - 1];
  const towerHeight = Math.max(BLOCK_H, lastBlock ? lastBlock.y : BLOCK_H);
  const I = totalMass * towerHeight * 0.01 + 1;

  // --- Integration (Semi-implicit Euler) ---
  const alpha = (gravityTorque + springTorque + dampingTorque + windTorque) / I;

  // Update velocity first (semi-implicit), then position
  state.towerAngularVelocity += alpha * dt;

  // Clamp angular velocity to prevent explosions
  state.towerAngularVelocity = Math.max(-P.MAX_ANGULAR_VELOCITY, Math.min(P.MAX_ANGULAR_VELOCITY, state.towerAngularVelocity));

  state.towerAngle += state.towerAngularVelocity * dt;

  // --- Collapse check (Strict Visual Bounds) ---
  let isVisuallyOffScreen = false;

  if (state.W <= 500) {
    // Mobile: exact boundary check (-10 to W + 10)
    for (let i = 0; i < state.blocks.length; i++) {
      const b = state.blocks[i];
      const sway = getBlockSwayX(b.y);
      const leftEdge = b.x + sway;
      const rightEdge = leftEdge + b.width;
      if (leftEdge < -10 || rightEdge > state.W + 10) {
        isVisuallyOffScreen = true;
        break;
      }
    }
  } else {
    // Desktop: collapse check against central arcade playfield lane boundaries
    const { laneLeft, laneRight } = getLaneBounds();

    for (let i = 0; i < state.blocks.length; i++) {
      const b = state.blocks[i];
      const sway = getBlockSwayX(b.y);
      const leftEdge = b.x + sway;
      const rightEdge = leftEdge + b.width;
      if (leftEdge < laneLeft - 10 || rightEdge > laneRight + 10) {
        isVisuallyOffScreen = true;
        break;
      }
    }
  }

  // --- Teetering Bricks Integration inside Fixed Timestep (Jenga Physics) ---
  for (let i = state.blocks.length - 1; i >= 0; i--) {
    const b = state.blocks[i];
    if (b && b.isTeetering) {
      const type = BLOCK_TYPES[b.typeId] || BLOCK_TYPES.normal;
      const tippedOver = PhysicsEngine.stepTeeteringBlock(b, type.friction, dt);

      if (tippedOver) {
        spawnFloatingText(state.W / 2, state.H * 0.4, "БЛОК УПАЛ! 💥", "#ff4d4d", 25 * uiScale());
        handleGameOver();
        break;
      }
    }
  }

  // Combine angle check (for short towers) with strict visual check (for tall towers)
  const criticalTilt = getCriticalTilt();
  if (Math.abs(state.towerAngle) > criticalTilt || isVisuallyOffScreen) {
    handleGameOver();
  }
}
