/**
 * Tetris Column Physics Engine with Harmonic Procedural Sway reactions.
 */
import { BLOCK_H, PERFECT_TOLERANCE_BASE, BLOCK_TYPES, THEMES, PHYSICS_CONFIG } from "./config.js";
import {
  state,
  spawnMover,
  triggerShake,
  triggerScreenFlash,
  spawnDebris,
  spawnParticles,
  spawnFloatingText,
  getTopFloorY,
  getFloorCount,
  getTopFloorSwayOffset,
  getBlockSwayX,
  uiScale
} from "./gameState.js";
import { AudioEngine } from "../audio/audioEngine.js";
import { Platform } from "../sdk/youtubeSdk.js";
import { updateHUD } from "../ui/uiManager.js";

/**
 * Calculates the exact VISUAL screen bounds of the top block taking into account harmonic tower sway.
 */
export function getVisualTopBlockBounds() {
  if (state.blocks.length === 0) {
    return { left: state.columnLeft, right: state.columnRight, centerX: state.W / 2, width: state.columnWidth };
  }

  const top = state.blocks[state.blocks.length - 1];
  const topFloorSway = getTopFloorSwayOffset();
  const visualCenterX = top.x + top.width / 2 + topFloorSway;

  return {
    left: visualCenterX - top.width / 2,
    right: visualCenterX + top.width / 2,
    centerX: visualCenterX,
    width: top.width
  };
}

/**
 * Finds the highest supporting surface Y coordinate under footprint [leftX, rightX].
 */
export function findSurfaceYForFootprint(leftX, rightX) {
  let highestY = 0;

  // Scan ALL blocks in the tower to find the MAXIMUM supporting surface Y coordinate.
  // Avoids breaking early if array order differs from height order or if blocks overlap on sides.
  for (let i = 0; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    const sway = getBlockSwayX(b.y); // match the block's actual on-screen (swayed) position
    const blockLeft = b.x + sway;
    const blockRight = blockLeft + b.width;

    // Subpixel tolerance (0.5px) ensures any real footprint overlap lands cleanly without false misses
    if (leftX < blockRight - 0.5 && rightX > blockLeft + 0.5) {
      const surfaceY = b.y + BLOCK_H;
      if (surfaceY > highestY) highestY = surfaceY;
    }
  }

  return highestY;
}

export function handleDrop() {
  if (state.status !== "playing" || !state.mover) return;

  const type = BLOCK_TYPES[state.mover.typeId] || BLOCK_TYPES.normal;
  const visualTop = getVisualTopBlockBounds();

  let dropX = state.mover.x;
  let dropW = state.mover.width;

  const screenMidY = state.H - 60 - ((state.mover ? state.mover.y : getTopFloorY()) - state.cameraY) - BLOCK_H / 2;

  // 4. Find highest supporting surface Y underneath footprint
  const currentTopFloorY = getTopFloorY();
  let landingY = findSurfaceYForFootprint(dropX, dropX + dropW);
  const moverCenter = dropX + dropW / 2;
  const isPerfectPlacement = Math.abs(moverCenter - visualTop.centerX) <= PERFECT_TOLERANCE_BASE;

  // If player achieved a Perfect placement or landed on top of the tower stack,
  // guarantee landingY is at least currentTopFloorY to prevent false Game Over
  if (isPerfectPlacement && landingY < currentTopFloorY) {
    landingY = currentTopFloorY;
  }

  // 3. Convert absolute dropX to local un-swayed coordinate based on landingY sway.
  const landingSway = getBlockSwayX(landingY);
  const localDropX = dropX - landingSway;

  // If block lands below top floor level (because player dropped it into empty space),
  // it means the block MISSED the top of the tower! Trigger Game Over!
  if (landingY < currentTopFloorY - BLOCK_H * 0.8) {
    spawnDebris(dropX, state.mover ? state.mover.y : landingY, dropW, state.mover ? state.mover.color : "#fff", 1);
    handleGameOver();
    return;
  }

  const placed = {
    x: localDropX,
    width: dropW,
    y: landingY,
    typeId: state.mover.typeId,
    isGolden: state.mover.isGolden,
    color: state.mover.color,
    squishX: 1.12, // Subtle bounce to prevent jarring size changes
    squishY: 0.90,
    squishVelX: 0,
    squishVelY: 0
  };

  const floorCount = getFloorCount();

  if (isPerfectPlacement) {
    state.combo++;
    if (state.combo >= 4) {
      state.feverMode = true;
    }

    // PERFECT DROP STABILIZES TOWER SWAY SMOOTHLY!
    // Set smooth returning velocity to straighten tower over time without ANY 1-frame teleportation jumps!
    state.towerAngularVelocity = -state.towerAngle * 1.8;

    const comboText = state.combo >= 4 ? `ГИПЕР-КОМБО ×${state.combo}! 🔥` : state.combo >= 2 ? `ОТЛИЧНО! ×${state.combo}` : "ИДЕАЛЬНЫЙ БАЛАНС! ✨";
    const comboColor = state.feverMode ? "#ffd700" : "#ffe08a";

    // Particles use absolute coordinates
    spawnFloatingText(dropX + dropW / 2, screenMidY, comboText, comboColor, (state.combo >= 4 ? 22 : 18) * uiScale());
    spawnParticles(dropX + dropW / 2, screenMidY, 18, [type.palette[0], "#ffffff", "#ffe08a"], 3.5, 500);
    AudioEngine.playPerfectSound(state.combo);
  } else {
    state.combo = 0;
    state.feverMode = false;

    // Check if player placed block on the opposite side of tilt to counter-balance
    const isCounterDrop = (state.towerAngle > 0.015 && moverCenter < visualTop.centerX - 4) ||
                          (state.towerAngle < -0.015 && moverCenter > visualTop.centerX + 4);

    if (isCounterDrop) {
      // Counter-balance placement smoothly brakes wobble & pulls tower back towards center
      state.towerAngularVelocity = -state.towerAngle * 1.5;
      
      spawnFloatingText(dropX + dropW / 2, screenMidY, "БАЛАНС! ⚖️", "#7fd8e8", 18 * uiScale());
      spawnParticles(dropX + dropW / 2, screenMidY, 14, ["#7fd8e8", "#ffffff"], 3.5, 500);
      AudioEngine.playPerfectSound(1);
    } else {
      AudioEngine.playNormalDropSound();

      // Misalignment is calculated relative to the BASE pivot (column center), 
      // NOT the swaying top block. This guarantees that placing a block on the right 
      // side of the screen ALWAYS pushes the tower right, which matches player intuition!
      const pivotX = state.columnLeft + state.columnWidth / 2;
      const misalignment = moverCenter - pivotX;
      
      const mass = type.weight * (state.mover.isGolden ? 1.5 : 1.0);
      
      // Moment of Inertia grows with tower height, so tall towers are harder to disturb
      const towerHeight = Math.max(BLOCK_H, getTopFloorY());
      const totalBlocks = state.blocks.length;
      const momentOfInertia = totalBlocks * towerHeight * 0.01 + 1;
      const impulse = (misalignment * mass * (PHYSICS_CONFIG.DROP_IMPULSE_FACTOR * 0.35)) / momentOfInertia;

      state.towerAngularVelocity += impulse;
      state.towerAngularVelocity = Math.max(-PHYSICS_CONFIG.MAX_ANGULAR_VELOCITY, Math.min(PHYSICS_CONFIG.MAX_ANGULAR_VELOCITY, state.towerAngularVelocity));

      triggerShake(type.id === "heavy" ? 8 : 4);
    }
  }

  // Score calculation
  let gained = 1;
  if (state.combo >= 2) gained += state.combo;
  if (state.feverMode) gained *= 2;
  gained = Math.round(gained * type.scoreMult * (state.mover.isGolden ? 2 : 1));

  // Guide lines precision bonus: block lands completely inside the visible column guide lines
  const isInsideGuideLines = (dropX >= state.columnLeft - 4) && (dropX + dropW <= state.columnRight + 4);
  if (isInsideGuideLines) {
    gained *= 2; // 2x score multiplier for keeping within visible guide lines!
  }
  state.score += gained;

  if (state.mover.isGolden) {
    spawnFloatingText(dropX + dropW / 2, screenMidY - 24, `⭐ +${gained}`, "#ffd54a", 22 * uiScale());
    spawnParticles(dropX + dropW / 2, screenMidY, 24, ["#ffd54a", "#fff3c4", "#ffffff"], 4.5, 600);
    AudioEngine.playGoldenSound();
  } else if (isInsideGuideLines && !isPerfectPlacement) {
    spawnFloatingText(dropX + dropW / 2, screenMidY - 20, `ВНУТРИ КОЛОННЫ! 🎯 +${gained}`, "#9fe8c8", 17 * uiScale());
  } else if (!isPerfectPlacement) {
    spawnFloatingText(dropX + dropW / 2, screenMidY, `+${gained}`, "#ffffff", 16 * uiScale());
  }

  state.blocks.push(placed);

  updateCameraTarget(placed.y);
  checkMilestone();
  spawnMover();
}


function updateCameraTarget(topY) {
  if (topY - state.targetCameraY > state.H * 0.55) {
    state.targetCameraY = topY - state.H * 0.55;
  }
}

export function checkMilestone() {
  const floor = getFloorCount();
  if (floor > 0 && floor % 10 === 0 && floor !== state.lastMilestoneFloor) {
    state.lastMilestoneFloor = floor;
    const themeIdx = Math.min(Math.floor(floor / 10), THEMES.length - 1);
    if (!state.milestoneBanner) {
      state.milestoneBanner = {
        text: `Этаж ${floor}! ${THEMES[themeIdx].name}`,
        life: 2400,
        maxLife: 2400
      };
    }
    triggerShake(10);
    triggerScreenFlash(THEMES[themeIdx].accent, 0.35);
    spawnParticles(state.W / 2, state.H * 0.3, 35, [THEMES[themeIdx].accent, "#ffffff"], 4.5, 1000);
    AudioEngine.playMilestoneSound();
  }
}

export function handleGameOver() {
  state.status = "over";
  state.finalFloor = getFloorCount(); // Save exact floor reached BEFORE clearing blocks!
  state.best = Math.max(state.best, state.score);
  Platform.sendScore(state.score);
  Platform.saveData({ best: state.best, maxUnlockedLevel: state.maxUnlockedLevel });
  
  // Epic Collapse Animation: blocks scatter in different directions down off the screen
  if (state.blocks.length > 0) {
    const tiltDir = state.towerAngle > 0 ? 1 : -1;
    const totalCount = state.blocks.length;

    for (let i = 0; i < totalCount; i++) {
      const b = state.blocks[i];
      const swayedX = b.x + b.width / 2 + getBlockSwayX(b.y);
      
      // Scatter left and right in different directions
      const sideDir = (i % 2 === 0 ? 1 : -1);
      const scatterVx = (Math.random() * 6 + 2) * sideDir + (tiltDir * 2);
      // Negative Y velocity = moves DOWNWARDS towards bottom of screen in renderer coords!
      const scatterVy = -Math.random() * 6 - 2;

      spawnDebris(swayedX - b.width / 2, b.y, b.width, b.color, sideDir);
      
      const d = state.debris[state.debris.length - 1];
      d.vx = scatterVx;
      d.vy = scatterVy;
      d.rot = state.towerAngle;
      d.vrot = (Math.random() - 0.5) * 0.35; // Dynamic rotation
    }
    state.blocks = []; // Clear the tower
  }

  triggerShake(20);
  triggerScreenFlash("#ff4d4d", 0.6);
  AudioEngine.playGameOverSound();
  updateHUD();
}
