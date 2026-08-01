import { ActiveCatSystem, ACTIVE_CAT_CONFIG } from './src/game/physics/ActiveCatSystem.js';
import { BLOCK_H, GROUND_MARGIN, ACTIVE_CAT_TRAJECTORY } from './src/game/config.js';

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

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, message, `expected ≈${expected}, got ${actual} (diff ${diff.toFixed(2)}, tol ${tolerance})`);
}

// ── Mock helpers ────────────────────────────────────────────────────────────

function mockState(overrides = {}) {
  return {
    W: 390,
    H: 800,
    cameraY: 0,
    blocks: [{ x: 125, width: 140, y: 0 }], // 1 base block
    columnLeft: 125,
    columnRight: 265,
    columnWidth: 140,
    towerAngle: 0,
    ...overrides
  };
}

function mockMover(overrides = {}) {
  return {
    x: 0,
    width: 100,
    y: 0,
    dir: 1,
    speed: 2.2,
    state: "moving",
    vx: 0,
    vy: 0,
    ...overrides
  };
}

console.log(`\n======================================================================`);
console.log(`   SECTION: ACTIVE CAT TRAJECTORY (Sinusoidal Ping-Pong Arc)`);
console.log(`======================================================================\n`);

try {
  // ════════════════════════════════════════════════════════════════════════
  // 1. INIT & BOUNDS
  // ════════════════════════════════════════════════════════════════════════

  const state = mockState();
  const mover = mockMover();

  ActiveCatSystem.initMover(mover, state);

  assert(mover.trajectoryCeiling !== undefined, "AC01: initMover sets trajectoryCeiling");
  assert(mover.trajectoryFloor !== undefined, "AC02: initMover sets trajectoryFloor");
  assert(mover.arcHeight > 0, "AC03: arcHeight is positive", `arcHeight = ${mover.arcHeight}`);
  assert(mover.phase !== undefined, "AC04: initMover sets initial phase");
  assert(mover.y > 0, "AC05: initMover sets world-space y > 0");

  // Trajectory ceiling must respect top margin
  const expectedMinCeiling = Math.max(state.H * ACTIVE_CAT_TRAJECTORY.ZONE_TOP_RATIO, ACTIVE_CAT_TRAJECTORY.ZONE_TOP_MIN_PX)
    + ACTIVE_CAT_TRAJECTORY.CAT_VISUAL_EXTENT_PX;
  assert(mover.trajectoryCeiling >= expectedMinCeiling,
    "AC06: Trajectory ceiling respects top margin + cat extent",
    `ceiling=${mover.trajectoryCeiling}, minExpected=${expectedMinCeiling}`);

  // Arc height must meet minimum
  assert(mover.arcHeight >= ACTIVE_CAT_TRAJECTORY.MIN_ARC_HEIGHT_PX,
    "AC07: Arc height meets minimum",
    `arcHeight=${mover.arcHeight}, min=${ACTIVE_CAT_TRAJECTORY.MIN_ARC_HEIGHT_PX}`);

  // ════════════════════════════════════════════════════════════════════════
  // 2. SAFE ZONE — Cat never intersects tower zone
  // ════════════════════════════════════════════════════════════════════════

  // Simulate full oscillation and check cat visual bottom never reaches tower top
  const simState = mockState();
  const simMover = mockMover();
  ActiveCatSystem.initMover(simMover, simState);

  const towerTopScreen = simState.H - GROUND_MARGIN - (BLOCK_H - simState.cameraY) - BLOCK_H;
  let maxCatBottomY = 0;
  const NUM_STEPS = 300;

  for (let i = 0; i < NUM_STEPS; i++) {
    ActiveCatSystem.update(simMover, 1.0, simState);
    // Cat visual bottom in screen-space
    const catScreenY = simState.H - GROUND_MARGIN - (simMover.y - simState.cameraY) - BLOCK_H;
    const catBottomY = catScreenY + ACTIVE_CAT_TRAJECTORY.CAT_VISUAL_EXTENT_PX;
    if (catBottomY > maxCatBottomY) maxCatBottomY = catBottomY;
  }

  assert(maxCatBottomY < towerTopScreen,
    "AC08: Cat visual bottom never reaches tower top (safe zone maintained)",
    `maxCatBottom=${maxCatBottomY.toFixed(1)}, towerTop=${towerTopScreen}`);

  // ════════════════════════════════════════════════════════════════════════
  // 3. PING-PONG — Smooth direction changes
  // ════════════════════════════════════════════════════════════════════════

  const ppState = mockState();
  const ppMover = mockMover();
  ActiveCatSystem.initMover(ppMover, ppState);

  let dirChanges = 0;
  let lastDir = ppMover.dir;
  let minX = Infinity, maxX = -Infinity;

  for (let i = 0; i < 500; i++) {
    ActiveCatSystem.update(ppMover, 1.0, ppState);
    if (ppMover.dir !== lastDir) {
      dirChanges++;
      lastDir = ppMover.dir;
    }
    minX = Math.min(minX, ppMover.x);
    maxX = Math.max(maxX, ppMover.x + ppMover.width);
  }

  assert(dirChanges >= 2, "AC09: Cat changes direction at least twice (ping-pong)",
    `dirChanges=${dirChanges}`);
  assert(maxX > ppState.W * 0.5, "AC10: Cat reaches right side of screen",
    `maxX=${maxX.toFixed(1)}`);
  assert(minX < ppState.W * 0.3, "AC11: Cat reaches left side of screen",
    `minX=${minX.toFixed(1)}`);

  // ════════════════════════════════════════════════════════════════════════
  // 4. ENTRY FROM BOTH SIDES
  // ════════════════════════════════════════════════════════════════════════

  const leftMover = mockMover({ dir: 1 });
  ActiveCatSystem.initMover(leftMover, mockState());
  const leftStartX = leftMover.x;

  const rightMover = mockMover({ dir: -1 });
  ActiveCatSystem.initMover(rightMover, mockState());
  const rightStartX = rightMover.x;

  assert(leftStartX < rightStartX, "AC12: Left-spawn starts left of right-spawn",
    `leftX=${leftStartX.toFixed(1)}, rightX=${rightStartX.toFixed(1)}`);

  // ════════════════════════════════════════════════════════════════════════
  // 5. TAP RELEASE — Horizontal momentum retained
  // ════════════════════════════════════════════════════════════════════════

  const tapState = mockState();
  const tapMover = mockMover();
  ActiveCatSystem.initMover(tapMover, tapState);

  // Advance to middle of trajectory (max horizontal velocity)
  for (let i = 0; i < 63; i++) { // ~π/2 at phase speed 0.025
    ActiveCatSystem.update(tapMover, 1.0, tapState);
  }

  // Release (TAP)
  tapMover.state = "falling";
  const preTapX = tapMover.x;
  const preTapY = tapMover.y;

  // One frame of falling
  ActiveCatSystem.update(tapMover, 1.0, tapState);

  assert(tapMover._released === true, "AC13: TAP triggers release momentum computation");
  assert(tapMover.vx !== 0, "AC14: Horizontal velocity is non-zero after TAP at mid-trajectory",
    `vx=${tapMover.vx}`);
  assert(tapMover.x !== preTapX, "AC15: Cat drifts horizontally after TAP",
    `preTapX=${preTapX.toFixed(1)}, postTapX=${tapMover.x.toFixed(1)}`);
  assert(tapMover.y < preTapY, "AC16: Cat falls downward after TAP (world Y decreases)",
    `preTapY=${preTapY.toFixed(1)}, postTapY=${tapMover.y.toFixed(1)}`);

  // ════════════════════════════════════════════════════════════════════════
  // 6. RELEASE PHYSICS — Correct k-system units
  // ════════════════════════════════════════════════════════════════════════

  // FALL_GRAVITY must match existing SLOW_FALL_GRAVITY scale
  assert(ACTIVE_CAT_TRAJECTORY.FALL_GRAVITY === 2.0,
    "AC17: FALL_GRAVITY matches existing k-system value (2.0)");

  // Horizontal retain must be a fraction
  assert(ACTIVE_CAT_TRAJECTORY.RELEASE_HORIZONTAL_RETAIN > 0 && ACTIVE_CAT_TRAJECTORY.RELEASE_HORIZONTAL_RETAIN < 1,
    "AC18: RELEASE_HORIZONTAL_RETAIN is a valid fraction (0..1)");

  // ════════════════════════════════════════════════════════════════════════
  // 7. DIFFERENT CAT DIMENSIONS — Bounds adapt
  // ════════════════════════════════════════════════════════════════════════

  const narrowMover = mockMover({ width: 36 });  // slippery ultra-mini
  ActiveCatSystem.initMover(narrowMover, mockState());

  const wideMover = mockMover({ width: 140 });   // full-width heavy
  ActiveCatSystem.initMover(wideMover, mockState());

  assert(narrowMover.arcHeight > 0, "AC19: Narrow cat has valid arc height",
    `arcHeight=${narrowMover.arcHeight}`);
  assert(wideMover.arcHeight > 0, "AC20: Wide cat has valid arc height",
    `arcHeight=${wideMover.arcHeight}`);

  // Wide cat should have different horizontal bounds
  assert(wideMover.rightBound !== narrowMover.rightBound,
    "AC21: Wide cat has different horizontal bounds than narrow cat");

  // ════════════════════════════════════════════════════════════════════════
  // 8. SMALL PORTRAIT VIEWPORT — No impossible trajectory
  // ════════════════════════════════════════════════════════════════════════

  const smallState = mockState({ W: 320, H: 568 });
  const smallMover = mockMover();
  ActiveCatSystem.initMover(smallMover, smallState);

  assert(smallMover.arcHeight >= ACTIVE_CAT_TRAJECTORY.MIN_ARC_HEIGHT_PX,
    "AC22: Small viewport (320×568) still has minimum arc height",
    `arcHeight=${smallMover.arcHeight}`);

  // Cat should be visible on small screen
  const smallT = (Math.sin(smallMover.phase) + 1) / 2;
  assert(smallMover.x >= -smallMover.width && smallMover.x <= smallState.W,
    "AC23: Cat is within visible area on small viewport");

  // ════════════════════════════════════════════════════════════════════════
  // 9. TIMING AFFECTS LANDING POSITION
  // ════════════════════════════════════════════════════════════════════════

  // Early TAP (near edge) vs Mid TAP (near center) → different drift
  function simulateRelease(phaseAdvance) {
    const s = mockState();
    const m = mockMover();
    ActiveCatSystem.initMover(m, s);
    for (let i = 0; i < phaseAdvance; i++) {
      ActiveCatSystem.update(m, 1.0, s);
    }
    m.state = "falling";
    ActiveCatSystem.update(m, 1.0, s); // trigger release
    return m.vx;
  }

  const earlyVx = simulateRelease(10);   // near edge
  const midVx   = simulateRelease(63);   // near center (max velocity)
  const lateVx  = simulateRelease(120);  // past center (returning)

  assert(Math.abs(midVx) > Math.abs(earlyVx),
    "AC24: Mid-trajectory TAP gives more horizontal momentum than edge TAP",
    `earlyVx=${earlyVx.toFixed(3)}, midVx=${midVx.toFixed(3)}`);

  // ════════════════════════════════════════════════════════════════════════
  // 10. BACKWARD COMPATIBILITY
  // ════════════════════════════════════════════════════════════════════════

  assert(ACTIVE_CAT_CONFIG !== undefined, "AC25: ACTIVE_CAT_CONFIG export preserved for compatibility");

} catch(err) {
  assert(false, "EX-RUNTIME: Uncaught exception in active cat test suite", err.stack || String(err));
}

console.log(`\n======================================================================`);
console.log(`   ACTIVE CAT TRAJECTORY RESULTS: ${passed} PASSED, ${failed} FAILED OUT OF ${passed + failed}`);
console.log(`======================================================================\n`);

if (failed > 0) process.exit(1);
