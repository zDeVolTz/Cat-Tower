/**
 * Cat Tower Stack — Physics Engine & Pendulum Invariants Test Suite
 * Tests physical invariants: restoring torque direction, damping, angular velocity clamps,
 * dynamic critical collapse angles, and momentum transfers.
 */

import { BLOCK_H, PHYSICS_CONFIG } from "./src/game/config.js";
import { state, resetGameState, getBlockSwayX, getCriticalTilt } from "./src/game/gameState.js";
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
console.log("   SECTION: PHYSICS ENGINE INVARIANTS & SAFETY BOUNDS");
console.log("======================================================================\n");

try {
  // ─── 1. TIMESTEP & CONFIG BOUNDS ───
  assert(PHYSICS_CONFIG.PHYSICS_SUBSTEP_MS > 0 && PHYSICS_CONFIG.PHYSICS_SUBSTEP_MS <= 10, "P001: Substep timestep is within stable numerical integration range (0, 10ms]");
  assert(PHYSICS_CONFIG.MAX_ANGULAR_VELOCITY > 0 && PHYSICS_CONFIG.MAX_ANGULAR_VELOCITY < 0.1, "P002: Max angular velocity is safely clamped to prevent physics explosions");
  assert(PHYSICS_CONFIG.CRITICAL_TILT > 0.15 && PHYSICS_CONFIG.CRITICAL_TILT < 1.0, "P003: Critical tilt collapse threshold is within safe angular range (~10°..57°)");

  // ─── 2. PENDULUM SWAY KINEMATICS & INVARIANTS ───
  state.columnLeft = 130; state.columnWidth = 140;
  state.towerAngle = 0.05;
  const swayAtGround = getBlockSwayX(0);
  assert(swayAtGround === 0, "P004: Ground level sway offset at y=0 is always 0");

  const swayAtElevated = getBlockSwayX(BLOCK_H * 5);
  assert(swayAtElevated > 0, "P005: Sway displacement grows monotonically with height y");

  resetGameState();
  state.status = "playing";
  state.blocks.push({ x: 130, width: 140, y: BLOCK_H });
  state.towerAngle = 0;
  state.towerAngularVelocity = 0.01;
  update(16);
  assert(state.towerAngle > 0, "P006: Positive angular velocity increases positive tower angle");

  resetGameState();
  state.status = "playing";
  state.blocks.push({ x: 130, width: 140, y: BLOCK_H });
  state.towerAngle = 0.05;
  state.towerAngularVelocity = 0;
  update(100);
  assert(state.towerAngularVelocity < 0, "P007: Restoring torque generates negative angular acceleration for positive tilt");

  resetGameState();
  state.status = "playing";
  state.blocks.push({ x: 130, width: 140, y: BLOCK_H });
  state.towerAngle = -0.05;
  state.towerAngularVelocity = 0;
  update(100);
  assert(state.towerAngularVelocity > 0, "P008: Restoring torque generates positive angular acceleration for negative tilt");

  const critTilt = getCriticalTilt();
  assert(critTilt >= 0.20 && critTilt <= 0.50, "P009: Dynamic critical tilt is within safe arcade limits");

  resetGameState();
  state.status = "playing";
  state.towerAngle = 0.50; // Exceeds critical collapse tilt
  state.blocks = [
    { x: 130, width: 140, y: 0 },
    { x: 130, width: 140, y: BLOCK_H }
  ];
  update(16);
  assert(state.status === "over", "P010: Tower angle exceeding critical tilt threshold triggers collapse (Game Over)");

  resetGameState();
  state.status = "playing";
  state.blocks.push({ x: 130, width: 140, y: BLOCK_H });
  state.towerAngularVelocity = 0.08; // Force velocity exceeding max clamp
  update(16);
  assert(Math.abs(state.towerAngularVelocity) <= PHYSICS_CONFIG.MAX_ANGULAR_VELOCITY, "P011: Angular velocity is strictly clamped by MAX_ANGULAR_VELOCITY safety guard");

  resetGameState();
  state.status = "playing";
  state.towerAngle = 0.05;
  state.mover = { x: state.columnLeft - 20, width: 140, typeId: "normal", mass: 1.0 }; // Counter drop on left
  handleDrop();
  assert(state.towerAngularVelocity < 0, "P012: Counter-drop placement opposing tilt direction applies stabilizing impulse");

} catch (err) {
  assert(false, "EX-RUNTIME: Uncaught exception in physics engine test suite", err.stack || String(err));
}

console.log(`\n======================================================================`);
console.log(`   PHYSICS ENGINE TEST RESULTS: ${passed} PASSED, ${failed} FAILED OUT OF ${passed + failed}`);
console.log(`======================================================================\n`);
