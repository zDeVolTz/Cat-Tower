/**
 * Cat Tower Stack — Jenga Physics Engine Unit Test Suite
 * Verifies Mass Formulas, Overlap Stability, Center of Mass, Teetering Pivots, and Stamping Recovery.
 */

import { BLOCK_H, PHYSICS_CONFIG, BLOCK_TYPES } from "./src/game/config.js";
import { state, resetGameState, calculateBlockMass, getBlockSwayX } from "./src/game/gameState.js";
import { evaluateBlockStability, checkTowerCenterOfMass, PhysicsEngine, handleDrop } from "./src/game/physics.js";

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
console.log("   SECTION: JENGA PHYSICS & STABILITY UNIT TESTS");
console.log("======================================================================\n");

try {
  state.columnWidth = 140; state.columnLeft = 130;

  // ─── 1. MASS SCALING FORMULAS ───
  const massNormal140 = calculateBlockMass("normal", false, 140);
  assert(massNormal140 === 1.0, "J001: Normal cat full-width mass = 1.0");

  const massNormal70 = calculateBlockMass("normal", false, 70);
  assert(massNormal70 > 0.30 && massNormal70 < 0.42, "J002: Half-width block mass scales exponentially (1.4 exponent)");

  const massHeavy140 = calculateBlockMass("heavy", false, 140);
  assert(massHeavy140 === 2.2, "J003: Heavy cat full-width mass = 2.2");

  const massLight140 = calculateBlockMass("light", false, 140);
  assert(massLight140 === 0.5, "J004: Light cat full-width mass = 0.5");

  const massGoldenNormal = calculateBlockMass("normal", true, 140);
  assert(massGoldenNormal === 1.5, "J005: Golden cat block receives 1.5x mass multiplier");

  // ─── 2. FOOTPRINT STABILITY & OVERHANG ───
  resetGameState();
  state.blocks = [{ x: 130, width: 140, y: 0, settled: true }];

  const stableFull = evaluateBlockStability(130, 140, BLOCK_H);
  assert(stableFull.stable === true && stableFull.overlapRatio === 1.0, "J006: 100% overlap drop is fully stable");

  const stable70 = evaluateBlockStability(130 + 42, 140, BLOCK_H); // 70% overlap
  assert(stable70.stable === true, "J007: 70% overlap drop is stable (>30%)");

  const unstable15 = evaluateBlockStability(130 + 120, 140, BLOCK_H); // 14% overlap
  assert(unstable15.stable === false, "J008: 14% overlap drop is unstable (<30%)");
  assert(unstable15.slideDirection === 1, "J009: Right-overhanging block detects rightward fall direction (+1)");

  // ─── 2b. STABILITY MUST AGREE WITH THE PLAYER'S ON-SCREEN VIEW WHEN THE TOWER IS LEANING ───
  // Regression test for a real bug in handleDrop(): it was feeding evaluateBlockStability
  // the sway-corrected "local" storage coordinate instead of the block's real, current
  // on-screen (absolute) position, while support blocks are compared in absolute
  // coordinates internally. A visually perfectly-centered drop on a leaning, tall tower
  // was scored as 0% overlap and treated as unstable. This must go through handleDrop()
  // itself (not call evaluateBlockStability directly) — the bug lived in which coordinate
  // handleDrop() chose to pass, not in the stability math itself.
  {
    const savedState = {
      blocks: state.blocks, towerAngle: state.towerAngle, mover: state.mover,
      status: state.status, columnLeft: state.columnLeft, columnWidth: state.columnWidth,
      columnRight: state.columnRight, cameraY: state.cameraY, W: state.W, H: state.H
    };

    state.status = "playing";
    state.columnLeft = 130; state.columnWidth = 140; state.columnRight = 270;
    state.W = 400; state.H = 700; state.cameraY = 0;

    const supportY = 800; // a realistic mid-run height (~17 floors)
    state.blocks = [{ x: 130, width: 140, y: supportY, typeId: "normal", mass: 1, color: "#fff", settled: true }];
    state.towerAngle = 0.15; // ~8.6°, an ordinary in-game lean, well under collapse

    const supportSway = Math.sin(state.towerAngle) * supportY; // sway of the support, at its own y
    const supportAbsLeft = state.blocks[0].x + supportSway;

    // Player visually centers a full-width block dead-on against the leaning support.
    state.mover = {
      x: supportAbsLeft, width: 140, y: supportY, dir: 1, speed: 0,
      typeId: "normal", color: "#fff", mass: 1, isGolden: false
    };

    handleDrop();

    const placed = state.blocks[state.blocks.length - 1];
    assert(placed && placed.settled === true && placed.isTeetering !== true,
      "J009b: A visually perfect drop (through real handleDrop()) stays stable even when the tower is leaning at real height");

    state.blocks = savedState.blocks; state.towerAngle = savedState.towerAngle; state.mover = savedState.mover;
    state.status = savedState.status; state.columnLeft = savedState.columnLeft;
    state.columnWidth = savedState.columnWidth; state.columnRight = savedState.columnRight;
    state.cameraY = savedState.cameraY; state.W = savedState.W; state.H = savedState.H;
  }

  // ─── 2c. COUNTER-STAMP PIVOT MUST TRACK THE TOWER'S CURRENT LEAN, NOT A FROZEN SNAPSHOT ───
  // Regression test for a real bug: a teetering block's tiltPivotX was stored as an absolute
  // on-screen snapshot taken the moment it started teetering, then later compared against a
  // sway value computed at the wrong height entirely (the new drop's landing y, not the
  // support's y). Once towerAngle drifted after the block started teetering — which happens
  // continuously in real play — "landed on the raised side?" could be judged tens of pixels
  // off from what the player actually saw on screen.
  {
    const savedState = {
      blocks: state.blocks, towerAngle: state.towerAngle, mover: state.mover,
      status: state.status, columnLeft: state.columnLeft, columnWidth: state.columnWidth,
      columnRight: state.columnRight, cameraY: state.cameraY, W: state.W, H: state.H
    };

    state.status = "playing";
    state.columnLeft = 130; state.columnWidth = 140; state.columnRight = 270;
    state.W = 400; state.H = 700; state.cameraY = 0;

    const baseY = 800;
    state.blocks = [{ x: 130, width: 140, y: baseY, typeId: "normal", mass: 1, color: "#fff", settled: true }];

    // Tower is already leaning when the teetering block is created (realistic: it's been leaning a while).
    state.towerAngle = 0.10;
    const swayAtCreation = getBlockSwayX(baseY);
    state.mover = { x: 130 + swayAtCreation + 100, width: 140, y: baseY, dir: 1, speed: 0, typeId: "normal", color: "#fff", mass: 1, isGolden: false };
    handleDrop();
    const teetering = state.blocks[state.blocks.length - 1];
    assert(teetering.isTeetering === true, "J009c-setup: overhanging drop creates a teetering block");

    // Tower keeps drifting further after that (continuous, as in real play).
    state.towerAngle = 0.20;
    const supportY = teetering.y - BLOCK_H;
    const trueCurrentPivot = 270 + getBlockSwayX(supportY); // support's real right edge, right now

    // Player aims precisely at the true, currently-visible raised (left) side of the block —
    // a normal, deliberate stamp attempt using what they actually see on screen.
    const stampX = trueCurrentPivot - 30;
    state.mover = { x: stampX, width: 40, y: teetering.y, dir: 1, speed: 0, typeId: "normal", color: "#fff", mass: 3, isGolden: false };
    handleDrop();

    assert(teetering.isTeetering === false,
      "J009c: A stamp aimed at the block's true current raised side flattens it, even after the tower leaned further since it started teetering");

    state.blocks = savedState.blocks; state.towerAngle = savedState.towerAngle; state.mover = savedState.mover;
    state.status = savedState.status; state.columnLeft = savedState.columnLeft;
    state.columnWidth = savedState.columnWidth; state.columnRight = savedState.columnRight;
    state.cameraY = savedState.cameraY; state.W = savedState.W; state.H = savedState.H;
  }

  // ─── 3. CUMULATIVE CENTER OF MASS (CoM) ───
  resetGameState();
  state.columnLeft = 130; state.columnWidth = 140;
  state.blocks = [
    { x: 130, width: 140, y: 0, mass: 1.0 },
    { x: 130, width: 140, y: BLOCK_H, mass: 1.0 },
    { x: 130, width: 140, y: BLOCK_H * 2, mass: 1.0 }
  ];
  assert(checkTowerCenterOfMass().isUnbalanced === false, "J010: Perfectly centered 3-block tower does not trigger CoM collapse");

  state.blocks.push({ x: 230, width: 140, y: BLOCK_H * 3, mass: 2.2 });
  state.blocks.push({ x: 250, width: 140, y: BLOCK_H * 4, mass: 3.3 });
  assert(checkTowerCenterOfMass().isUnbalanced === true, "J011: Severely right-shifted heavy tower triggers CoM collapse");

  // ─── 4. TEETERING AND FALLING BLOCK TESTS ───
  resetGameState();
  state.status = "playing";
  // Base is at x=130..270. Drop block at x=255, width=100. Overlap is 15px (15%).
  state.mover = { x: 255, y: BLOCK_H, width: 100, mass: 1, typeId: "normal", color: "#fff" };
  handleDrop();
  assert(state.blocks.length === 2, "J012: Teetering drop adds block");
  let teeterBlock = state.blocks[1];
  assert(teeterBlock.isTeetering === true, "J013: Block with < 20% overlap is teetering");
  assert(teeterBlock.settled === false, "J014: Teetering block is not settled");

  // Step the block physically a few times to exceed TEETER_MAX_ANGLE (takes ~2 seconds now)
  let tipped = false;
  for (let i = 0; i < 200; i++) {
    if (PhysicsEngine.stepTeeteringBlock(teeterBlock, 1.0, 0.016)) {
      tipped = true;
      break;
    }
  }
  assert(tipped === true, "J015: Teetering block eventually tips over");
  assert(teeterBlock.isFalling === true, "J016: Tipped block transitions to isFalling = true");

  // Test complete miss
  resetGameState();
  state.status = "playing";
  state.mover = { x: 300, y: BLOCK_H, width: 100, mass: 1, typeId: "normal", color: "#fff" }; // Overlap is 0
  handleDrop();
  assert(state.blocks.length === 1, "J017: Completely missed drop does NOT add block to tower");
  assert(state.debris.length === 1, "J018: Completely missed drop creates debris");
  assert(state.status === "collapsing", "J019: Missed drop triggers collapsing state");
  assert(state.blocks[0].isFalling === true, "J019b: Completely missed drop explodes the rest of the tower");

  // ─── 5. CAT ATTRIBUTE CONTRACTS ───
  assert(BLOCK_TYPES.normal.overturnResistance === 1.0, "J020: Normal cat overturn resistance = 1.0");
  assert(BLOCK_TYPES.sticky.overturnResistance === 2.0, "J021: Sticky cat overturn resistance = 2.0");
  assert(BLOCK_TYPES.slippery.overturnResistance === 0.6, "J022: Slippery cat overturn resistance = 0.6");
  assert(BLOCK_TYPES.sticky.friction === 2.0, "J023: Sticky cat surface friction = 2.0");

  // ─── 6. STAGE 1 & 3: MODULAR ENGINE & IMPULSE ATTENUATION ───
  const impulseSmall = PhysicsEngine.calculateDropImpulse(5, 1.0, 5, 200);
  const impulseLarge = PhysicsEngine.calculateDropImpulse(30, 1.0, 5, 200);
  assert(Math.abs(impulseSmall) < Math.abs(impulseLarge) * 0.1, "J024: Small misalignment (<15px) applies heavily attenuated impulse");

  // ─── 7. STAGE 4: MULTI-PHASE COLLAPSE SEQUENCE ───
  resetGameState();
  state.status = "playing";
  state.blocks = [
    { x: 130, width: 140, y: 0, mass: 1.0 },
    { x: 130, width: 140, y: BLOCK_H, mass: 1.0 }
  ];
  PhysicsEngine.startTowerCollapse(state.blocks, 0.2);
  assert(state.blocks[0].isFalling === true, "J025: Tower collapse sets blocks into falling state");
  
  const allCleared = PhysicsEngine.stepCollapsingBlocks(state.blocks, 700, 0.016);
  assert(typeof allCleared === "boolean", "J026: Collapsing step returns boolean indicating off-screen state");

  // ─── 8. SINGLE BLOCK OVERHANG TIPPING & COLLAPSE SEQUENCE (USER BUG COVERAGE) ───
  const singleTeeterBlock = { isTeetering: true, localTilt: 0.45, tiltVel: 0, tiltDir: 1, typeId: "normal" };
  const singleTipped = PhysicsEngine.stepTeeteringBlock(singleTeeterBlock, 1.0, 0.016);
  assert(singleTipped === true && singleTeeterBlock.isFalling === true && singleTeeterBlock.vx > 0, "J027: Single overhanging block tipping over converts to physical falling trajectory");

  resetGameState();
  state.status = "playing";
  state.blocks = [{ x: 130, width: 140, y: 100, isFalling: true, vy: 5, rotVel: 0.02 }];
  PhysicsEngine.startTowerCollapse(state.blocks, 0.2);
  
  // Step simulation frames until collapse finishes
  for (let frame = 0; frame < 150; frame++) {
    const done = PhysicsEngine.stepCollapsingBlocks(state.blocks, 700, 0.016, state);
    if (done) {
      state.status = "over";
      break;
    }
  }
  assert(state.status === "over", "J028: Full tower collapse animation completes and transitions game status to 'over'");

  // ─── 9. TOWER CENTER OF MASS COLLAPSE CAMERA & SCATTER PHYSICS (USER BUG COVERAGE) ───
  resetGameState();
  state.status = "playing";
  state.targetCameraY = 400;
  state.blocks = [
    { x: 130, width: 140, y: 0, mass: 1.0 },
    { x: 250, width: 140, y: BLOCK_H, mass: 3.0 },
    { x: 300, width: 140, y: BLOCK_H * 2, mass: 4.0 }
  ];
  
  PhysicsEngine.startTowerCollapse(state.blocks, 0.5);
  assert(state.blocks.every(b => b.isFalling === true), "J029: All tower blocks enter falling state with scatter velocities");

} catch (err) {
  assert(false, "EX-RUNTIME: Uncaught exception in Jenga physics test suite", err.stack || String(err));
}

console.log(`\n======================================================================`);
console.log(`   JENGA PHYSICS TEST RESULTS: ${passed} PASSED, ${failed} FAILED OUT OF ${passed + failed}`);
console.log(`======================================================================\n`);

if (failed > 0) {
  for (const r of results) {
    if (!r.pass) console.log(`  ❌ FAILED: ${r.name} ${r.details}`);
  }
}
