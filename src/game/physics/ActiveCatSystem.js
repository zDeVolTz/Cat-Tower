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
    mover.trajectoryFloor   = bounds.trajectoryFloor; // Apex of the parabola
    mover.arcHeight         = bounds.arcHeight;

    // ── Horizontal bounds ──
    const hBounds = this.calculateHorizontalBounds(mover, state);
    mover.leftBound  = hBounds.left;
    mover.rightBound = hBounds.right;

    // ── Parabola Flight Parameters ──
    mover.state = "flying";
    mover.flightProgress = 0; // t from 0 to 1

    // Horizontal flight bounds (start completely off-screen on the side)
    const extraOff = state.W * 0.3; 
    mover.startX = mover.spawnFromLeft ? mover.leftBound - extraOff : mover.rightBound + extraOff;
    mover.endX   = mover.spawnFromLeft ? mover.rightBound + extraOff : mover.leftBound - extraOff;

    mover._released = false;

    this.applyFlightPosition(mover, state);
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
    } else if (mover.state === "flying") {
      this.updateFlying(mover, k, state);
    }
  }

  // ── Trajectory (airborne, before TAP) ────────────────────────────────────

  static updateFlying(mover, k, state) {
    // Phase speed determines how fast it crosses the screen.
    // 0.5 means it takes about 120 frames (2 seconds) to cross.
    mover.flightProgress += 0.015 * CFG.PHASE_SPEED * k; 
    
    // If it missed the window (flew past the screen), we need to spawn a new one.
    if (mover.flightProgress > 1) {
      // It flew away completely.
      // Easiest way to respawn without breaking state logic is to mark it as settled
      // out of bounds so the drop handler cleans it up, OR we can just respawn directly.
      // But we shouldn't import spawnMover here directly to avoid circular dependency.
      // We can just set its state to a special flag and let gameLoop handle it,
      // or we can simulate a drop far away.
      mover.state = "missed";
      return;
    }

    this.applyFlightPosition(mover, state);
  }

  static applyFlightPosition(mover, state) {
    const t = mover.flightProgress;

    // Horizontal: linear interpolation from startX to endX
    mover.x = mover.startX + (mover.endX - mover.startX) * t;

    // Vertical: Parabola. At t=0 and t=1, arcT = 0. At t=0.5, arcT = 1.
    const arcT = 4 * t * (1 - t);
    
    // Y at t=0 is trajectoryFloor. Y at t=0.5 is trajectoryCeiling (which is trajectoryFloor - arcHeight)
    const screenY = mover.trajectoryFloor - arcT * mover.arcHeight;

    // Convert screen-space Y to world-space Y
    mover.y = state.cameraY + state.H - GROUND_MARGIN - screenY - BLOCK_H;
  }

  // ── Release (TAP moment) ─────────────────────────────────────────────────

  static computeReleaseMomentum(mover) {
    // Horizontal velocity at release.
    // dx/dt = (endX - startX) * 0.015 * PHASE_SPEED
    const rawVx = (mover.endX - mover.startX) * 0.015 * CFG.PHASE_SPEED;
    mover.vx = rawVx * CFG.RELEASE_HORIZONTAL_RETAIN;

    // Optional: Vertical momentum retention. Since it's a parabola, dy/dt is not 0 except at apex.
    // If we want it to just drop linearly, we can leave vy = 0. 
    // Given the user wants a simple "shot" result, keeping vy = 0 (gravity only) is safest.
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
