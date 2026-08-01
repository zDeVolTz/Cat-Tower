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
    mover.trajectoryFloor   = bounds.trajectoryFloor;
    mover.arcHeight         = bounds.arcHeight;

    // ── Horizontal bounds ──
    const hBounds = this.calculateHorizontalBounds(mover, state);
    mover.leftBound  = hBounds.left;
    mover.rightBound = hBounds.right;

    // ── Phase: sin(phase) oscillates -1 ↔ +1 ──
    // -π/2 → leftmost (t=0),  +π/2 → rightmost (t=1)
    mover.phase = mover.spawnFromLeft ? -Math.PI / 2 : Math.PI / 2;

    // ── Release tracking ──
    mover._released = false;

    // ── Compute initial position ──
    this.applyTrajectoryPosition(mover, state);
  }

  // ── Bounds Calculation ───────────────────────────────────────────────────

  /**
   * Returns { trajectoryCeiling, trajectoryFloor, arcHeight } in screen-space Y.
   *
   * Gameplay-first approach:
   *   1. Read the ACTUAL tower top position on screen (not derived from camera params).
   *   2. Apply clearance (gameplay rule) to guarantee separation.
   *   3. Clamp to ensure minimum arc height and screen margins.
   *
   * Changing CAMERA_TRAIL_FRACTION shifts where the tower appears on screen,
   * but the clearance rule still holds — the trajectory adapts.
   */
  static calculateBounds(state) {
    const H = state.H;

    // ── Ceiling (top of trajectory zone) ──
    const topMargin = Math.max(H * CFG.ZONE_TOP_RATIO, CFG.ZONE_TOP_MIN_PX);
    const trajectoryCeiling = topMargin + CFG.CAT_VISUAL_EXTENT_PX;

    // ── Tower top on screen (current state) ──
    const topY = getTopFloorY();
    // Convert world-space tower top to screen-space Y (same formula as renderer.js:109)
    const screenTowerTop = H - GROUND_MARGIN - (topY - state.cameraY) - BLOCK_H;

    // ── Clearance ──
    const clearance = CFG.CLEARANCE_BLOCKS * BLOCK_H;

    // ── Floor (bottom of trajectory zone) = tower top - clearance - cat extent ──
    let trajectoryFloor = screenTowerTop - clearance - CFG.CAT_VISUAL_EXTENT_PX;

    // Clamp: floor can't go below MAX_FLOOR_RATIO (cat stays in upper portion)
    trajectoryFloor = Math.min(trajectoryFloor, H * CFG.MAX_FLOOR_RATIO);

    // Enforce minimum arc height
    if (trajectoryFloor - trajectoryCeiling < CFG.MIN_ARC_HEIGHT_PX) {
      trajectoryFloor = trajectoryCeiling + CFG.MIN_ARC_HEIGHT_PX;
    }

    return {
      trajectoryCeiling,
      trajectoryFloor,
      arcHeight: trajectoryFloor - trajectoryCeiling
    };
  }

  /**
   * Horizontal bounds for trajectory oscillation.
   * Cat peeks slightly off-screen at turnaround edges for natural feel.
   */
  static calculateHorizontalBounds(mover, state) {
    const off = mover.width * CFG.OFFSCREEN_FRACTION;

    if (state.W <= 500) {
      // Mobile: use full screen width
      return {
        left:  -off,
        right: state.W - mover.width + off
      };
    } else {
      // Desktop: use arcade lane bounds
      const { laneLeft, laneRight } = getLaneBounds();
      return {
        left:  laneLeft - off,
        right: laneRight - mover.width + off
      };
    }
  }

  // ── Main Update ──────────────────────────────────────────────────────────

  static update(mover, k, state) {
    if (!mover) return;

    if (mover.state === "falling") {
      // First frame after TAP: compute release momentum
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
    // 1. Advance phase (continuous, monotonic)
    mover.phase += CFG.PHASE_SPEED * k;

    // 2. Derive screen-space position from phase
    this.applyTrajectoryPosition(mover, state);

    // 3. Cat-like Movement & Animation!
    const speedX = Math.cos(mover.phase); // -1 to 1

    // A. 3D Turning (Flip) & Squish
    // Fast smooth transition between -1 and 1 for direction facing
    let turnFactor = speedX / 0.15;
    if (turnFactor > 1) turnFactor = 1;
    if (turnFactor < -1) turnFactor = -1;
    
    // Stretch horizontally when moving fast, squish when slow.
    // Multiply by turnFactor to flip the cat horizontally!
    mover.squishX = turnFactor * (0.8 + 0.3 * Math.abs(speedX));
    mover.squishY = 1.2 - 0.3 * Math.abs(speedX);

    // B. Tilt (Rotation)
    // Tilt the cat into the direction of movement.
    // speedX is max 1 or -1. Max tilt is ~0.15 radians (8.5 degrees).
    mover.rot = speedX * 0.15;

    // C. Bounding (Vertical Bobbing)
    // Add high-frequency leaps on top of the main arc trajectory.
    const bobFreq = 8; // Bounces per full sweep
    const bobPhase = mover.phase * bobFreq;
    // Math.abs(Math.sin) creates a bouncy arc sequence. 
    // Y goes up in world space, so adding to Y makes it bounce up on screen.
    const bobOffset = Math.abs(Math.sin(bobPhase)) * 14; 
    mover.y += bobOffset;

    // 4. Update facing direction for gameplay consistency (e.g., spawn offsets if any)
    mover.dir = speedX >= 0 ? 1 : -1;
  }

  /**
   * Compute screen-space X and Y from the current phase, then sync to world Y.
   *
   * Horizontal:  t = (sin(phase) + 1) / 2  →  0 at left, 1 at right
   *   - cos(phase) = 0 at edges → velocity = 0 → smooth turnaround
   *   - cos(phase) = ±1 at center → max velocity → fast crossing
   *
   * Vertical:    arcT = sin(t × π)  →  0 at edges, 1 at center
   *   - Cat arcs highest at center of screen (peak of leap)
   *   - Cat is at trajectory floor at turnaround edges
   */
  static applyTrajectoryPosition(mover, state) {
    const t = (Math.sin(mover.phase) + 1) / 2;  // 0..1 smooth oscillation

    // Horizontal
    mover.x = mover.leftBound + (mover.rightBound - mover.leftBound) * t;

    // Vertical: sinusoidal arc (screen-space Y, 0=top)
    const arcT = Math.sin(t * Math.PI);  // 0 at edges, 1 at center
    const screenY = mover.trajectoryFloor - arcT * mover.arcHeight;

    // Convert screen-space Y to world-space Y for rendering + physics
    // Inverse of renderer.js:109:  screenY = H - GROUND_MARGIN - (y - cameraY) - BLOCK_H
    mover.y = state.cameraY + state.H - GROUND_MARGIN - screenY - BLOCK_H;
  }

  // ── Release (TAP moment) ─────────────────────────────────────────────────

  /**
   * Compute horizontal velocity at the moment of release and apply retention.
   * Called once, on the first update frame after state changes to "falling".
   *
   * dx/dk = d/dk [ leftBound + (rightBound - leftBound) × (sin(phase) + 1) / 2 ]
   *       = (rightBound - leftBound) × 0.5 × cos(phase) × PHASE_SPEED
   */
  static computeReleaseMomentum(mover) {
    const hRange = (mover.rightBound || 0) - (mover.leftBound || 0);
    const rawVx  = hRange * 0.5 * Math.cos(mover.phase || 0) * CFG.PHASE_SPEED;

    mover.vx = rawVx * CFG.RELEASE_HORIZONTAL_RETAIN;
    // No initial downward kick — gravity alone pulls the cat down,
    // giving the "leap" feel requested in the design doc.
    if (mover.vy === undefined) mover.vy = 0;
  }

  // ── Falling (after TAP, before landing) ──────────────────────────────────

  static updateFalling(mover, k, state) {
    // Horizontal drift (retained momentum from trajectory)
    mover.x += (mover.vx || 0) * k;

    // World-space gravity (Y goes UP in this project; negative vy = falling)
    if (mover.vy === undefined) mover.vy = 0;
    mover.vy -= CFG.FALL_GRAVITY * k;
    mover.y  += mover.vy * k;

    // Gently reset pose (squish and tilt) while falling
    if (mover.squishX !== undefined) mover.squishX += (1 - Math.abs(mover.squishX)) * 0.1 * k * Math.sign(mover.squishX);
    if (mover.squishY !== undefined) mover.squishY += (1 - mover.squishY) * 0.1 * k;
    if (mover.rot !== undefined) mover.rot *= Math.pow(0.9, k);

    // Landing check — delegates to existing tower physics
    const landingY = findSurfaceYForFootprint(mover.x, mover.x + mover.width);
    if (mover.y <= landingY) {
      mover.y = landingY;
      mover.squishX = 1; // Snap to normal on land
      mover.squishY = 1;
      mover.rot = 0;
      handleDrop();
    }
  }
}
