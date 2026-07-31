/**
 * Central state container for Cat Tower Stack game with Harmonic Tower Sway Engine.
 */
import {
  BLOCK_TYPES, UNLOCK_ORDER, LEVELS,
  BLOCK_H, GROUND_MARGIN, CAMERA_TRAIL_FRACTION, PHYSICS_CONFIG,
  getLevelBlend, lerp
} from "./config.js";
import { PhysicsWorld } from "./physics/PhysicsWorld.js";
import { Block } from "./physics/Block.js";

/**
 * Calculates effective mass of a block based on cat type, golden status, and block width ratio.
 */
export function calculateBlockMass(typeId, isGolden, blockWidth) {
  const type = BLOCK_TYPES[typeId] || BLOCK_TYPES.normal;
  const baseMass = type.mass || type.weight || 1.0;
  const colW = state.columnWidth || 140;
  const fraction = Math.max(0.1, blockWidth / colW);
  let mass = baseMass * Math.pow(fraction, PHYSICS_CONFIG.WEIGHT_LENGTH_EXPONENT || 1.4);
  if (isGolden) mass *= 1.5;
  return mass;
}
import { AudioEngine } from "../audio/audioEngine.js";
import { Platform } from "../sdk/youtubeSdk.js";

export const state = {
  status: "menu", // menu | playing | paused | over
  blocks: [],
  debris: [],
  particles: [],
  floatingTexts: [],
  mover: null,

  // Parallel physics world for future physics engine
  physicsWorld: new PhysicsWorld(),


  // Building Column boundaries
  columnWidth: 200,
  columnLeft: 0,
  columnRight: 0,

  // Level & Checkpoint progression
  maxUnlockedLevel: 1,
  selectedStartLevel: 1,
  currentLevel: 1,

  // Camera & Screen Smooth Lerp
  cameraY: 0,
  targetCameraY: 0,

  // Physical Inverted Pendulum Sway State
  towerAngle: 0,
  towerAngularVelocity: 0,
  wind: 0,
  swaySens: 0.9,

  // Scoring & Stats
  score: 0,
  best: 0,
  combo: 0,
  feverMode: false,

  // Gift & Milestone counters
  lastMilestoneFloor: 0,
  gameOverTimer: 0, // Timer for showing game over screen
  milestoneBanner: null,

  // Visual Juice & Collapse Animation
  collapseTimer: 0,
  shakeMag: 0,
  screenFlash: null,
  unlockAnnounced: {},

  // Screen metrics
  W: window.innerWidth,
  H: window.innerHeight,
  DPR: 1
};

/**
 * Scales UI/canvas font sizes relative to real screen width, so text tuned to look right on a
 * ~390px-wide phone doesn't clip near the edges on a 320px budget Android phone, and doesn't look
 * undersized on a larger device. Clamped so it never swings too far in either direction.
 */
export function uiScale() {
  return Math.max(0.82, Math.min(1.15, state.W / 390));
}

/**
 * Single source of truth for the desktop "arcade lane" width/bounds.
 * Was previously the same inline formula copy-pasted in getMoverLimits,
 * getCriticalTilt, gameLoop's collapse check, and twice in renderer.js —
 * five places that would silently drift apart the moment one was edited.
 */
export function getLaneBounds() {
  const laneWidth = Math.min(state.W * 0.7, Math.max(480, state.H * 0.65));
  return {
    laneWidth,
    laneLeft: state.W / 2 - laneWidth / 2,
    laneRight: state.W / 2 + laneWidth / 2
  };
}

export function updateColumnBounds() {
  if (state.W <= 500) {
    // Mobile: exact experience approved by user (max 140px)
    state.columnWidth = Math.max(120, Math.min(state.W * 0.35, 140));
  } else {
    // Desktop: scaled column width for desktop monitors (~150px - 195px)
    state.columnWidth = Math.max(150, Math.min(state.H * 0.22, 195));
  }
  state.columnLeft = state.W / 2 - state.columnWidth / 2;
  state.columnRight = state.W / 2 + state.columnWidth / 2;
}

export function getMoverLimits() {
  if (state.W <= 500) {
    // Mobile: full screen width
    const w = state.mover ? state.mover.width : 100;
    return {
      left: -w * 0.9,
      right: state.W - w * 0.1,
      spawnLeft: -w,
      spawnRight: state.W
    };
  } else {
    // Desktop: focused central arcade playfield lane
    const { laneLeft, laneRight } = getLaneBounds();
    const w = state.mover ? state.mover.width : 100;
    return {
      left: laneLeft - w * 0.9,
      right: laneRight - w * 0.1,
      spawnLeft: laneLeft - w,
      spawnRight: laneRight
    };
  }
}

/**
 * Returns the highest top surface Y coordinate of the tower stack.
 */
export function getTopFloorY() {
  if (state.blocks.length === 0) return 0;
  let maxY = 0;
  for (const b of state.blocks) {
    if (b.y + BLOCK_H > maxY) maxY = b.y + BLOCK_H;
  }
  return maxY;
}

export function getFloorCount() {
  const topY = getTopFloorY();
  const floorInRun = Math.max(0, Math.floor(topY / BLOCK_H) - 1);
  return (state.startFloor || 0) + floorInRun;
}

/**
 * Unified sway offset for any block at height y.
 * Used by BOTH renderer and drop logic — they MUST be identical.
 */
export function getBlockSwayX(y) {
  return Math.sin(state.towerAngle) * y;
}

/**
 * Convenience: sway offset of the top block.
 */
export function getTopFloorSwayOffset() {
  if (state.blocks.length === 0) return 0;
  const topBlock = state.blocks[state.blocks.length - 1];
  return getBlockSwayX(topBlock.y);
}

/**
 * Dynamic critical tilt: tall towers must collapse at a smaller angle
 * so they don't sway completely off the screen.
 */
export function getCriticalTilt() {
  const towerHeight = Math.max(BLOCK_H, getTopFloorY());
  const baseCritical = 0.40; // From config (CRITICAL_TILT)

  if (state.W <= 500) {
    // Mobile: exact experience (max 30% screen width sway)
    const maxAllowedSway = state.W * 0.30;
    if (towerHeight > maxAllowedSway) {
      return Math.min(baseCritical, Math.asin(maxAllowedSway / towerHeight));
    }
    return baseCritical;
  } else {
    // Desktop: responsive critical tilt for central arcade playfield lane
    const { laneWidth } = getLaneBounds();
    const maxAllowedSway = laneWidth * 0.30;
    if (towerHeight > maxAllowedSway) {
      return Math.min(baseCritical, Math.asin(maxAllowedSway / towerHeight));
    }
    return baseCritical;
  }
}

export function resetGameState() {
  updateColumnBounds();

  const lvlCfg = LEVELS[Math.min(state.selectedStartLevel - 1, LEVELS.length - 1)];
  const startFloor = lvlCfg ? lvlCfg.startFloor : 0;
  state.startFloor = startFloor;
  state.currentLevel = state.selectedStartLevel;

  state.blocks = [new Block({
    x: state.columnLeft,
    width: state.columnWidth,
    y: 0,
    typeId: "normal",
    isGolden: false,
    color: "#f4e4c1",
    mass: calculateBlockMass("normal", false, state.columnWidth),
    settled: true
  })];

  // Reset parallel physics world
  state.physicsWorld = new PhysicsWorld();
  state.physicsWorld.addBody(state.blocks[0]);

  state.debris = [];
  state.particles = [];
  state.floatingTexts = [];
  state.collapseTimer = 0;

  const topY = getTopFloorY();
  state.targetCameraY = Math.max(0, topY - state.H * CAMERA_TRAIL_FRACTION);
  state.cameraY = state.targetCameraY;

  state.towerAngle = 0;
  state.towerAngularVelocity = 0;
  state.wind = 0;

  state.score = startFloor * 2;
  state.combo = 0;
  state.feverMode = false;

  state.lastMilestoneFloor = startFloor;
  state.gameOverTimer = 1500; // 1.5 seconds default delay before Game Over screen
  state.milestoneBanner = null;
  state.shakeMag = 0;
  state.screenFlash = null;
  state.unlockAnnounced = {};

  spawnMover();
}

export function spawnMover() {
  if (state.status !== "playing") return;

  const floor = getFloorCount();
  const blend = getLevelBlend(floor);
  const lvlCfg = blend.from; // the level we're "in" right now for badges/checkpoints — unchanged semantics
  state.currentLevel = lvlCfg.level;

  // Unlock checkpoint if reached new level
  if (lvlCfg.level > state.maxUnlockedLevel) {
    state.maxUnlockedLevel = lvlCfg.level;
    Platform.saveData({ best: state.best, maxUnlockedLevel: state.maxUnlockedLevel });
    state.milestoneBanner = {
      text: `🎉 ЧЕКПОИНТ! Разблокирован Уровень ${lvlCfg.level}: ${lvlCfg.name}!`,
      life: 2500,
      maxLife: 2500
    };
    AudioEngine.playUnlockSound();
  }

  // Check newly unlocked cat types
  for (const id of UNLOCK_ORDER) {
    if (floor === BLOCK_TYPES[id].unlockFloor && !state.unlockAnnounced[id]) {
      state.unlockAnnounced[id] = true;
      if (!state.milestoneBanner) {
        state.milestoneBanner = {
          text: "Новый кот: " + BLOCK_TYPES[id].label + "!",
          life: 1800,
          maxLife: 1800
        };
      }
      AudioEngine.playUnlockSound();
    }
  }

  // Wind & sway sensitivity ramp smoothly across the transition zone (see getLevelBlend)
  // instead of snapping the instant the floor threshold is crossed.
  state.wind = (Math.random() - 0.5) * 2 * lerp(blend.from.windFactor, blend.to.windFactor, blend.t);
  state.swaySens = lerp(blend.from.swaySens, blend.to.swaySens, blend.t);

  let chosenTypeId = "normal";
  let isGolden = false;

  const goldenChance = Math.min(0.08 + floor * 0.003, 0.18);
  isGolden = Math.random() < goldenChance;

  const pool = ["normal"];
  for (const id of UNLOCK_ORDER) {
    if (floor >= BLOCK_TYPES[id].unlockFloor) pool.push(id);
  }
  if (pool.length > 1) {
    chosenTypeId = Math.random() < 0.45 ? "normal" : pool[1 + Math.floor(Math.random() * (pool.length - 1))];
  }

  // 5 high-contrast size tiers (0.26 to 1.0 = ~35px to 140px, almost 4x contrast)
  let sizeFractions = [0.26, 0.45, 0.65, 0.85, 1.0];
  
  // Size profiles per cat personality with high contrast
  if (chosenTypeId === "light") {
    sizeFractions = [0.26, 0.45, 0.65]; // Slender, light & compact
  } else if (chosenTypeId === "heavy") {
    sizeFractions = [0.65, 0.85, 1.0];  // Wide, heavy & solid
  } else if (chosenTypeId === "slippery") {
    sizeFractions = [0.26, 0.45];        // Ultra-mini & swift
  } else if (chosenTypeId === "sticky") {
    sizeFractions = [0.45, 0.65, 0.85];  // Balanced sticky
  }

  const chosenFraction = sizeFractions[Math.floor(Math.random() * sizeFractions.length)];
  const moverWidth = Math.round(state.columnWidth * chosenFraction);

  const fromLeft = Math.random() < 0.5;
  const t = BLOCK_TYPES[chosenTypeId] || BLOCK_TYPES.normal;
  const speed = Math.min(lerp(blend.from.speedBase, blend.to.speedBase, blend.t) + floor * 0.08, 9.5) * t.speedMult;

  const type = BLOCK_TYPES[chosenTypeId] || BLOCK_TYPES.normal;
  const color = type.palette[state.blocks.length % type.palette.length];
  const spawnY = getTopFloorY();

  // On desktop, spawn within central arcade lane bounds for focused gameplay
  const limits = getMoverLimits();
  const spawnX = fromLeft ? limits.spawnLeft : limits.spawnRight;

  state.mover = {
    kind: "block",
    typeId: chosenTypeId,
    isGolden,
    x: spawnX,
    width: moverWidth,
    y: spawnY,
    dir: fromLeft ? 1 : -1,
    speed,
    color,
    // Bug fix: this was previously never set, so physics.js's handleDrop() always fell back
    // to a flat type.weight for every real dropped block (only the permanent base block ever
    // got the real width-scaled mass) — the "longer blocks are significantly heavier" design
    // intent was dead for ~99% of actual gameplay, quietly weakening counter-stamping.
    mass: calculateBlockMass(chosenTypeId, isGolden, moverWidth),
    squishX: 1,
    squishY: 1
  };
}

export function triggerShake(amount) {
  state.shakeMag = Math.max(state.shakeMag, amount);
}

export function triggerScreenFlash(color = "#ffffff", alpha = 0.3) {
  state.screenFlash = { color, alpha };
}

export function spawnDebris(x, y, width, color, dir) {
  state.debris.push({
    x,
    y,
    width,
    height: BLOCK_H,
    color,
    vx: dir * (2.0 + Math.random() * 2.5),
    vy: -3 - Math.random() * 2,
    rot: 0,
    vrot: dir * (0.08 + Math.random() * 0.12)
  });
}

export function spawnParticles(x, y, count, colors, speedMax, life) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.8 + Math.random() * speedMax;
    state.particles.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 1.5,
      life,
      maxLife: life,
      size: 2.5 + Math.random() * 3.5,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
}

export function spawnFloatingText(x, y, text, color, size) {
  state.floatingTexts.push({ x, y, text, color, size, life: 1100, maxLife: 1100 });
}

export function resetProgress() {
  state.best = 0;
  state.maxUnlockedLevel = 1;
  state.selectedStartLevel = 1;
  Platform.saveData({ best: 0, maxUnlockedLevel: 1 });
}
