/**
 * ActiveCatSystem — Iteration 1: Spatial Model.
 *
 * This iteration is deliberately NOT about making the cat's movement pretty.
 * It is about building the correct spatial model first. Five concepts, kept
 * strictly separate on purpose — mixing any two of them was the root cause
 * of earlier bugs (camera lag bleeding into gameplay bounds, visible entry
 * confused with flight-zone bounds, etc.):
 *
 *   1. TOWER EXCLUSION ZONE  — world-space region the tower can reach.
 *        getTowerExclusionZone()
 *   2. ACTIVE FLIGHT ZONE    — screen-space vertical band the cat's
 *        trajectory is confined to. Always entirely above (1).
 *        getActiveFlightZone()
 *   3. VISIBLE GAMEPLAY ZONE — screen-space horizontal region where the cat
 *        is actually rendered / interactable.
 *        getVisibleGameplayZone()
 *   4. PHANTOM TRAJECTORY    — the same horizontal path, extended further
 *        out (invisible) so the cat enters (3) already moving, rather than
 *        spawning instantly at an edge.
 *        getPhantomTrajectory()
 *   5. CAMERA                — presentation only (state.cameraY). Used only
 *        to convert world-space tower geometry into screen-space when
 *        computing (1)→(2). Never referenced by (3) or (4). Camera lerp
 *        rate, lag, or shake must never change gameplay bounds.
 *
 * The cat's mover object carries a `phase` (0..1) that parametrizes its
 * position along the FULL horizontal path, which spans the phantom margins
 * plus the visible zone. `mover.isVisible` is derived purely from whether
 * the cat's current horizontal position falls inside the visible zone.
 *
 * All velocities/accelerations use the project's k-system:
 *   k = (dt * 60) / 1000   (1.0 at 60 fps, scales with actual framerate)
 */
import { findSurfaceYForFootprint, handleDrop } from "../physics.js";
import { getLaneBounds } from "../gameState.js";
import { BLOCK_H, GROUND_MARGIN, ACTIVE_CAT_TRAJECTORY as CFG } from "../config.js";

/**
 * Local, state-parametrized re-implementation of gameState.js's getTopFloorY().
 * Deliberately does NOT import that function: it reads the module-global
 * singleton `state` internally, which would silently bind this whole spatial
 * model to "whatever gameState.js's state currently is" instead of the state
 * object actually passed in. That mismatch is invisible in normal play (there
 * is only one state), but breaks testability and violates the separation of
 * concepts this iteration is about — the exclusion zone must be a pure
 * function of the state it's given.
 */
function topFloorYOf(state) {
  if (!state.blocks || state.blocks.length === 0) return 0;
  let maxY = 0;
  for (const b of state.blocks) {
    if (b.y + BLOCK_H > maxY) maxY = b.y + BLOCK_H;
  }
  return maxY;
}

// Re-export config for backward compatibility with existing tests
export const ACTIVE_CAT_CONFIG = CFG;

export class ActiveCatSystem {

  // ══════════════════════════════════════════════════════════════════════
  // 1. TOWER EXCLUSION ZONE (world-space → converted to screen-space here)
  // ══════════════════════════════════════════════════════════════════════
  // The vertical region the tower's actual top can occupy right now, plus
  // a clearance margin. This is purely about the tower; it does not know
  // about the cat's visual size or the flight zone's own top margin.

  static getTowerExclusionZone(state) {
    const topY = topFloorYOf(state);
    // Camera is used HERE ONLY, to project the tower's world-space top into
    // screen-space for this one frame. This is the single sanctioned use of
    // cameraY in the whole spatial model — nothing below this point reads it.
    const screenTowerTopY = state.H - GROUND_MARGIN - (topY - state.cameraY) - BLOCK_H;
    const clearance = CFG.CLEARANCE_BLOCKS * BLOCK_H;

    return {
      // Highest screen-Y (smallest number) the tower's clearance boundary reaches.
      // Anything with screen-Y >= this value is "at or below the exclusion zone".
      screenTowerTopY,
      clearanceBoundaryY: screenTowerTopY - clearance
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // 2. ACTIVE FLIGHT ZONE (screen-space vertical band for the cat)
  // ══════════════════════════════════════════════════════════════════════
  // Always entirely above the tower exclusion zone's clearance boundary,
  // and always respects an absolute top margin regardless of tower height.

  static getActiveFlightZone(state) {
    const H = state.H;
    const catExtent = CFG.CAT_VISUAL_EXTENT_PX;

    // Ceiling: fixed top margin (status bar / notch) + cat's own visual extent,
    // so the cat's rendered top edge never clips under system UI.
    const topMargin = Math.max(H * CFG.ZONE_TOP_RATIO, CFG.ZONE_TOP_MIN_PX);
    const ceiling = topMargin + catExtent;

    // Floor: derived from the tower exclusion zone, never from the camera's
    // lerp state directly — only from the tower's actual current top.
    const exclusion = this.getTowerExclusionZone(state);
    let floor = exclusion.clearanceBoundaryY - catExtent;

    // Absolute safety cap: the flight zone floor is never lower than 40% of
    // the screen, no matter how short the tower is (keeps the arc readable
    // near the very start of a run).
    floor = Math.min(floor, H * CFG.MAX_FLOOR_RATIO);

    // Guarantee a minimum arc height even on tiny viewports or very tall
    // towers where the two constraints above would otherwise collide.
    if (floor - ceiling < CFG.MIN_ARC_HEIGHT_PX) {
      floor = ceiling + CFG.MIN_ARC_HEIGHT_PX;
    }

    return { ceiling, floor, height: floor - ceiling };
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. VISIBLE GAMEPLAY ZONE (screen-space horizontal region)
  // ══════════════════════════════════════════════════════════════════════
  // Where the cat is actually rendered/interactable. Independent of the
  // phantom margins in (4) — this is the "playable" horizontal strip only.

  static getVisibleGameplayZone(mover, state) {
    const edgeInset = mover.width * CFG.OFFSCREEN_FRACTION;

    // screenLeft/screenRight: the actual on-screen viewport span the cat is
    // considered "visible" within (allowing a small edge-inset slack so it
    // doesn't pop discontinuously right at the pixel boundary).
    let screenLeft, screenRight;
    if (state.W <= 500) {
      screenLeft = 0;
      screenRight = state.W;
    } else {
      const { laneLeft, laneRight } = getLaneBounds();
      screenLeft = laneLeft;
      screenRight = laneRight;
    }

    return {
      // turnLeft/turnRight: where the cat's LEFT EDGE (mover.x) turns around
      // horizontally — allowed to sit partly off-screen by edgeInset so the
      // sprite doesn't visibly snap at the exact edge.
      left: screenLeft - edgeInset,
      right: screenRight - mover.width + edgeInset,
      // screenLeft/screenRight: the hard visibility cutoff used to decide
      // isVisible — this is intentionally a DIFFERENT, stricter line than
      // left/right above, which is a turnaround bound, not a visibility gate.
      screenLeft,
      screenRight
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // 4. PHANTOM TRAJECTORY (invisible extension of the same horizontal path)
  // ══════════════════════════════════════════════════════════════════════
  // Extends the visible zone's bounds outward by a phantom margin. The cat
  // travels this full extended range; it is simply not drawn while its
  // position is outside the visible zone from (3).

  static getPhantomTrajectory(mover, state) {
    const visible = this.getVisibleGameplayZone(mover, state);

    // Extra invisible run-up distance, on top of what's already needed to
    // clear the cat's own body past the true screen edge. This is what
    // makes phantom entry a genuine "already moving" run-up rather than
    // just barely enough clearance for zero-width geometry.
    const runUp = mover.width * CFG.PHANTOM_MARGIN_FRACTION;

    // phantomLeft/phantomRight are defined relative to screenLeft/screenRight
    // (concept 3's hard visibility cutoff) — NOT relative to visible.left/right
    // (the turnaround bounds, which already carry their own edge-inset slack
    // for a different purpose). Subtracting mover.width guarantees the cat's
    // entire bounding box — not just its leading edge — clears the true
    // screen edge before the phantom segment ends.
    return {
      visible,
      phantomLeft: visible.screenLeft - mover.width - runUp,
      phantomRight: visible.screenRight + runUp,
      phantomMargin: runUp
    };
  }

  // ── Spawn / Init ─────────────────────────────────────────────────────────

  static initMover(mover, state) {
    mover.spawnFromLeft = mover.dir === 1;

    // (2) Active flight zone — vertical bounds only.
    const flightZone = this.getActiveFlightZone(state);
    mover.trajectoryCeiling = flightZone.ceiling;
    mover.trajectoryFloor   = flightZone.floor;
    mover.arcHeight         = flightZone.height;

    // (3)+(4) Visible zone + phantom extension — horizontal bounds.
    const phantom = this.getPhantomTrajectory(mover, state);
    mover.leftBound  = phantom.visible.left;
    mover.rightBound = phantom.visible.right;
    mover.visibleScreenLeft  = phantom.visible.screenLeft;
    mover.visibleScreenRight = phantom.visible.screenRight;
    mover.phantomLeft  = phantom.phantomLeft;
    mover.phantomRight = phantom.phantomRight;

    // The cat's full horizontal travel spans the PHANTOM range, not just the
    // visible range — this is what makes it enter the visible zone already
    // in motion instead of teleporting into existence at the visible edge.
    mover.startX = mover.spawnFromLeft ? phantom.phantomLeft : phantom.phantomRight;
    mover.endX   = mover.spawnFromLeft ? phantom.phantomRight : phantom.phantomLeft;

    mover.state = "flying";
    mover.flightProgress = 0; // t from 0 to 1, spans the FULL phantom→phantom path
    mover.isVisible = false;  // starts in the phantom (invisible) segment
    mover._released = false;

    this.applyFlightPosition(mover, state);
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
      this.updateFlying(mover, k, state);
    }
  }

  // ── Trajectory (airborne, before TAP) ────────────────────────────────────

  static updateFlying(mover, k, state) {
    // Phase speed determines how fast it crosses the FULL phantom→phantom path.
    mover.flightProgress += 0.035 * CFG.PHASE_SPEED * k;

    if (mover.flightProgress > 1) {
      // Crossed the entire phantom range without a TAP — missed shot, respawn.
      mover.state = "missed";
      mover.isVisible = false;
      return;
    }

    this.applyFlightPosition(mover, state);
  }

  static applyFlightPosition(mover, state) {
    const t = mover.flightProgress;

    // Horizontal: linear interpolation across the FULL phantom→phantom range.
    mover.x = mover.startX + (mover.endX - mover.startX) * t;

    // (3) Visibility gate: purely a check of whether the cat's bounding box
    // overlaps the actual on-screen span — never mixed into the vertical
    // arc math or the phantom horizontal math above. Deliberately uses
    // visibleScreenLeft/Right (the hard visibility cutoff), NOT
    // leftBound/rightBound (which are turnaround bounds with edge-inset
    // slack for a different purpose — where the cat changes direction).
    mover.isVisible = (mover.x + mover.width > mover.visibleScreenLeft) && (mover.x < mover.visibleScreenRight);

    // Vertical: Parabola confined to the active flight zone (2), computed
    // independently of horizontal visibility — the cat's vertical position
    // is well-defined even while still phantom, so it arrives at a sane
    // height the instant it becomes visible (no vertical "pop-in").
    const arcT = 4 * t * (1 - t);
    const screenY = mover.trajectoryFloor - arcT * mover.arcHeight;

    // Convert screen-space Y to world-space Y (camera used only for this
    // world<->screen conversion, exactly as in the tower exclusion zone calc).
    mover.y = state.cameraY + state.H - GROUND_MARGIN - screenY - BLOCK_H;
  }

  // ── Release (TAP moment) ─────────────────────────────────────────────────

  static computeReleaseMomentum(mover) {
    // Horizontal velocity at release, based on the FULL phantom-range slope
    // (matches whatever mover.x was actually doing at the moment of release).
    const rawVx = (mover.endX - mover.startX) * 0.015 * CFG.PHASE_SPEED;
    mover.vx = rawVx * CFG.RELEASE_HORIZONTAL_RETAIN;

    if (mover.vy === undefined) mover.vy = 0;
  }


  static updateFalling(mover, k, state) {
    mover.x += (mover.vx || 0) * k;
    mover.isVisible = true; // once released, always visible regardless of x

    if (mover.vy === undefined) mover.vy = 0;
    mover.vy -= CFG.FALL_GRAVITY * k;
    mover.y += mover.vy * k;

    const landingY = findSurfaceYForFootprint(mover.x, mover.x + mover.width);
    if (mover.y <= landingY) {
      mover.y = landingY;
      mover.vx = 0;
      mover.vy = 0;
      handleDrop();
    }
  }
}