/**
 * FallingSolver — Handles edge-pivot teetering physics (Stage 2),
 * and multi-phase block collapse falling physics (Stage 4).
 */
import { BLOCK_H } from "../config.js";
import { PhysicsConfig } from "./PhysicsConfig.js";

export class FallingSolver {
  /**
   * Integrates local teetering edge rotation for overhanging blocks.
   * Returns true if block tipped over critical angle (Stage 2 fix).
   */
  static stepTeeteringBlock(block, friction, dt, towerAngle = 0) {
    if (!block || !block.isTeetering) return false;

    const P = PhysicsConfig;
    const slideFactor = friction ? (1.0 / friction) : 1.0;

    // Proper integration in SECONDS for smooth, cinematic teetering.
    // The user wants time to stabilize the block.
    const accel = P.TEETER_BASE_ACCEL * slideFactor * (1 + Math.abs(block.localTilt) * 2);
    block.tiltVel += block.tiltDir * accel * dt;
    block.localTilt += block.tiltVel * dt;

    // Stage 2: Returns true when tilt exceeds TEETER_MAX_ANGLE (~24 deg)
    const exceeds = Math.abs(block.localTilt) >= P.TEETER_MAX_ANGLE;
    if (exceeds) {
      this.triggerSingleBlockFall(block, towerAngle);
    }
    return exceeds;
  }

  /**
   * Converts a single overhanging teetering block into a falling physics object.
   */
  static triggerSingleBlockFall(block, towerAngle = 0) {
    if (!block) return;
    
    // Bake visual tower sway into physical properties
    block.x += block.y * Math.sin(towerAngle);
    block.rot = towerAngle + (block.localTilt || 0);
    
    block.isTeetering = false;
    block.isFalling = true;
    block.settled = false;
    const dir = block.tiltDir || 1;
    block.vx = dir * (1.2 + Math.random() * 1.0);
    block.vy = -2.0; // Subtle upward pop
    block.rotVel = dir * (0.02 + Math.random() * 0.02);
  }

}
