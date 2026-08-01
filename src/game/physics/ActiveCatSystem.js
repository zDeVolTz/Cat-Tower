/**
 * ActiveCatSystem — Sinusoidal Ping-Pong Trajectory + TAP Release.
 *
 * Architecture:
 *   GAMEPLAY RULE (ACTIVE_CAT_TRAJECTORY in config.js)
 *     → SAFE AIR ZONE (calculated here at mover spawn time)
 *       → CAT TRAJECTORY (sinusoidal arc, screen-space)
 *         → TAP RELEASE → world-space falling → existing tower physics
 *
 * The trajectory operates in screen-space (Y=0 is top of viewport).
 * On release, position is already synced to world-space for handleDrop().
 *
 * All velocities/accelerations use the project's k-system:
 *   k = (dt * 60) / 1000   (1.0 at 60 fps, scales with actual framerate)
 */
import { findSurfaceYForFootprint, handleDrop } from "../physics.js";
import { getMoverLimits, getTopFloorY, getLaneBounds } from "../gameState.js";
import { BLOCK_H, GROUND_MARGIN, CAMERA_TRAIL_FRACTION, ACTIVE_CAT_TRAJECTORY as CFG } from "../config.js";

// Re-export config for backward compatibility with existing tests
export const ACTIVE_CAT_CONFIG = CFG;

export class ActiveCatSystem {

  // ── Spawn / Init ─────────────────────────────────────────────────────────

  static initMover(mover, state) {
    mover.spawnFromLeft = mover.dir === 1;

    // ── Trajectory bounds (screen-space, computed once per mover lifetime) ──
    const bounds = this.calculateBounds(state);
    mover.trajectoryCeiling = bounds.trajectoryCeiling;
    mover.trajectoryFloor   = bounds.trajectoryFloor; // Floor of trajectory zone
    mover.arcHeight         = bounds.arcHeight;

    // ── Horizontal bounds ──
    const hBounds = this.calculateHorizontalBounds(mover, state);
    mover.leftBound  = hBounds.left;
    mover.rightBound = hBounds.right;

    // ── Continuous Oscillation Phase ──
    // -π/2 → leftmost (t=0), +π/2 → rightmost (t=1)
    mover.phase = mover.spawnFromLeft ? -Math.PI / 2 : Math.PI / 2;
    mover.state = "moving";
    mover._released = false;

    this.applyTrajectoryPosition(mover, state);
  }

  // ── Bounds Calculation ───────────────────────────────────────────────────

  static calculateBounds(state) {
    const H = state.H;

    const topMargin = Math.max(H * CFG.ZONE_TOP_RATIO, CFG.ZONE_TOP_MIN_PX);
    const trajectoryCeiling = topMargin + CFG.CAT_VISUAL_EXTENT_PX;

    const topY = getTopFloorY();
    const screenTowerTop = H - GROUND_MARGIN - (topY - state.cameraY) - BLOCK_H;
    const clearance = CFG.CLEARANCE_BLOCKS * BLOCK_H;

    let trajectoryFloor = screenTowerTop - clearance - CFG.CAT_VISUAL_EXTENT_PX;
    trajectoryFloor = Math.min(trajectoryFloor, H * CFG.MAX_FLOOR_RATIO);

    if (trajectoryFloor - trajectoryCeiling < CFG.MIN_ARC_HEIGHT_PX) {
      trajectoryFloor = trajectoryCeiling + CFG.MIN_ARC_HEIGHT_PX;
    }

    return {
      trajectoryCeiling,
      trajectoryFloor,
      arcHeight: trajectoryFloor - trajectoryCeiling
    };
  }

  static calculateHorizontalBounds(mover, state) {
    const off = mover.width * CFG.OFFSCREEN_FRACTION;
    if (state.W <= 500) {
      return { left: -off, right: state.W - mover.width + off };
    } else {
      const { laneLeft, laneRight } = getLaneBounds();
      return { left: laneLeft - off, right: laneRight - mover.width + off };
    }
  }

  // ── Main Update ──────────────────────────────────────────────────────────

  static update(mover, k, state) {
    if (!mover) return;

    if (mover.state === "falling") {
      if (!mover._released) {
        this.computeReleaseMomentum(mover);
        mover._released = true;
      }
      this.updateFalling(mover, k, state);
    } else {
      this.updateMoving(mover, k, state);
    }
  }

  // ── Trajectory (airborne, before TAP) ────────────────────────────────────

  static updateMoving(mover, k, state) {
    // 1. Advance phase with high speed (3.2x multiplier for fast shot feel)
    const SPEED_MULT = 3.2;
    mover.phase += CFG.PHASE_SPEED * SPEED_MULT * k;

    // 2. Derive screen-space position from phase (naturally bounces off walls)
    this.applyTrajectoryPosition(mover, state);

    // 3. Track direction facing
    const speedX = Math.cos(mover.phase);
    mover.dir = speedX >= 0 ? 1 : -1;
  }

  static applyTrajectoryPosition(mover, state) {
    // t oscillates continuously 0 ↔ 1 ↔ 0 (bouncing off walls at 0 and 1)
    const t = (Math.sin(mover.phase) + 1) / 2;

    // Horizontal
    mover.x = mover.leftBound + (mover.rightBound - mover.leftBound) * t;

    // Vertical sinusoidal arc within safe zone
    const arcT = Math.sin(t * Math.PI);
    const screenY = mover.trajectoryFloor - arcT * mover.arcHeight;

    // Convert screen-space Y to world-space Y
    mover.y = state.cameraY + state.H - GROUND_MARGIN - screenY - BLOCK_H;
  }

  // ── Release (TAP moment) ─────────────────────────────────────────────────

  static computeReleaseMomentum(mover) {
    const hRange = (mover.rightBound || 0) - (mover.leftBound || 0);
    const SPEED_MULT = 3.2;
    const rawVx  = hRange * 0.5 * Math.cos(mover.phase || 0) * CFG.PHASE_SPEED * SPEED_MULT;

    mover.vx = rawVx * CFG.RELEASE_HORIZONTAL_RETAIN;
    if (mover.vy === undefined) mover.vy = 0;
  }

  // ── Falling (after TAP, before landing) ──────────────────────────────────

  static updateFalling(mover, k, state) {
    mover.x += (mover.vx || 0) * k;

    if (mover.vy === undefined) mover.vy = 0;
    mover.vy -= CFG.FALL_GRAVITY * k;
    mover.y  += mover.vy * k;

    const landingY = findSurfaceYForFootprint(mover.x, mover.x + mover.width);
    if (mover.y <= landingY) {
      mover.y = landingY;
      mover.vx = 0;
      mover.vy = 0;
      handleDrop();
    }
  }
}
