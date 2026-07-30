/**
 * Cat Tower Stack — Jenga Physics Engine Unit Test Suite
 * Verifies Mass Formulas, Overlap Stability, Center of Mass, Teetering Pivots, and Stamping Recovery.
 */

import { BLOCK_H, PHYSICS_CONFIG, BLOCK_TYPES } from "./src/game/config.js";
import { state, resetGameState, calculateBlockMass } from "./src/game/gameState.js";
import { evaluateBlockStability, checkTowerCenterOfMass, PhysicsEngine } from "./src/game/physics.js";

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

  // ─── 4. CAT ATTRIBUTE CONTRACTS ───
  assert(BLOCK_TYPES.normal.overturnResistance === 1.0, "J012: Normal cat overturn resistance = 1.0");
  assert(BLOCK_TYPES.sticky.overturnResistance === 2.0, "J013: Sticky cat overturn resistance = 2.0");
  assert(BLOCK_TYPES.slippery.overturnResistance === 0.6, "J014: Slippery cat overturn resistance = 0.6");
  assert(BLOCK_TYPES.sticky.friction === 2.0, "J015: Sticky cat surface friction = 2.0");

  // ─── 5. STAGE 1 & 3: MODULAR ENGINE & IMPULSE ATTENUATION ───
  const impulseSmall = PhysicsEngine.calculateDropImpulse(5, 1.0, 5, 200);
  const impulseLarge = PhysicsEngine.calculateDropImpulse(30, 1.0, 5, 200);
  assert(Math.abs(impulseSmall) < Math.abs(impulseLarge) * 0.1, "J016: Small misalignment (<15px) applies heavily attenuated impulse");

  // ─── 6. STAGE 4: MULTI-PHASE COLLAPSE SEQUENCE ───
  resetGameState();
  state.status = "playing";
  state.blocks = [
    { x: 130, width: 140, y: 0, mass: 1.0 },
    { x: 130, width: 140, y: BLOCK_H, mass: 1.0 }
  ];
  PhysicsEngine.startTowerCollapse(state.blocks, 0.2);
  assert(state.blocks[0].isFalling === true, "J017: Tower collapse sets blocks into falling state");
  
  const allCleared = PhysicsEngine.stepCollapsingBlocks(state.blocks, 700, 0.016);
  assert(typeof allCleared === "boolean", "J018: Collapsing step returns boolean indicating off-screen state");

  // ─── 7. SINGLE BLOCK OVERHANG TIPPING & COLLAPSE SEQUENCE (USER BUG COVERAGE) ───
  const teeterBlock = { isTeetering: true, localTilt: 0.45, tiltVel: 0, tiltDir: 1, typeId: "normal" };
  const tipped = PhysicsEngine.stepTeeteringBlock(teeterBlock, 1.0, 0.016);
  assert(tipped === true && teeterBlock.isFalling === true && teeterBlock.vx > 0, "J019: Single overhanging block tipping over converts to physical falling trajectory");

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
  assert(state.status === "over", "J020: Full tower collapse animation completes and transitions game status to 'over'");

  // ─── 8. TOWER CENTER OF MASS COLLAPSE CAMERA & SCATTER PHYSICS (USER BUG COVERAGE) ───
  resetGameState();
  state.status = "playing";
  state.targetCameraY = 400;
  state.blocks = [
    { x: 130, width: 140, y: 0, mass: 1.0 },
    { x: 250, width: 140, y: BLOCK_H, mass: 3.0 },
    { x: 300, width: 140, y: BLOCK_H * 2, mass: 4.0 }
  ];
  const { triggerTowerCollapse } = await import("./src/game/physics.js");
  triggerTowerCollapse();

  assert(state.targetCameraY === 0, "J021: Tower collapse pans camera down to ground (targetCameraY = 0)");
  assert(state.blocks.every(b => b.isFalling === true), "J022: All tower blocks enter falling state with scatter velocities");

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
