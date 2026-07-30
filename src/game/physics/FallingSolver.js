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

    const P = PhysicsConfig;
    const slideFactor = friction ? (1.0 / friction) : 1.0;

    const accel = P.TEETER_BASE_ACCEL * 60 * slideFactor * (1 + Math.abs(block.localTilt) * 2);
    block.tiltVel += block.tiltDir * accel * dt;
    block.localTilt += block.tiltVel * (dt * 60);

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
    block.vx = dir * (2.0 + Math.random() * 1.5);
    block.vy = -1.0;
    block.rot = block.localTilt || 0;
    block.rotVel = dir * (0.03 + Math.random() * 0.03);
  }

  /**
   * Initializes collapse physics for all blocks in the tower (Stage 4).
   */
  static startTowerCollapse(blocks, towerAngle) {
    const tiltDir = towerAngle >= 0 ? 1 : -1;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      b.isFalling = true;
      b.settled = false;
      b.isTeetering = false;

      // Higher blocks get more horizontal centrifugal velocity
      const heightFactor = (b.y / 100) + 1;
      b.vx = tiltDir * (1.5 + Math.random() * 2.0) * heightFactor;
      b.vy = -1.0 - Math.random() * 2.0; // Initial upward pop
      b.rot = b.localTilt || 0;
      b.rotVel = tiltDir * (0.02 + Math.random() * 0.04);
    }
  }

  /**
   * Steps falling physics for collapsing blocks during "collapsing" state (Stage 4).
   * Returns true when ALL blocks have fallen below the screen bottom AND minimum animation time has elapsed.
   */
  static stepCollapsingBlocks(blocks, screenH, dt) {
    if (!blocks || blocks.length === 0) return true;

    const gravity = 0.5 * (dt * 60);
    let anyBlockVisible = false;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.isFalling) {
        b.vy += gravity;
        b.x += b.vx * (dt * 60);
        b.y -= b.vy * (dt * 60);
        b.rot += b.rotVel * (dt * 60);

        // If block is still above screen bottom margin (-250px)
        if (b.y > -250) {
          anyBlockVisible = true;
        }
      }
    }

    return !anyBlockVisible;
  }
}
