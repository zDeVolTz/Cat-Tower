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

  /**
   * Initializes collapse physics for all blocks in the tower (Stage 4).
   * Creates spectacular Jenga scatter physics with rotational momentum.
   */
  static startTowerCollapse(blocks, towerAngle) {
    const tiltDir = Math.abs(towerAngle) > 0.01 ? (towerAngle >= 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      b.isFalling = true;
      b.settled = false;
      b.isTeetering = false;

      // Centrifugal scatter: higher blocks fly wider, with random jitter
      const heightFactor = 1.0 + (i / Math.max(1, blocks.length)) * 1.8;
      const randomSpread = (Math.random() - 0.5) * 2.5;

      b.vx = tiltDir * (1.8 + Math.random() * 2.2) * heightFactor + randomSpread;
      b.vy = -1.5 - Math.random() * 3.0; // Dynamic upward arc pop
      b.rot = b.localTilt || (tiltDir * 0.08 * i);
      b.rotVel = tiltDir * (0.03 + Math.random() * 0.06);
    }
  }

  /**
   * Steps falling physics for collapsing blocks during "collapsing" state (Stage 4).
   * Returns true when ALL blocks have fallen below the screen bottom AND minimum 1.2s animation time has elapsed.
   */
  static stepCollapsingBlocks(blocks, screenH, dt, stateObj = null) {
    if (!blocks || blocks.length === 0) return true;

    // dt is in SECONDS
    const k = dt * 60; // k is ~1.0 at 60 FPS

    if (stateObj) {
      stateObj.collapseTimer = (stateObj.collapseTimer || 0) + dt; // Add seconds directly
    }

    const gravity = 0.14 * k; // Smooth arcade gravity
    let anyBlockVisible = false;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.isFalling) {
        b.vy += gravity;
        b.x += b.vx * k;
        b.y -= b.vy * k;
        b.rot += b.rotVel * k;

        // If block is still above screen bottom margin (-300px)
        if (b.y > -300) {
          anyBlockVisible = true;
        }
      }
    }

    const minTimeElapsed = stateObj ? (stateObj.collapseTimer >= 1.2) : true;
    return minTimeElapsed && !anyBlockVisible;
  }
}
