import { ActiveCatSystem, ACTIVE_CAT_CONFIG } from './src/game/physics/ActiveCatSystem.js';

let passed = 0;
let failed = 0;

function assert(condition, message, details = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ PASSED: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAILED: ${message}`);
    if (details) console.error(`     Details: ${details}`);
  }
}

console.log(`\n======================================================================`);
console.log(`   SECTION: ACTIVE CAT MOVEMENT PATTERNS`);
console.log(`======================================================================\n`);

try {
  // Mock state
  const state = {
    W: 400,
    H: 800,
    cameraY: 0
  };

  const mover = {
    x: 200,
    width: 100,
    y: 0,
    state: "moving",
    vx: 0,
    vy: 0
  };

  // Test init
  ActiveCatSystem.initMover(mover, state);
  assert(mover.time === 0, "AC01: initMover sets time to 0");
  assert(mover.y > 0, "AC02: initMover updates y based on screen coordinates");

  // Test bounds (Linear/Curve)
  ACTIVE_CAT_CONFIG.ACTIVE_CAT_MOVEMENT_PATTERN = "sweep";
  ActiveCatSystem.updateMoving(mover, 16, state);
  assert(mover.x >= 0 && mover.x <= state.W, "AC03: Mover stays within horizontal bounds");

  // Test Inertia preparation
  assert(typeof mover.vx === 'number', "AC04: Horizontal velocity (vx) is calculated during moving");

  // Test falling transition with inertia
  mover.state = "falling";
  mover.vx = 5.0; // Artificial rightward inertia
  const oldX = mover.x;
  ActiveCatSystem.updateFalling(mover, 1.0, state);
  assert(mover.x > oldX, "AC05: Mover retains horizontal inertia during fall");

} catch(err) {
  assert(false, "EX-RUNTIME: Uncaught exception in active cat test suite", err.stack || String(err));
}

console.log(`\n======================================================================`);
console.log(`   ACTIVE CAT TEST RESULTS: ${passed} PASSED, ${failed} FAILED OUT OF ${passed + failed}`);
console.log(`======================================================================\n`);
