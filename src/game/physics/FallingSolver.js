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
  static stepTeeteringBlock(block, friction, dt) {
    if (!block || !block.isTeetering) return false;

    // dt is in SECONDS
    const k = dt * 60; // k is ~1.0 at 60 FPS

    const P = PhysicsConfig;
    const slideFactor = friction ? (1.0 / friction) : 1.0;

    // accel is per-frame (assuming k=1 for 60fps)
    const accel = P.TEETER_BASE_ACCEL * 60 * slideFactor * (1 + Math.abs(block.localTilt) * 2);
    block.tiltVel += block.tiltDir * accel * k;
    block.localTilt += block.tiltVel * k;

    // Stage 2: Returns true when tilt exceeds TEETER_MAX_ANGLE (~24 deg)
    const exceeds = Math.abs(block.localTilt) >= P.TEETER_MAX_ANGLE;
    if (exceeds) {
      this.triggerSingleBlockFall(block);
    }
    return exceeds;
  }

  /**
   * Converts a single overhanging teetering block into a falling physics object.
   */
  static triggerSingleBlockFall(block) {
    if (!block) return;
    block.isTeetering = false;
    block.isFalling = true;
    block.settled = false;
    const dir = block.tiltDir || 1;
    block.vx = dir * (1.2 + Math.random() * 1.0);
    block.vy = -2.0; // Subtle upward pop
    block.rot = block.localTilt || 0;
    block.rotVel = dir * (0.02 + Math.random() * 0.02);
  }

}
