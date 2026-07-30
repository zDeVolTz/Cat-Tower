/**
 * TowerTiltSolver — Calculates harmonic pendulum tower sway equations,
 * moment of inertia, gravitational torque, and drop impulses.
 */
import { BLOCK_H } from "../config.js";
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

  /**
   * Integrates tower sway angle for a single substep timestep dt.
   */
  static stepSway(towerAngle, angularVelocity, totalMass, towerHeight, comOffset, dt) {
    const P = PhysicsConfig;

    const gravityTorque = Math.sin(towerAngle) * P.GRAVITY_FACTOR * totalMass + (comOffset * 0.0005);
    const springTorque = -towerAngle * P.BASE_STIFFNESS;
    const dampingTorque = -angularVelocity * P.BASE_DAMPING;

    const I = totalMass * towerHeight * 0.01 + 1;
    const alpha = (gravityTorque + springTorque + dampingTorque) / I;

    let newVel = angularVelocity + alpha * dt;
    newVel = Math.max(-P.MAX_ANGULAR_VELOCITY, Math.min(P.MAX_ANGULAR_VELOCITY, newVel));
    let newAngle = towerAngle + newVel * dt;

    return {
      towerAngle: newAngle,
      towerAngularVelocity: newVel
    };
  }
}
