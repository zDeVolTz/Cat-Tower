/**
 * CollapseAnimation — Dedicated module for the visual collapse sequence.
 * This handles the "Jenga scatter" and physics of the tower falling apart.
 * Extracted into a separate file so visual effects can be tweaked without breaking core physics.
 */

export class CollapseAnimation {
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
