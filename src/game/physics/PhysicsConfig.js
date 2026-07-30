/**
 * Single source of truth for all Physics parameters, constants, and balance tuners.
 */
export const PhysicsConfig = {
  PHYSICS_SUBSTEP_MS: 4,        // Fixed timestep for numerical stability (4ms = 250Hz)
  GRAVITY_FACTOR: 0.0006,       // How strongly gravity pulls off-center mass
  BASE_STIFFNESS: 0.8,          // Restoring spring force (foundation rigidity)
  BASE_DAMPING: 1.2,            // Angular velocity friction
  MAX_ANGULAR_VELOCITY: 0.015,  // Clamp: prevents single-frame explosions
  MAX_SAFE_TILT: 0.26,          // UI warning threshold (~15 degrees)
  CRITICAL_TILT: 0.40,          // Collapse threshold (~23 degrees)
  DROP_IMPULSE_FACTOR: 0.0008,  // How much a misaligned drop pushes the tower sway

  // Jenga Physics & Stability Parameters
  STABILITY_OVERLAP_MIN: 0.30,  // Minimum footprint overlap ratio (30%)
  WEIGHT_LENGTH_EXPONENT: 1.4,  // Exponential mass scaling by block width
  COM_CRITICAL_OFFSET: 0.35,    // Cumulative Center of Mass offset collapse threshold (35%)
  TEETER_BASE_ACCEL: 0.25,      // Angular acceleration (rad/s^2) for cinematic slow teetering
  TEETER_MAX_ANGLE: 0.42,       // Critical local tilt (~24 deg) before block tips over
  STAMP_RECOVERY_FORCE: 0.06,   // Flattening force when landing on raised side of teetering block

  // Stage 3 Sway Damping & Thresholding
  SMALL_ERROR_DEADZONE_PX: 15,  // Drops within 15px apply minimal sway impulse
  IMPULSE_ATTENUATION: 0.30     // Attenuation factor for small misalignment errors
};
