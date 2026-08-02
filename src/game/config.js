/**
 * Game constants, levels, cat block configurations, power-ups, themes, and Tetris Column settings.
 */

export const BLOCK_H = 46;
export const PERFECT_TOLERANCE_BASE = 10;

// Single source of truth for two numbers that were previously duplicated as raw
// literals in gameState.js, gameLoop.js, physics.js and renderer.js (60 and 0.55).
export const GROUND_MARGIN = 60;       // px gap kept between the tower base and the very bottom of the screen
export const CAMERA_TRAIL_FRACTION = 0.55; // fraction of screen height the tower can grow before the camera starts following

// ─── Active Cat Spatial Model — Gameplay Constants (Iteration 1) ────────────
// Five explicitly separate concepts. Do not blend them:
//
//   1. TOWER EXCLUSION ZONE — the vertical region the tower can physically
//      reach (world-space rule, worst-case tower height + safety margin).
//   2. ACTIVE FLIGHT ZONE   — the screen-space band the cat's trajectory is
//      confined to. Always sits entirely above the tower exclusion zone.
//   3. VISIBLE GAMEPLAY ZONE — the horizontal screen-space region in which
//      the cat is actually drawn. Narrower than the phantom travel range.
//   4. PHANTOM TRAJECTORY  — the invisible portion of the same horizontal
//      path, outside the visible gameplay zone, where the cat is already
//      "moving" (so it enters at speed, never spawns instantly at an edge).
//   5. CAMERA               — presentation only. It reads world-space tower
//      geometry to decide what to render; it never defines gameplay bounds.
//      No cat-trajectory or exclusion-zone math may depend on cameraY here.
//
// Units: fractions are relative to viewport H/W; block-relative values use BLOCK_H.
export const ACTIVE_CAT_TRAJECTORY = {
  // ── 1. TOWER EXCLUSION ZONE ──────────────────────────────────────────────
  // Vertical clearance kept between the tower's current top and the flight
  // zone's lower edge. Expressed in BLOCK_H multiples so it scales with the
  // block grid. This is a gameplay rule about the tower, not about the cat.
  CLEARANCE_BLOCKS:     1.0,    // min gap between tower top and flight-zone floor (1× BLOCK_H)

  // ── 2. ACTIVE FLIGHT ZONE ────────────────────────────────────────────────
  ZONE_TOP_RATIO:       0.08,   // fraction of H reserved above the flight zone (notch/status bar)
  ZONE_TOP_MIN_PX:      55,     // absolute minimum top margin in px
  CAT_VISUAL_EXTENT_PX: 30,     // cat's visual half-height (body/2 + ear overshoot), used as clearance padding
  MIN_ARC_HEIGHT_PX:    46,     // minimum vertical arc sweep (= 1 BLOCK_H) — flight zone is never thinner than this
  MAX_FLOOR_RATIO:      0.40,   // flight zone floor never goes below 40% of screen height, regardless of tower height
  PHASE_SPEED:          0.025,  // oscillation speed (rad per k-unit). Full cycle ≈ 4.2 s

  // ── 3. VISIBLE GAMEPLAY ZONE ─────────────────────────────────────────────
  // Horizontal region (screen-space) in which the cat is actually rendered
  // and interactable. Turnaround points sit inside this zone, inset from
  // the true screen edge by OFFSCREEN_FRACTION so the cat doesn't clip.
  OFFSCREEN_FRACTION:   0.15,   // how much of cat width may still peek at the visible-zone's own edges

  // ── 4. PHANTOM TRAJECTORY ────────────────────────────────────────────────
  // Extra horizontal travel, entirely outside the visible gameplay zone,
  // that the cat's motion already covers before crossing into visibility.
  // This is a distinct concept from the visible zone's own edge inset above:
  // it's the invisible run-up, not a visible-but-clipped sliver.
  PHANTOM_MARGIN_FRACTION: 0.6, // phantom travel distance, relative to mover width

  // ── Release / TAP physics (k-system units, same as SLOW_FALL_GRAVITY) ──
  RELEASE_HORIZONTAL_RETAIN: 0.4,  // preserve 40% of trajectory horizontal velocity
  FALL_GRAVITY:              2.0,  // world-space downward accel after release (matches existing)

  // ── Iteration 2: One-Shot Trajectory Shapes ──────────────────────────────
  // Three deterministic, pre-authored trajectory classes (never random shape
  // mid-flight — the shape is fixed at spawn, only the direction is random).
  // All three normalize their peak height against the SAME flight zone
  // (see ActiveCatSystem.getActiveFlightZone) so none of them can ever dip
  // into the tower exclusion zone, regardless of shape.
  TRAJECTORY_ORDER: ["high_arc", "low_arc", "diagonal_arc"], // cycle order for #test playtest mode
  HIGH_ARC_FLOOR_FRACTION:      1.0,   // HIGH: touches the full flight-zone floor at entry/exit (biggest sweep)
  LOW_ARC_FLOOR_FRACTION:       0.45,  // LOW: entry/exit sit within the zone, well above its floor (shallow sweep)
  LOW_ARC_PEAK_FRACTION:        0.55,  // LOW: peak only reaches partway up the zone (never near the ceiling)
  DIAGONAL_PEAK_T:              0.32,  // DIAGONAL: peak position along the path is off-center (not t=0.5)
  DIAGONAL_ENTRY_FLOOR_FRACTION: 0.95, // DIAGONAL: entry Y (near the floor — comes in low)
  DIAGONAL_EXIT_FLOOR_FRACTION:  0.55  // DIAGONAL: exit Y (higher up — leaves at a different height than it entered)
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
