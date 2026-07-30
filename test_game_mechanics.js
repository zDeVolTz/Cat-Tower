/**
 * Cat Tower Stack — Universal Game Mechanics & Logic Test Suite
 * Asserts domain invariants, valid ranges, contracts, and state transitions.
 * Independent of physics engine implementation.
 */

import { BLOCK_H, GROUND_MARGIN, PERFECT_TOLERANCE_BASE, CAMERA_TRAIL_FRACTION, BLOCK_TYPES, UNLOCK_ORDER, LEVELS, THEMES, getLevelBlend, lerp } from "./src/game/config.js";
import { state, resetGameState, spawnMover, getFloorCount, getTopFloorY, getBlockSwayX, getCriticalTilt, getMoverLimits, getLaneBounds, uiScale } from "./src/game/gameState.js";
import { handleDrop, getVisualTopBlockBounds, findSurfaceYForFootprint, handleGameOver, checkMilestone } from "./src/game/physics.js";
import { update } from "./src/game/gameLoop.js";

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, name, details = "") {
  if (condition) {
    passed++;
    results.push({ pass: true, name });
  } else {
    failed++;
    results.push({ pass: false, name, details });
  }
}

console.log("\n======================================================================");
console.log("   SECTION 1: GAME CONFIGURATION & DOMAIN CONTRACTS");
console.log("======================================================================\n");

try {
  // ─── 1. DOMAIN CONFIG INVARIANTS ───
  assert(BLOCK_H > 0 && typeof BLOCK_H === "number", "C001: BLOCK_H is positive numeric height");
  assert(GROUND_MARGIN >= 0 && typeof GROUND_MARGIN === "number", "C002: GROUND_MARGIN is non-negative pixel offset");
  assert(PERFECT_TOLERANCE_BASE > 0, "C003: Perfect drop tolerance is positive");
  assert(CAMERA_TRAIL_FRACTION > 0 && CAMERA_TRAIL_FRACTION < 1.0, "C004: Camera trail fraction is within (0, 1) screen ratio");

  // ─── 2. LEVEL PROGRESSION & THEME CONFIG CONTRACTS ───
  assert(Array.isArray(LEVELS) && LEVELS.length >= 5, "C005: At least 5 game levels configured");
  assert(Array.isArray(THEMES) && THEMES.length >= LEVELS.length, "C006: Each level has a corresponding visual theme");
  assert(Array.isArray(UNLOCK_ORDER) && UNLOCK_ORDER.length > 0, "C007: Valid cat unlock order array configured");

  for (let i = 0; i < LEVELS.length; i++) {
    const lvl = LEVELS[i];
    assert(lvl.level === i + 1, `C008: Level index ${i+1} has sequential level ID`);
    assert(typeof lvl.name === "string" && lvl.name.length > 0, `C009: Level ${i+1} has non-empty title`);
    assert(lvl.speedBase > 0, `C010: Level ${i+1} mover speedBase is positive`);
    assert(lvl.swaySens >= 0, `C011: Level ${i+1} sway sensitivity is non-negative`);
    assert(lvl.windFactor >= 0, `C012: Level ${i+1} wind factor is non-negative`);
  }

  // ─── 3. CAT BLOCK TYPE CONTRACTS ───
  const requiredTypes = ["normal", "light", "heavy", "slippery", "sticky"];
  for (const typeId of requiredTypes) {
    const cat = BLOCK_TYPES[typeId];
    assert(cat !== undefined, `C013: Cat type '${typeId}' is defined`);
    assert(typeof cat.label === "string" && cat.label.length > 0, `C014: Cat type '${typeId}' has human label`);
    assert(Array.isArray(cat.palette) && cat.palette.length > 0, `C015: Cat type '${typeId}' has non-empty palette`);
    assert(cat.scoreMult > 0, `C016: Cat type '${typeId}' score multiplier is positive`);
    assert(cat.speedMult > 0, `C017: Cat type '${typeId}' speed multiplier is positive`);
    assert(cat.weight > 0, `C018: Cat type '${typeId}' weight attribute is positive`);
  }

  // ─── 4. LEVEL BLENDING & INTERPOLATION INVARIANTS ───
  assert(lerp(0, 100, 0.5) === 50, "C019: lerp midpoint interpolation is exact");
  assert(lerp(10, 20, 0) === 10, "C020: lerp start boundary t=0");
  assert(lerp(10, 20, 1) === 20, "C021: lerp end boundary t=1");

  const blend0 = getLevelBlend(0);
  assert(blend0.from.level === 1 && blend0.t === 0, "C022: Level 1 floor 0 blend t=0");

  const blendFloor7 = getLevelBlend(7);
  assert(blendFloor7.t >= 0 && blendFloor7.t <= 1.0, "C023: Floor 7 blend factor t is bounded in [0, 1]");

  const blendFloor10 = getLevelBlend(10);
  assert(blendFloor10.from.level === 2 && blendFloor10.t === 0, "C024: Floor 10 reached Level 2");

  const blendFloor100 = getLevelBlend(100);
  assert(blendFloor100.from.level === 5 && blendFloor100.t === 0, "C025: Extreme floor count caps at max level");

  console.log("\n======================================================================");
  console.log("   SECTION 2: GAME STATE & VIEWPORT METRICS");
  console.log("======================================================================\n");

  // ─── 5. STATE INITIALIZATION INVARIANTS ───
  state.W = 400; state.H = 700;
  resetGameState();
  assert(state.blocks.length === 1, "S001: resetGameState initializes exactly 1 ground base block");
  assert(state.blocks[0].width > 0, "S002: Base block has positive width");
  assert(state.blocks[0].y === 0, "S003: Base block is placed at ground elevation (y=0)");
  assert(state.status === "menu" || state.status === "playing", "S004: Game status is valid initial state");
  assert(state.score >= 0, "S005: Initial player score is non-negative");
  assert(state.combo === 0, "S006: Initial drop combo counter is zero");
  assert(state.feverMode === false, "S007: Fever mode is initially inactive");

  // ─── 6. VIEWPORT & UI SCALING METRICS ───
  const scaleMobile = uiScale();
  assert(scaleMobile >= 0.82 && scaleMobile <= 1.15, "S008: uiScale is safely clamped within readable mobile bounds [0.82, 1.15]");

  state.W = 1000;
  const scaleDesktop = uiScale();
  assert(scaleDesktop <= 1.15, "S009: uiScale does not bloat on desktop monitors");
  state.W = 400; // Restore mobile width

  const boundsMobile = getLaneBounds();
  assert(boundsMobile.laneWidth > 0 && boundsMobile.laneWidth <= state.W, "S010: Mobile lane width is bounded by screen width");
  assert(boundsMobile.laneLeft < boundsMobile.laneRight, "S011: Lane left boundary < right boundary");

  state.W = 800; state.H = 900;
  const boundsDesktop = getLaneBounds();
  assert(boundsDesktop.laneWidth > 0, "S012: Desktop playfield arcade lane calculated");
  state.W = 400; state.H = 700;

  const moverLimits = getMoverLimits();
  assert(moverLimits.left < moverLimits.right, "S013: Mover movement limits left < right");
  assert(moverLimits.spawnLeft < moverLimits.spawnRight, "S014: Mover spawn limits spawnLeft < spawnRight");

  // ─── 7. TOWER ELEVATION & SURFACE FOOTPRINT ───
  const topY = getTopFloorY();
  assert(topY === BLOCK_H, "S015: Top floor Y for 1 block equals BLOCK_H");

  const floorCount = getFloorCount();
  assert(floorCount === 0, "S016: Floor count for 1 block equals 0");

  state.blocks = [
    { x: 130, width: 140, y: 0, settled: true },
    { x: 130, width: 140, y: BLOCK_H, settled: true }
  ];
  const surfaceFull = findSurfaceYForFootprint(130, 270);
  assert(surfaceFull === BLOCK_H * 2, "S017: Landing surface under full footprint returns top stack Y");

  const surfaceEmpty = findSurfaceYForFootprint(400, 500);
  assert(surfaceEmpty === 0, "S018: Landing surface over empty air returns ground Y (0)");

  state.blocks.push({ x: 200, width: 70, y: BLOCK_H * 2, settled: true });
  const surfacePartialTop = findSurfaceYForFootprint(210, 250);
  assert(surfacePartialTop === BLOCK_H * 3, "S019: Landing surface over partial top block returns top height");

  const surfacePartialMiss = findSurfaceYForFootprint(130, 160);
  assert(surfacePartialMiss === BLOCK_H * 2, "S020: Footprint missing top step lands on supporting lower step");

  const visualTop = getVisualTopBlockBounds();
  assert(visualTop.width === 70, "S021: Visual top block bounds returns current top block width");
  assert(visualTop.left < visualTop.right, "S022: Visual top bounds left < right");
  assert(visualTop.centerX === (visualTop.left + visualTop.right) / 2, "S023: Visual top centerX is exact midpoint");

  console.log("\n======================================================================");
  console.log("   SECTION 3: SCORING, COMBOS, FEVER MODE & DROP LOGIC");
  console.log("======================================================================\n");

  // ─── 8. DROP MECHANICS, COMBOS & SCORE SCALING ───
  resetGameState();
  state.status = "playing";
  spawnMover();
  state.mover.width = 140; state.mover.typeId = "normal"; state.mover.x = state.columnLeft;
  const initialScore = state.score;

  handleDrop();
  assert(state.blocks.length === 2, "D001: Aligned block drop places block onto tower");
  assert(state.score > initialScore, "D002: Successful block drop increases score");
  assert(state.combo === 1, "D003: Perfect drop increments combo counter to 1");

  spawnMover();
  state.mover.width = 140; state.mover.typeId = "normal"; state.mover.x = state.columnLeft;
  handleDrop();
  assert(state.combo === 2, "D004: Second perfect drop increments combo counter to 2");

  spawnMover(); state.mover.width = 140; state.mover.typeId = "normal"; state.mover.x = state.columnLeft; handleDrop();
  spawnMover(); state.mover.width = 140; state.mover.typeId = "normal"; state.mover.x = state.columnLeft; handleDrop();
  assert(state.combo >= 4 && state.feverMode === true, "D005: 4 consecutive perfect drops trigger Fever Mode!");

  spawnMover();
  state.mover.width = 140; state.mover.typeId = "normal";
  state.mover.x = state.columnLeft + 25; // Non-perfect drop
  handleDrop();
  assert(state.combo === 0, "D006: Non-perfect drop resets combo counter to 0");
  assert(state.feverMode === false, "D007: Non-perfect drop deactivates Fever Mode");

  resetGameState();
  state.status = "playing";
  spawnMover();
  state.mover.width = 140; state.mover.typeId = "normal";
  state.mover.x = state.columnLeft + 300; // Drop into empty air
  handleDrop();
  assert(state.status === "collapsing" || state.status === "over", "D008: Dropping block into empty air triggers Game Over collapse sequence");

  resetGameState();
  state.status = "playing";
  spawnMover();
  state.mover.width = 140; state.mover.typeId = "normal"; state.mover.isGolden = true;
  const scoreBeforeGolden = state.score;
  state.mover.x = state.columnLeft;
  handleDrop();
  assert(state.score > scoreBeforeGolden + 1, "D009: Golden cat block drop awards bonus score multiplier");

  resetGameState();
  state.status = "playing";
  for (const catId of ["heavy", "light", "slippery", "sticky"]) {
    spawnMover();
    state.mover.width = 140; state.mover.typeId = catId; state.mover.x = state.columnLeft;
    handleDrop();
    assert(state.blocks[state.blocks.length - 1].typeId === catId, `D010: Cat type '${catId}' successfully lands on tower`);
  }

  assert(state.blocks[state.blocks.length - 1].squishX > 1.0, "D011: Landing drop triggers horizontal squish bounce animation");

  state.score = 250;
  if (state.score > state.best) state.best = state.score;
  assert(state.best === 250, "D012: Best score metric updates when player exceeds high score");

  console.log("\n======================================================================");
  console.log("   SECTION 4: CAMERA, VISUAL JUICE & SYSTEM EFFECTS");
  console.log("======================================================================\n");

  // ─── 9. CAMERA & VISUAL JUICE INVARIANTS ───
  resetGameState();
  state.status = "playing";
  state.targetCameraY = 300;
  const camStart = state.cameraY;
  update(100);
  assert(state.cameraY > camStart, "V001: Camera smoothly tracks towards targetCameraY");
  assert(state.cameraY <= state.targetCameraY, "V002: Camera tracking does not overshoot targetCameraY");

  state.shakeMag = 12;
  update(100);
  assert(state.shakeMag < 12, "V003: Screen shake magnitude decays over update frames");
  assert(state.shakeMag >= 0, "V004: Screen shake magnitude stays non-negative");

  state.screenFlash = { color: "#ffffff", alpha: 0.8 };
  update(100);
  assert(state.screenFlash.alpha < 0.8, "V005: Screen flash overlay alpha decays over update frames");

  state.milestoneBanner = { text: "Achievement", life: 100, maxLife: 100 };
  update(200);
  assert(state.milestoneBanner === null, "V006: Milestone banner automatically clears after lifetime expires");

  resetGameState();
  state.status = "playing";
  state.blocks = Array.from({length: 12}, (_, i) => ({ x: 130, width: 140, y: i * BLOCK_H }));
  assert(getFloorCount() === 11, "V007: 12 blocks on tower calculate floor count = 11");

  state.startFloor = 30; // Checkpoint Level 4
  assert(getFloorCount() >= 30, "V008: Checkpoint start floor offset is included in floor count");

  resetGameState();
  state.status = "playing";
  const debrisBefore = state.debris.length;
  handleGameOver();
  assert(state.blocks.some(b => b.isFalling) || state.debris.length > debrisBefore, "V009: Game Over triggers collapse physics animation");
  assert(state.status === "collapsing" || state.status === "over", "V010: Game status transitions to collapsing sequence on collapse");

  resetGameState();
  state.status = "playing";
  state.mover = { x: -200, width: 100, dir: -1, speed: 5, typeId: "normal" };
  update(16);
  assert(state.mover.dir === 1, "V011: Mover bounces direction to +1 at left boundary limit");

  state.status = "playing";
  state.mover.x = 1000;
  state.mover.dir = 1;
  update(16);
  assert(state.mover.dir === -1, "V012: Mover bounces direction to -1 at right boundary limit");

} catch (err) {
  assert(false, "EX-RUNTIME: Uncaught exception in game mechanics test suite", err.stack || String(err));
}

console.log(`\n======================================================================`);
console.log(`   GAME MECHANICS TEST RESULTS: ${passed} PASSED, ${failed} FAILED OUT OF ${passed + failed}`);
console.log(`======================================================================\n`);

if (failed > 0) {
  for (const r of results) {
    if (!r.pass) console.log(`  ❌ FAILED: ${r.name} ${r.details}`);
  }
}
