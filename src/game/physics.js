/**
 * Tetris Column Physics Engine with Harmonic Procedural Sway reactions.
 */
import { BLOCK_H, GROUND_MARGIN, CAMERA_TRAIL_FRACTION, PERFECT_TOLERANCE_BASE, BLOCK_TYPES, THEMES, PHYSICS_CONFIG } from "./config.js";
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

/**
 * Evaluates footprint stability of a block landing at blockX with width blockW on top of surface at blockY.
 * Returns overlap ratio, stability flag, corner pivot X, and slide/fall direction.
 */
export function evaluateBlockStability(blockX, blockW, blockY) {
  const blockLeft = blockX;
  const blockRight = blockX + blockW;
  const blockCenterX = blockX + blockW / 2;

  let supportLeft = Infinity;
  let supportRight = -Infinity;
  let foundSupport = false;

  for (let i = 0; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    if (Math.abs((b.y + BLOCK_H) - blockY) < 2) {
      const sway = getBlockSwayX(b.y);
      const bLeft = b.x + sway;
      const bRight = bLeft + b.width;

      if (blockLeft < bRight - 0.5 && blockRight > bLeft + 0.5) {
        supportLeft = Math.min(supportLeft, bLeft);
        supportRight = Math.max(supportRight, bRight);
        foundSupport = true;
      }
    }
  }

  // Base block at y=0 is supported by ground
  if (!foundSupport && blockY <= 0) {
    return { stable: true, overlapRatio: 1.0, pivotX: blockCenterX, slideDirection: 0 };
  }

  if (!foundSupport) {
    return { stable: false, overlapRatio: 0, pivotX: blockCenterX, slideDirection: blockCenterX > state.W / 2 ? 1 : -1 };
  }

  const overlapLeft = Math.max(blockLeft, supportLeft);
  const overlapRight = Math.min(blockRight, supportRight);
  const overlap = Math.max(0, overlapRight - overlapLeft);
  const overlapRatio = overlap / blockW;

  const minOverlap = PHYSICS_CONFIG.STABILITY_OVERLAP_MIN || 0.30;
  const isRightHang = (blockRight - supportRight) > (supportLeft - blockLeft);
  const slideDirection = isRightHang ? 1 : -1;
  const pivotX = isRightHang ? supportRight : supportLeft;

  return {
    stable: overlapRatio >= minOverlap,
    overlapRatio,
    pivotX,
    slideDirection
  };
}

/**
 * Calculates the cumulative Center of Mass (CoM) of the tower.
 * Returns true if tower is critically unbalanced.
 */
export function checkTowerCenterOfMass() {
  if (state.blocks.length <= 2) return false;

  const baseCenter = state.columnLeft + state.columnWidth / 2;
  let totalWeightedMass = 0;
  let weightedX = 0;

  for (let i = 0; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    const mass = b.mass || 1.0;
    const heightLeverage = 1.0 + (b.y / 600) * 1.0; // Smooth height leverage
    const effectiveMass = mass * heightLeverage;
    const centerX = b.x + b.width / 2;

    totalWeightedMass += effectiveMass;
    weightedX += centerX * effectiveMass;
  }

  if (totalWeightedMass <= 0) return false;

  const comX = weightedX / totalWeightedMass;
  const comOffset = Math.abs(comX - baseCenter) / state.columnWidth;
  const maxOffset = PHYSICS_CONFIG.COM_CRITICAL_OFFSET || 0.35;

  return comOffset > maxOffset;
}

export function handleDrop() {
  if (state.status !== "playing" || !state.mover) return;

  const type = BLOCK_TYPES[state.mover.typeId] || BLOCK_TYPES.normal;
  const visualTop = getVisualTopBlockBounds();

  let dropX = state.mover.x;
  let dropW = state.mover.width;

  const screenMidY = state.H - GROUND_MARGIN - ((state.mover ? state.mover.y : getTopFloorY()) - state.cameraY) - BLOCK_H / 2;

  const currentTopFloorY = getTopFloorY();
  let landingY = findSurfaceYForFootprint(dropX, dropX + dropW);
  const moverCenter = dropX + dropW / 2;
  const isPerfectPlacement = Math.abs(moverCenter - visualTop.centerX) <= PERFECT_TOLERANCE_BASE;

  if (isPerfectPlacement && landingY < currentTopFloorY) {
    landingY = currentTopFloorY;
  }

  const landingSway = getBlockSwayX(landingY);
  const localDropX = dropX - landingSway;

  if (landingY < currentTopFloorY - BLOCK_H * 0.8) {
    spawnDebris(dropX, state.mover ? state.mover.y : landingY, dropW, state.mover ? state.mover.color : "#fff", 1);
    handleGameOver();
    return;
  }

  // Calculate mass for this block
  const blockMass = state.mover.mass || (type.weight * (state.mover.isGolden ? 1.5 : 1.0));

  // Evaluate overlap stability footprint
  const stability = evaluateBlockStability(localDropX, dropW, landingY);
  const isUnstableDrop = !stability.stable;

  // Counter-stamping check: Check if new block stamps down any teetering block below
  for (let i = 0; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    if (b.isTeetering) {
      const isLandedOnRaisedSide = (b.tiltDir > 0 && moverCenter < b.tiltPivotX + landingSway) ||
                                   (b.tiltDir < 0 && moverCenter > b.tiltPivotX + landingSway);

      if (isLandedOnRaisedSide) {
        const massRatio = blockMass / (b.mass || 1.0);
        const stampImpulse = (PHYSICS_CONFIG.STAMP_RECOVERY_FORCE || 0.06) * Math.max(0.8, massRatio);

        b.tiltVel -= b.tiltDir * stampImpulse;
        b.localTilt -= b.tiltDir * (stampImpulse * 1.5);

        if ((b.tiltDir > 0 && b.localTilt <= 0) || (b.tiltDir < 0 && b.localTilt >= 0)) {
          b.isTeetering = false;
          b.localTilt = 0;
          b.tiltVel = 0;
          b.settled = true;
          spawnFloatingText(dropX + dropW / 2, screenMidY - 30, "ВЫРАВНЯЛ! 🔨✨", "#7fd8e8", 20 * uiScale());
          spawnParticles(dropX + dropW / 2, screenMidY, 16, ["#7fd8e8", "#ffffff"], 3.5, 500);
        }
      }
    }
  }

  const placed = {
    x: localDropX,
    width: dropW,
    y: landingY,
    typeId: state.mover.typeId,
    isGolden: state.mover.isGolden,
    color: state.mover.color,
    mass: blockMass,
    settled: !isUnstableDrop,
    isTeetering: isUnstableDrop,
    localTilt: isUnstableDrop ? stability.slideDirection * 0.02 : 0,
    tiltVel: isUnstableDrop ? stability.slideDirection * 0.001 : 0,
    tiltDir: stability.slideDirection,
    tiltPivotX: stability.pivotX,
    squishX: 1.12,
    squishY: 0.90,
    squishVelX: 0,
    squishVelY: 0
  };

  if (isUnstableDrop) {
    state.combo = 0;
    state.feverMode = false;

    spawnFloatingText(dropX + dropW / 2, screenMidY, "ЗАВАЛИВАЕТСЯ! ⚠️", "#ffa834", 18 * uiScale());
    spawnParticles(dropX + dropW / 2, screenMidY, 12, ["#ffa834", "#ffffff"], 3, 400);
    triggerShake(8);
    AudioEngine.playNormalDropSound();
  } else if (isPerfectPlacement) {
    state.combo++;
    if (state.combo >= 4) {
      state.feverMode = true;
    }

    state.towerAngularVelocity = -state.towerAngle * 1.8;

    // Flatten all lower teetering blocks on perfect combo
    for (let i = 0; i < state.blocks.length; i++) {
      if (state.blocks[i].isTeetering) {
        state.blocks[i].isTeetering = false;
        state.blocks[i].localTilt = 0;
        state.blocks[i].tiltVel = 0;
        state.blocks[i].settled = true;
      }
    }

    const comboText = state.combo >= 4 ? `ГИПЕР-КОМБО ×${state.combo}! 🔥` : state.combo >= 2 ? `ОТЛИЧНО! ×${state.combo}` : "ИДЕАЛЬНЫЙ БАЛАНС! ✨";
    const comboColor = state.feverMode ? "#ffd700" : "#ffe08a";

    spawnFloatingText(dropX + dropW / 2, screenMidY, comboText, comboColor, (state.combo >= 4 ? 22 : 18) * uiScale());
    spawnParticles(dropX + dropW / 2, screenMidY, 18, [type.palette[0], "#ffffff", "#ffe08a"], 3.5, 500);
    AudioEngine.playPerfectSound(state.combo);
  } else {
    state.combo = 0;
    state.feverMode = false;

    const isCounterDrop = (state.towerAngle > 0.015 && moverCenter < visualTop.centerX - 4) ||
                          (state.towerAngle < -0.015 && moverCenter > visualTop.centerX + 4);

    if (isCounterDrop) {
      state.towerAngularVelocity = -state.towerAngle * 1.5;
      
      spawnFloatingText(dropX + dropW / 2, screenMidY, "СПАСЕНИЕ БАЛАНСА! ⚖️", "#7fd8e8", 18 * uiScale());
      spawnParticles(dropX + dropW / 2, screenMidY, 14, ["#7fd8e8", "#ffffff"], 3.5, 500);
      AudioEngine.playPerfectSound(1);
    } else {
      AudioEngine.playNormalDropSound();

      const pivotX = state.columnLeft + state.columnWidth / 2;
      const misalignment = moverCenter - pivotX;
      
      const towerHeight = Math.max(BLOCK_H, getTopFloorY());
      const totalBlocks = state.blocks.length;
      const momentOfInertia = totalBlocks * towerHeight * 0.01 + 1;
      const impulse = (misalignment * blockMass * (PHYSICS_CONFIG.DROP_IMPULSE_FACTOR * 0.35)) / momentOfInertia;

      state.towerAngularVelocity += impulse;
      state.towerAngularVelocity = Math.max(-PHYSICS_CONFIG.MAX_ANGULAR_VELOCITY, Math.min(PHYSICS_CONFIG.MAX_ANGULAR_VELOCITY, state.towerAngularVelocity));

      triggerShake(type.id === "heavy" ? 8 : 4);
    }
  }

  const isInsideGuideLines = (dropX >= state.columnLeft - 4) && (dropX + dropW <= state.columnRight + 4);

  let base = 1;
  if (state.combo >= 2) base += state.combo;

  let multiplier = type.scoreMult;
  if (state.feverMode) multiplier *= 2;
  if (state.mover.isGolden) multiplier *= 2;
  if (isInsideGuideLines) multiplier *= 2;
  multiplier = Math.min(multiplier, 4);

  const gained = Math.round(base * multiplier);
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

  // Check cumulative Center of Mass
  if (checkTowerCenterOfMass()) {
    spawnFloatingText(state.W / 2, screenMidY - 40, "БАШНЯ ПЕРЕКОШЕНА! 💥", "#ff4d4d", 22 * uiScale());
    handleGameOver();
    return;
  }

  updateCameraTarget(placed.y);
  checkMilestone();
  spawnMover();
}


function updateCameraTarget(topY) {
  if (topY - state.targetCameraY > state.H * CAMERA_TRAIL_FRACTION) {
    state.targetCameraY = topY - state.H * CAMERA_TRAIL_FRACTION;
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
    triggerShake(6);
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
