/**
 * Cat Tower Stack — Edge Cases & Module Integration Test Suite
 * Verifies stability under rapid consecutive drops, missing property fallbacks,
 * extreme screen resizes, and continuous game loop integration.
 */

import { BLOCK_H } from "./src/game/config.js";
import { state, resetGameState, spawnMover, getMoverLimits, getLaneBounds } from "./src/game/gameState.js";
import { handleDrop } from "./src/game/physics.js";
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
console.log("   SECTION: EDGE CASES & MODULE INTEGRATION");
console.log("======================================================================\n");

try {
  // ─── 1. RESIZE & SCREEN METRICS EDGE CASES ───
  state.W = 320; state.H = 480; // Small budget mobile
  resetGameState();
  assert(state.columnWidth > 0 && state.columnWidth < state.W, "E001: Column width is valid on small 320px screen");

  state.W = 1920; state.H = 1080; // Full HD Desktop
  resetGameState();
  assert(state.columnWidth > 0 && state.columnWidth < state.W, "E002: Column width is valid on 1920px screen");
  state.W = 400; state.H = 700; resetGameState();

  // ─── 2. MISSING PROPERTIES & FALLBACK SAFETY ───
  state.status = "playing";
  state.mover = { x: state.columnLeft, width: 140, typeId: "non_existent_cat_type" };
  handleDrop();
  assert(state.blocks.length === 2, "E003: Placement gracefully handles unknown cat type fallback");

  // ─── 3. RAPID CONSECUTIVE DROPS INTEGRATION ───
  resetGameState();
  state.status = "playing";
  for (let i = 0; i < 15; i++) {
    if (!state.mover) spawnMover();
    state.mover.width = 140;
    state.mover.typeId = "normal";
    state.mover.x = state.columnLeft + (i % 2 === 0 ? 4 : -4);
    handleDrop();
    update(16);
  }
  assert(state.blocks.length === 16 && state.status === "playing", "E004: 15 consecutive drops execute without crashes or freezes");

  // ─── 4. GAME LOOP TIMESTEP ACCUMULATOR CAP SAFETY ───
  resetGameState();
  state.status = "playing";
  update(5000); // Simulate long background tab pause (5 seconds dt)
  assert(state.status === "playing" || state.status === "over", "E005: Game loop handles long background pause without spiral of death");

  // ─── 5. CASCADE COLLAPSE (TEETERING BLOCK FALLS WITH BLOCKS ON TOP) ───
  resetGameState();
  state.status = "playing";
  state.blocks = [
    { x: 130, width: 140, y: 0, settled: true, mass: 1 },
    { x: 230, width: 140, y: BLOCK_H, isTeetering: true, settled: false, localTilt: 0.45, tiltVel: 0, tiltDir: 1, mass: 1 }, // Teetering block (about to fall)
    { x: 230, width: 140, y: BLOCK_H * 2, settled: true, mass: 1 } // Block on top of it
  ];
  
  // Tick game loop to process the teetering fall
  update(16);
  assert(state.blocks[1].isFalling === true, "E006: Teetering block falls out");
  assert(state.blocks[2].isFalling === true, "E007: Cascade Collapse - Block on top of falling block also falls");
  assert(state.status === "collapsing", "E008: Game status becomes collapsing during cascade fall");

} catch (err) {
  assert(false, "EX-RUNTIME: Uncaught exception in edge cases test suite", err.stack || String(err));
}

console.log(`\n======================================================================`);
console.log(`   EDGE CASES TEST RESULTS: ${passed} PASSED, ${failed} FAILED OUT OF ${passed + failed}`);
console.log(`======================================================================\n`);
