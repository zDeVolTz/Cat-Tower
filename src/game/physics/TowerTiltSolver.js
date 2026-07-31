/**
 * TowerTiltSolver — Calculates the drop-impulse contribution to tower sway.
 *
 * NOTE: this module does NOT drive the live per-frame tower-sway simulation.
 * The actual continuous pendulum integration (gravity/spring/damping torque,
 * every physics substep) lives inline in gameLoop.js's physicsTick(), which
 * predates this modular engine and was never migrated to call in here. Only
 * calculateDropImpulse() below is on the live path (via PhysicsEngine, called
 * from physics.js's handleDrop). Keep that in mind before tuning PhysicsConfig
 * fields that sound sway-related — check gameLoop.js's physicsTick first.
 */
import { PhysicsConfig } from "./PhysicsConfig.js";

export class TowerTiltSolver {
  /**
   * Computes impulse to apply to tower angular velocity on block drop.
   * Stage 3 Requirement: Small misalignments (deadzone < 15px) apply attenuated impulse!
   */
  static calculateDropImpulse(misalignment, blockMass, totalBlocks, towerHeight) {
    const deadzone = PhysicsConfig.SMALL_ERROR_DEADZONE_PX || 15;
    const absError = Math.abs(misalignment);

    let effectiveMisalignment = misalignment;
    if (absError <= deadzone) {
      // Scale down small errors progressively so small misalignments do not trigger artificial sway!
      const factor = Math.pow(absError / deadzone, 1.8) * PhysicsConfig.IMPULSE_ATTENUATION;
      effectiveMisalignment = misalignment * factor;
    }

    const momentOfInertia = totalBlocks * towerHeight * 0.01 + 1;
    const impulse = (effectiveMisalignment * blockMass * (PhysicsConfig.DROP_IMPULSE_FACTOR * 0.35)) / momentOfInertia;
    return impulse;
  }
}
