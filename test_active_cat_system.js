/**
 * Active Cat System — Iteration 1 Spatial Model Test Suite.
 * Verifies the five concepts stay separate and behave correctly:
 *   1. Tower Exclusion Zone
 *   2. Active Flight Zone
 *   3. Visible Gameplay Zone
 *   4. Phantom Trajectory
 *   5. Camera (presentation-only; must not leak into gameplay bounds)
 */
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
console.log(`   SECTION: ACTIVE CAT — ITERATION 1 SPATIAL MODEL`);
console.log(`======================================================================\n`);

try {
  // ════════════════════════════════════════════════════════════════════════
  // CONCEPT 1 — TOWER EXCLUSION ZONE
  // ════════════════════════════════════════════════════════════════════════

  {
    const state = mockState();
    const exclusion = ActiveCatSystem.getTowerExclusionZone(state);
    assert(typeof exclusion.screenTowerTopY === "number", "TZ01: Tower exclusion zone returns a numeric screen-space top Y");
    assert(exclusion.clearanceBoundaryY < exclusion.screenTowerTopY,
      "TZ02: Clearance boundary sits strictly above (smaller Y than) the tower's actual screen top",
      `clearanceBoundaryY=${exclusion.clearanceBoundaryY}, screenTowerTopY=${exclusion.screenTowerTopY}`);

    // Taller tower → exclusion zone boundary must move to a smaller screen-Y (visually higher)
    const tallState = mockState({ blocks: [
      { x: 125, width: 140, y: 0 },
      { x: 125, width: 140, y: BLOCK_H * 10 }
    ]});
    const exclusionTall = ActiveCatSystem.getTowerExclusionZone(tallState);
    assert(exclusionTall.screenTowerTopY < exclusion.screenTowerTopY,
      "TZ03: A taller tower produces a higher (smaller-Y) exclusion boundary than a short tower");
  }

  // ════════════════════════════════════════════════════════════════════════
  // CONCEPT 2 — ACTIVE FLIGHT ZONE (always above tower exclusion zone)
  // ════════════════════════════════════════════════════════════════════════

  {
    const state = mockState();
    const flightZone = ActiveCatSystem.getActiveFlightZone(state);
    const exclusion = ActiveCatSystem.getTowerExclusionZone(state);

    assert(flightZone.ceiling < flightZone.floor, "FZ01: Flight zone ceiling is above its floor (smaller screen-Y)");
    assert(flightZone.height > 0, "FZ02: Flight zone has positive height", `height=${flightZone.height}`);
    assert(flightZone.height >= ACTIVE_CAT_TRAJECTORY.MIN_ARC_HEIGHT_PX,
      "FZ03: Flight zone height respects the minimum arc height floor");
    assert(flightZone.floor <= exclusion.clearanceBoundaryY + 0.01,
      "FZ04: Flight zone floor never dips below (i.e. screen-Y never exceeds) the tower's clearance boundary",
      `floor=${flightZone.floor}, clearanceBoundaryY=${exclusion.clearanceBoundaryY}`);

    const minCeiling = Math.max(state.H * ACTIVE_CAT_TRAJECTORY.ZONE_TOP_RATIO, ACTIVE_CAT_TRAJECTORY.ZONE_TOP_MIN_PX)
      + ACTIVE_CAT_TRAJECTORY.CAT_VISUAL_EXTENT_PX;
    assert(flightZone.ceiling >= minCeiling - 0.01,
      "FZ05: Flight zone ceiling respects the top margin + cat visual extent");

    // Absolute cap: even for a very short tower, floor never exceeds 40% of H
    assert(flightZone.floor <= state.H * ACTIVE_CAT_TRAJECTORY.MAX_FLOOR_RATIO + 0.01,
      "FZ06: Flight zone floor respects the MAX_FLOOR_RATIO absolute cap");
  }

  // Tower whose top is still within camera view: exclusion zone is the
  // binding constraint, and the flight zone must clear it.
  {
    const tallState = mockState({ blocks: [
      { x: 125, width: 140, y: 0 },
      { x: 125, width: 140, y: BLOCK_H * 6 } // top still on-screen at this camera position
    ]});
    const flightZone = ActiveCatSystem.getActiveFlightZone(tallState);
    const exclusion = ActiveCatSystem.getTowerExclusionZone(tallState);
    assert(flightZone.floor <= exclusion.clearanceBoundaryY + 0.01,
      "FZ07: When the tower's top is on-screen, flight zone floor stays at/above the tower's clearance boundary",
      `floor=${flightZone.floor}, clearanceBoundaryY=${exclusion.clearanceBoundaryY}`);
    assert(flightZone.height >= ACTIVE_CAT_TRAJECTORY.MIN_ARC_HEIGHT_PX,
      "FZ08: Tall-tower flight zone still respects the minimum arc height (never collapses to zero/negative)");
  }

  // Extremely tall tower whose top has scrolled off-screen (camera hasn't
  // caught up, or a synthetic worst case): the exclusion zone itself is no
  // longer on-screen, so the absolute MAX_FLOOR_RATIO/MIN_ARC_HEIGHT_PX
  // safety caps correctly take over and keep the flight zone in a sane,
  // playable place near the top of the viewport instead of chasing a
  // clearance boundary that isn't visible anyway.
  {
    const offscreenTallState = mockState({ blocks: [
      { x: 125, width: 140, y: 0 },
      { x: 125, width: 140, y: BLOCK_H * 25 }
    ]});
    const flightZone = ActiveCatSystem.getActiveFlightZone(offscreenTallState);
    assert(flightZone.floor <= offscreenTallState.H * ACTIVE_CAT_TRAJECTORY.MAX_FLOOR_RATIO + 0.01,
      "FZ09: When the tower's top is off-screen, flight zone floor still respects the MAX_FLOOR_RATIO absolute cap");
    assert(flightZone.height >= ACTIVE_CAT_TRAJECTORY.MIN_ARC_HEIGHT_PX,
      "FZ10: Off-screen-tower flight zone still respects the minimum arc height");
  }

  // ════════════════════════════════════════════════════════════════════════
  // CONCEPT 3 — VISIBLE GAMEPLAY ZONE (horizontal, independent of vertical zone)
  // ════════════════════════════════════════════════════════════════════════

  {
    const state = mockState();
    const mover = mockMover({ width: 100 });
    const visible = ActiveCatSystem.getVisibleGameplayZone(mover, state);
    assert(visible.left < visible.right, "VZ01: Visible zone left bound < right bound");

    const narrow = ActiveCatSystem.getVisibleGameplayZone(mockMover({ width: 36 }), state);
    const wide = ActiveCatSystem.getVisibleGameplayZone(mockMover({ width: 140 }), state);
    assert(narrow.right !== wide.right, "VZ02: Visible zone bounds adapt to different cat widths");
  }

  // ════════════════════════════════════════════════════════════════════════
  // CONCEPT 4 — PHANTOM TRAJECTORY (strictly wider than the visible zone)
  // ════════════════════════════════════════════════════════════════════════

  {
    const state = mockState();
    const mover = mockMover({ width: 100 });
    const phantom = ActiveCatSystem.getPhantomTrajectory(mover, state);

    assert(phantom.phantomLeft < phantom.visible.left,
      "PT01: Phantom left bound extends further left than the visible zone's left bound");
    assert(phantom.phantomRight > phantom.visible.right,
      "PT02: Phantom right bound extends further right than the visible zone's right bound");
    assert(phantom.phantomMargin > 0, "PT03: Phantom margin is a positive distance");

    // Phantom margin must be independent from OFFSCREEN_FRACTION edge inset —
    // these are concept (3)'s own edge tolerance vs. concept (4)'s separate travel budget.
    const expectedMargin = mover.width * ACTIVE_CAT_TRAJECTORY.PHANTOM_MARGIN_FRACTION;
    assert(Math.abs(phantom.phantomMargin - expectedMargin) < 0.01,
      "PT04: Phantom margin matches PHANTOM_MARGIN_FRACTION independently of visible-zone edge inset");
  }

  // ════════════════════════════════════════════════════════════════════════
  // CONCEPT 5 — CAMERA — must not leak into gameplay-bound math
  // ════════════════════════════════════════════════════════════════════════

  {
    const mover = mockMover({ width: 100 });
    const stateA = mockState({ cameraY: 0 });
    const stateB = mockState({ cameraY: 5000 }); // wildly different camera position

    // Horizontal zones (3 and 4) must be camera-independent: camera is a
    // vertical world<->screen conversion only, never touches X math.
    const visibleA = ActiveCatSystem.getVisibleGameplayZone(mover, stateA);
    const visibleB = ActiveCatSystem.getVisibleGameplayZone(mover, stateB);
    assert(visibleA.left === visibleB.left && visibleA.right === visibleB.right,
      "CAM01: Visible gameplay zone (horizontal) is completely unaffected by camera position");

    const phantomA = ActiveCatSystem.getPhantomTrajectory(mover, stateA);
    const phantomB = ActiveCatSystem.getPhantomTrajectory(mover, stateB);
    assert(phantomA.phantomLeft === phantomB.phantomLeft && phantomA.phantomRight === phantomB.phantomRight,
      "CAM02: Phantom trajectory (horizontal) is completely unaffected by camera position");
  }

  // ════════════════════════════════════════════════════════════════════════
  // INTEGRATION — initMover wires all five concepts together correctly
  // ════════════════════════════════════════════════════════════════════════

  {
    const state = mockState();
    const mover = mockMover();
    ActiveCatSystem.initMover(mover, state);

    assert(mover.trajectoryCeiling !== undefined, "IN01: initMover sets trajectoryCeiling from the flight zone");
    assert(mover.trajectoryFloor !== undefined, "IN02: initMover sets trajectoryFloor from the flight zone");
    assert(mover.arcHeight > 0, "IN03: arcHeight is positive");
    assert(mover.leftBound !== undefined && mover.rightBound !== undefined, "IN04: initMover sets visible-zone bounds");
    assert(mover.phantomLeft !== undefined && mover.phantomRight !== undefined, "IN05: initMover sets phantom-trajectory bounds");
    assert(mover.phantomLeft < mover.leftBound, "IN06: Phantom left bound is strictly outside (left of) the visible left bound");
    assert(mover.phantomRight > mover.rightBound, "IN07: Phantom right bound is strictly outside (right of) the visible right bound");
  }

  // ════════════════════════════════════════════════════════════════════════
  // PHANTOM ENTRY BEHAVIOR — cat starts invisible, becomes visible only inside zone 3
  // ════════════════════════════════════════════════════════════════════════

  {
    const state = mockState();
    const mover = mockMover({ dir: 1 }); // spawns from left
    ActiveCatSystem.initMover(mover, state);

    assert(mover.isVisible === false, "PE01: Cat starts invisible (in the phantom segment) immediately after spawn");
    assert(mover.x + mover.width <= mover.visibleScreenLeft + 0.01,
      "PE02: At spawn, cat's bounding box is entirely outside the actual visible screen span (still phantom)",
      `x=${mover.x}, width=${mover.width}, visibleScreenLeft=${mover.visibleScreenLeft}`);

    // Step forward until it becomes visible; confirm it does so before running off the phantom end.
    let becameVisible = false;
    for (let i = 0; i < 400; i++) {
      ActiveCatSystem.update(mover, 1.0, state);
      if (mover.state === "missed") break;
      if (mover.isVisible) { becameVisible = true; break; }
    }
    assert(becameVisible === true, "PE03: Cat eventually crosses from phantom into the visible zone during flight");
  }

  // Right-spawn mirrors left-spawn
  {
    const state = mockState();
    const mover = mockMover({ dir: -1 }); // spawns from right
    ActiveCatSystem.initMover(mover, state);
    assert(mover.isVisible === false, "PE04: Right-spawning cat also starts invisible");
    assert(mover.x >= mover.visibleScreenRight - 0.01,
      "PE05: Right-spawning cat starts at/outside the actual visible screen span (still phantom)",
      `x=${mover.x}, visibleScreenRight=${mover.visibleScreenRight}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // SAFE ZONE — Cat's visual bottom never intersects the tower exclusion zone
  // ════════════════════════════════════════════════════════════════════════

  {
    const simState = mockState();
    const simMover = mockMover();
    ActiveCatSystem.initMover(simMover, simState);

    const exclusion = ActiveCatSystem.getTowerExclusionZone(simState);
    let maxCatBottomY = 0;
    const NUM_STEPS = 300;

    for (let i = 0; i < NUM_STEPS; i++) {
      ActiveCatSystem.update(simMover, 1.0, simState);
      if (simMover.state === "missed") break;
      const catScreenY = simState.H - GROUND_MARGIN - (simMover.y - simState.cameraY) - BLOCK_H;
      const catBottomY = catScreenY + ACTIVE_CAT_TRAJECTORY.CAT_VISUAL_EXTENT_PX;
      if (catBottomY > maxCatBottomY) maxCatBottomY = catBottomY;
    }

    assert(maxCatBottomY < exclusion.screenTowerTopY,
      "SZ01: Cat visual bottom never reaches the tower's actual top (safe zone maintained)",
      `maxCatBottom=${maxCatBottomY.toFixed(1)}, towerTop=${exclusion.screenTowerTopY}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // TAP RELEASE — Horizontal momentum retained; falling ignores visibility gate
  // ════════════════════════════════════════════════════════════════════════

  {
    const tapState = mockState();
    const tapMover = mockMover();
    ActiveCatSystem.initMover(tapMover, tapState);

    // Advance to middle of trajectory (max horizontal velocity)
    for (let i = 0; i < 63; i++) {
      ActiveCatSystem.update(tapMover, 1.0, tapState);
      if (tapMover.state === "missed") break;
    }

    tapMover.state = "falling";
    const preTapY = tapMover.y;
    ActiveCatSystem.update(tapMover, 1.0, tapState);

    assert(tapMover._released === true, "TAP01: TAP triggers release momentum computation");
    assert(tapMover.isVisible === true, "TAP02: Cat is always visible once falling, regardless of visible-zone position");
    assert(tapMover.y < preTapY, "TAP03: Cat falls downward after TAP (world Y decreases)");
  }

  // ════════════════════════════════════════════════════════════════════════
  // RELEASE PHYSICS — Correct k-system units (unchanged from prior iteration)
  // ════════════════════════════════════════════════════════════════════════

  assert(ACTIVE_CAT_TRAJECTORY.FALL_GRAVITY === 2.0,
    "RP01: FALL_GRAVITY matches existing k-system value (2.0)");
  assert(ACTIVE_CAT_TRAJECTORY.RELEASE_HORIZONTAL_RETAIN > 0 && ACTIVE_CAT_TRAJECTORY.RELEASE_HORIZONTAL_RETAIN < 1,
    "RP02: RELEASE_HORIZONTAL_RETAIN is a valid fraction (0..1)");

  // ════════════════════════════════════════════════════════════════════════
  // SMALL PORTRAIT VIEWPORT — No impossible trajectory
  // ════════════════════════════════════════════════════════════════════════

  {
    const smallState = mockState({ W: 320, H: 568 });
    const smallMover = mockMover();
    ActiveCatSystem.initMover(smallMover, smallState);

    assert(smallMover.arcHeight >= ACTIVE_CAT_TRAJECTORY.MIN_ARC_HEIGHT_PX,
      "SV01: Small viewport (320×568) still has minimum arc height",
      `arcHeight=${smallMover.arcHeight}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // BACKWARD COMPATIBILITY
  // ════════════════════════════════════════════════════════════════════════

  assert(ACTIVE_CAT_CONFIG !== undefined, "BC01: ACTIVE_CAT_CONFIG export preserved for compatibility");

} catch(err) {
  failed++;
  console.error(`  ❌ FAILED: EX-RUNTIME: Uncaught exception in active cat test suite`);
  console.error(`     Details: ${err.stack || String(err)}`);
}

console.log(`\n======================================================================`);
console.log(`   ACTIVE CAT SPATIAL MODEL RESULTS: ${passed} PASSED, ${failed} FAILED OUT OF ${passed + failed}`);
console.log(`======================================================================\n`);

if (failed > 0) process.exitCode = 1;
