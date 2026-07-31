/**
 * Unified Physics Interface for Cat Tower Stack.
 * Delegates calculations to modular solvers in src/game/physics/
 */
import { BLOCK_H, GROUND_MARGIN, CAMERA_TRAIL_FRACTION, PERFECT_TOLERANCE_BASE, BLOCK_TYPES, THEMES } from "./config.js";
import {
  state,
  spawnMover,
  triggerShake,
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
import { PhysicsEngine } from "./physics/PhysicsEngine.js";
import { Block } from "./physics/Block.js";

export { PhysicsEngine };

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

export function findSurfaceYForFootprint(leftX, rightX) {
  return PhysicsEngine.findSurfaceYForFootprint(state.blocks, state.towerAngle, leftX, rightX);
}

export function evaluateBlockStability(blockX, blockW, blockY) {
  return PhysicsEngine.evaluateBlockStability(state.blocks, state.towerAngle, blockX, blockW, blockY, state.W);
}

export function checkTowerCenterOfMass() {
  return PhysicsEngine.checkTowerCenterOfMass(state.blocks, state.columnLeft, state.columnWidth);
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
    triggerTowerCollapse(true); // User requested full tower collapse on miss
    return;
  }

  const blockMass = state.mover.mass || (type.weight * (state.mover.isGolden ? 1.5 : 1.0));
  // IMPORTANT: pass the block's real on-screen (absolute) position — dropX — not the
  // sway-corrected localDropX used for storage. Support blocks are compared using their
  // real on-screen position too (see StabilitySolver), so both sides must be in the same
  // coordinate frame. Passing localDropX here made every stability check silently wrong
  // whenever the tower had any lean (state.towerAngle != 0), which is most of a real run —
  // a visually perfect drop could be scored as 0% overlap purely due to tower height/lean.
  const stability = evaluateBlockStability(dropX, dropW, landingY);
  const isUnstableDrop = !stability.stable;

  // Counter-stamping check using CatModifierSystem via PhysicsEngine
  for (let i = 0; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    if (b.isTeetering) {
      // b.tiltPivotX is stored LOCAL (like b.x) — recompute where the pivot corner
      // actually sits on screen right now, using the support's own y (b.y - BLOCK_H),
      // the same convention every other block's sway is derived from. The previous
      // version compared a frozen absolute snapshot from placement time against sway
      // computed at the wrong height (the new block's landing y, not the support's) —
      // it silently drifted wrong the moment towerAngle changed after the block started teetering.
      const pivotAbsX = b.tiltPivotX + getBlockSwayX(b.y - BLOCK_H);
      const isLandedOnRaisedSide = (b.tiltDir > 0 && moverCenter < pivotAbsX) ||
                                   (b.tiltDir < 0 && moverCenter > pivotAbsX);

      if (isLandedOnRaisedSide) {
        const flattened = PhysicsEngine.applyCounterStamping(b, blockMass);
        if (flattened) {
          spawnFloatingText(dropX + dropW / 2, screenMidY - 30, "ВЫРАВНЯЛ! 🔨✨", "#7fd8e8", 20 * uiScale());
          spawnParticles(dropX + dropW / 2, screenMidY, 16, ["#7fd8e8", "#ffffff"], 3.5, 500);
        }
      }
    }
  }

  const placed = new Block({
    x: localDropX,
    width: dropW,
    y: landingY,
    typeId: state.mover.typeId,
    isGolden: state.mover.isGolden,
    color: state.mover.color,
    mass: blockMass,
    settled: !isUnstableDrop
  });
  
  placed.isTeetering = isUnstableDrop;
  placed.localTilt = isUnstableDrop ? stability.slideDirection * 0.02 : 0;
  placed.tiltVel = isUnstableDrop ? stability.slideDirection * 0.001 : 0;
  placed.tiltDir = stability.slideDirection;
  // Stored LOCAL (unswayed), matching how .x is stored — subtract the sway that was
  // present at the support's own y at this moment, so it can be correctly re-swayed
  // later using whatever towerAngle is current when it's actually used.
  placed.tiltPivotX = stability.pivotX - getBlockSwayX(landingY - BLOCK_H);
  placed.squishX = 1.12;
  placed.squishY = 0.90;

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
      
      // Delegated to TowerTiltSolver via PhysicsEngine (Stage 3 attenuation)
      const impulse = PhysicsEngine.calculateDropImpulse(misalignment, blockMass, totalBlocks, towerHeight);

      state.towerAngularVelocity += impulse;
      state.towerAngularVelocity = Math.max(-PhysicsEngine.config.MAX_ANGULAR_VELOCITY, Math.min(PhysicsEngine.config.MAX_ANGULAR_VELOCITY, state.towerAngularVelocity));

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
  state.physicsWorld.addBody(placed);

  // We no longer trigger instant collapse on CoM offset.
  // Instead, the Center of Mass solver provides comX for gravityTorque in gameLoop.js,
  // making the tower lean naturally until it falls over.

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

/**
 * Stage 4 Multi-Phase Collapse Trigger:
 * Transitions state to "collapsing", starts block physical falling animation,
 * and defers Game Over screen until blocks finish falling off-screen!
 */
export function triggerTowerCollapse(explodeTower = true) {
  if (state.status === "collapsing" || state.status === "over") return;

  state.status = "collapsing";
  state.finalFloor = getFloorCount();
  state.best = Math.max(state.best, state.score);
  Platform.sendScore(state.score);
  Platform.saveData({ best: state.best, maxUnlockedLevel: state.maxUnlockedLevel });

  triggerShake(14);

  if (explodeTower) {
    state.targetCameraY = 0; // Pan camera down to ground so player SEES the full tower collapse!
    PhysicsEngine.startTowerCollapse(state.blocks, state.towerAngle);
  }
}

export function handleGameOver(explodeTower = true) {
  triggerTowerCollapse(explodeTower);
}
