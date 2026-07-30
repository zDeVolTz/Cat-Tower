/**
 * Game constants, levels, cat block configurations, power-ups, themes, and Tetris Column settings.
 */

export const BLOCK_H = 46;
export const PERFECT_TOLERANCE_BASE = 10;

// Single source of truth for two numbers that were previously duplicated as raw
// literals in gameState.js, gameLoop.js, physics.js and renderer.js (60 and 0.55).
export const GROUND_MARGIN = 60;       // px gap kept between the tower base and the very bottom of the screen
export const CAMERA_TRAIL_FRACTION = 0.55; // fraction of screen height the tower can grow before the camera starts following

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

// Physics constants for Tower Balance (Inverted Pendulum Model)
export const PHYSICS_CONFIG = {
  PHYSICS_SUBSTEP_MS: 4,        // Fixed timestep for stability (4ms = 250Hz)
  GRAVITY_FACTOR: 0.0006,       // How strongly gravity pulls off-center mass
  BASE_STIFFNESS: 0.8,          // Restoring spring force (foundation rigidity)
  BASE_DAMPING: 1.2,            // Angular velocity friction
  MAX_ANGULAR_VELOCITY: 0.015,  // Clamp: prevents single-frame explosions
  MAX_SAFE_TILT: 0.26,          // UI warning threshold (~15 degrees)
  CRITICAL_TILT: 0.40,          // Collapse threshold (~23 degrees)
  DROP_IMPULSE_FACTOR: 0.0008   // How much a misaligned drop pushes the tower
};

export const BLOCK_TYPES = {
  normal: {
    id: "normal",
    label: "Обычный",
    palette: ["#ffb6d9", "#c9b7ff", "#ffe08a", "#9fe8c8", "#ffb0a0", "#a8d8ff"],
    toleranceDelta: 0,
    speedMult: 1,
    scoreMult: 1,
    weight: 1.0,
    unlockFloor: 0
  },
  light: {
    id: "light",
    label: "Пушистик",
    palette: ["#fdf6e3", "#fff0f5", "#f0faff"],
    toleranceDelta: 5,
    speedMult: 0.88,
    scoreMult: 1,
    weight: 0.5,
    unlockFloor: 4
  },
  heavy: {
    id: "heavy",
    label: "Тяжеловес",
    palette: ["#c98f5e", "#b87a4a", "#a56a3e"],
    toleranceDelta: 0,
    speedMult: 0.8,
    scoreMult: 2,
    weight: 2.2,
    unlockFloor: 7
  },
  slippery: {
    id: "slippery",
    label: "Скользкий",
    palette: ["#7fd8e8", "#5fc2d6", "#a0e8f0"],
    toleranceDelta: -4,
    speedMult: 1.25,
    scoreMult: 1.5,
    weight: 1.1,
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
