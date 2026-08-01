/**
 * Game constants, levels, cat block configurations, power-ups, themes, and Tetris Column settings.
 */

export const BLOCK_H = 46;
export const PERFECT_TOLERANCE_BASE = 10;

// Single source of truth for two numbers that were previously duplicated as raw
// literals in gameState.js, gameLoop.js, physics.js and renderer.js (60 and 0.55).
export const GROUND_MARGIN = 60;       // px gap kept between the tower base and the very bottom of the screen
export const CAMERA_TRAIL_FRACTION = 0.55; // fraction of screen height the tower can grow before the camera starts following

// ─── Active Cat Trajectory — Gameplay Constants ─────────────────────────────
// Source of truth for the airborne cat mechanic. All values are gameplay rules,
// intentionally independent of camera presentation parameters.
// Units: fractions are relative to viewport H; block-relative values use BLOCK_H.
export const ACTIVE_CAT_TRAJECTORY = {
  // ── Screen margins (trajectory ceiling) ──
  ZONE_TOP_RATIO:       0.08,   // fraction of H reserved above trajectory (notch/status bar)
  ZONE_TOP_MIN_PX:      55,     // absolute minimum top margin in px

  // ── Safe zone (gap between cat and tower) ──
  // Clearance = gameplay gap + cat visual extent. Expressed in BLOCK_H multiples
  // so it scales naturally with block size changes.
  CLEARANCE_BLOCKS:     1.0,    // minimum gap between cat bottom and tower top (1× BLOCK_H = 46px)

  // Cat visual extent below its center point (body/2 + ears overshoot)
  CAT_VISUAL_EXTENT_PX: 30,     // ≈ (BLOCK_H + 14 ears) / 2

  // ── Trajectory limits ──
  MIN_ARC_HEIGHT_PX:    46,     // minimum vertical arc sweep (= 1 BLOCK_H)
  MAX_FLOOR_RATIO:      0.40,   // trajectory floor never goes below 40% of screen

  // ── Movement (k-system: values per frame at 60 fps) ──
  PHASE_SPEED:          0.025,  // oscillation speed (rad per k-unit). Full cycle ≈ 4.2 s

  // ── Horizontal bounds ──
  OFFSCREEN_FRACTION:   0.15,   // how much of cat width peeks off-screen at turnaround edges

  // ── Release / TAP physics (k-system units, same as SLOW_FALL_GRAVITY) ──
  RELEASE_HORIZONTAL_RETAIN: 0.4,  // preserve 40% of trajectory horizontal velocity
  FALL_GRAVITY:              2.0,  // world-space downward accel after release (matches existing)
};

// Level Config & Checkpoints (1 level = 10 floors)
export const LEVELS = [
  {
    level: 1,
    name: "Чердак",
    startFloor: 0,
    themeIdx: 0,
    speedBase: 2.2,
    windFactor: 0,
    swaySens: 0.9,
    icon: "🏠"
  },
  {
    level: 2,
    name: "Солнечный Двор",
    startFloor: 10,
    themeIdx: 1,
    speedBase: 2.8,
    windFactor: 0.12,
    swaySens: 1.2,
    icon: "☀️"
  },
  {
    level: 3,
    name: "Закат",
    startFloor: 20,
    themeIdx: 2,
    speedBase: 3.4,
    windFactor: 0.22,
    swaySens: 1.5,
    icon: "🌇"
  },
  {
    level: 4,
    name: "Ночное Небо",
    startFloor: 30,
    themeIdx: 3,
    speedBase: 4.0,
    windFactor: 0.35,
    swaySens: 1.8,
    icon: "🌙"
  },
  {
    level: 5,
    name: "Космос",
    startFloor: 40,
    themeIdx: 4,
    speedBase: 4.6,
    windFactor: 0.50,
    swaySens: 2.2,
    icon: "🚀"
  }
];

// How many floors before a level boundary the theme/difficulty blend starts.
// A hard cut (previous behavior) reads as a glitch; ramping over a few floors reads as a level-up.
export const LEVEL_TRANSITION_FLOORS = 3;

/**
 * Returns a blend between the current level and the next one as the player
 * approaches a 10-floor boundary, so theme colors, wind, speed and sway ramp
 * in smoothly instead of snapping instantly at floor % 10 === 0.
 * { from, to, t } — t is 0 while comfortably inside a level, ramps 0→1 over
 * the transition zone, and is exactly 0 again (from === to) once fully arrived.
 */
export function getLevelBlend(floor) {
  let idx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (floor >= LEVELS[i].startFloor) { idx = i; break; }
  }
  const from = LEVELS[idx];
  const to = LEVELS[Math.min(idx + 1, LEVELS.length - 1)];
  if (to === from) return { from, to, t: 0 };

  const levelSpan = to.startFloor - from.startFloor; // normally 10
  const floorsRemaining = levelSpan - (floor - from.startFloor);
  if (floorsRemaining > LEVEL_TRANSITION_FLOORS) return { from, to, t: 0 };

  const t = 1 - Math.max(0, floorsRemaining) / LEVEL_TRANSITION_FLOORS;
  return { from, to, t: Math.max(0, Math.min(1, t)) };
}

export function lerp(a, b, t) { return a + (b - a) * t; }

// Physics constants for Tower Balance & Jenga Teetering Physics.
// Single source of truth — re-exported from the modular physics engine's own config
// (src/game/physics/PhysicsConfig.js) instead of a second hand-copied object here.
// The two had already silently drifted apart on TEETER_BASE_ACCEL (0.0012 here vs the
// 0.25 actually driving live teetering) before this fix; re-exporting removes that risk.
export { PhysicsConfig as PHYSICS_CONFIG } from "./physics/PhysicsConfig.js";

export const BLOCK_TYPES = {
  normal: {
    id: "normal",
    label: "Обычный",
    palette: ["#ffb6d9", "#c9b7ff", "#ffe08a", "#9fe8c8", "#ffb0a0", "#a8d8ff"],
    toleranceDelta: 0,
    speedMult: 1,
    scoreMult: 1,
    weight: 1.0,
    mass: 1.0,
    friction: 1.0,
    elasticity: 0.2,
    overturnResistance: 1.0,
    unlockFloor: 0
  },
  light: {
    id: "light",
    label: "Пушистик",
    palette: ["#fdf6e3", "#fff0f5", "#f0faff"],
    toleranceDelta: 5,
    speedMult: 0.88,
    scoreMult: 1,
    weight: 1.0,
    mass: 1.0,
    friction: 0.9,
    elasticity: 0.4,
    overturnResistance: 1.2,
    unlockFloor: 4
  },
  heavy: {
    id: "heavy",
    label: "Тяжеловес",
    palette: ["#c98f5e", "#b87a4a", "#a56a3e"],
    toleranceDelta: 0,
    speedMult: 0.8,
    scoreMult: 2,
    weight: 1.0,
    mass: 1.0,
    friction: 1.2,
    elasticity: 0.1,
    overturnResistance: 0.8,
    unlockFloor: 7
  },
  slippery: {
    id: "slippery",
    label: "Скользкий",
    palette: ["#7fd8e8", "#5fc2d6", "#a0e8f0"],
    toleranceDelta: -4,
    speedMult: 1.25,
    scoreMult: 1.5,
    weight: 1.0,
    mass: 1.0,
    friction: 0.4,
    elasticity: 0.1,
    overturnResistance: 0.6,
    unlockFloor: 11
  },
  sticky: {
    id: "sticky",
    label: "Липучка",
    palette: ["#a8d878", "#8fc75f", "#c2e896"],
    toleranceDelta: 8,
    speedMult: 0.95,
    scoreMult: 0.9,
    weight: 1.0,
    mass: 1.0,
    friction: 2.0,
    elasticity: 0.0,
    overturnResistance: 2.0,
    unlockFloor: 15
  }
};

export const UNLOCK_ORDER = ["light", "heavy", "slippery", "sticky"];

// Gifts completely removed

export const THEMES = [
  { name: "Уютный чердак", from: "#2b2140", to: "#4a2f55", deco: "windows", accent: "#ffd1e8" },
  { name: "Солнечный двор", from: "#8ec9ea", to: "#cdeafd", deco: "clouds", accent: "#fff4d6" },
  { name: "Закат", from: "#ff9a6c", to: "#7d4a8c", deco: "birds", accent: "#ffe3b3" },
  { name: "Ночное небо", from: "#0d1233", to: "#1e2a5e", deco: "stars", accent: "#cfd8ff" },
  { name: "Космос", from: "#050414", to: "#1a0d33", deco: "space", accent: "#b98bff" }
];
