/**
 * ActiveCatSystem — Iteration 2: One-Shot Trajectory Shapes.
 *
 * Builds on Iteration 1's spatial model WITHOUT changing it. The five
 * spatial concepts below are unchanged in meaning and public API — only
 * the SHAPE of the flight path (previously a single symmetric parabola)
 * has been replaced with three deterministic, pre-authored trajectory
 * classes. Nothing about zones (1)-(5) was touched:
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
 * ── What changed in this iteration ──────────────────────────────────────
 * The cat is still a ONE-SHOT: phantom entry → visible flight → TAP → fall
 * → landing, OR phantom entry → visible flight → exit (missed), never both,
 * never a bounce-back. That lifecycle is unchanged. What changed is HOW the
 * vertical curve is computed along the way — see TRAJECTORY SHAPES below.
 *
 * All three shapes normalize against the SAME getActiveFlightZone() band,
 * so none of them can ever cross into the tower exclusion zone — the shape
 * only decides how the available vertical room is used, never how much of
 * it exists.
 *
 * All velocities/accelerations use the project's k-system:
 *   k = (dt * 60) / 1000   (1.0 at 60 fps, scales with actual framerate)
 *
 * ── TRAJECTORY SHAPES ────────────────────────────────────────────────────
 * Each mover is assigned exactly one shape at spawn (mover.trajectoryType),
 * fixed for its whole flight — never changed mid-air:
 *
 *   high_arc      Symmetric parabola sweeping the FULL flight-zone height.
 *                 Enters and exits near the zone floor, peaks at the
 *                 ceiling. The "big, obvious" arc.
 *
 *   low_arc       Symmetric parabola confined to the lower portion of the
 *                 flight zone — shallower sweep, never approaches the
 *                 ceiling. Reads as a flatter, faster-feeling pass.
 *
 *   diagonal_arc  Asymmetric: peak is off-center (DIAGONAL_PEAK_T, not 0.5)
 *                 AND entry/exit sit at two different heights within the
 *                 zone (comes in low, leaves high, or vice versa depending
 *                 on spawn side). Built from two independent quadratic
 *                 segments (entry→peak, peak→exit) that share only the
 *                 peak point, so it does not read as a shifted symmetric
 *                 parabola — the rise and fall genuinely differ in shape.
 *
 * Trajectory type selection defaults to CYCLING deterministically through
 * ACTIVE_CAT_TRAJECTORY.TRAJECTORY_ORDER, one per spawned cat, so a
 * playtester reliably sees all three in sequence instead of waiting on
 * randomness. Call ActiveCatSystem.setTrajectoryTypeMode('random') to
 * switch to uniform-random selection later (e.g. for the eventual live
 * build), or back to 'cycle' (the default) at any time.
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

// ── Trajectory type selection mode (module-level, playtest-only concern) ──
// 'cycle' (default): deterministic round-robin through TRAJECTORY_ORDER so a
// solo playtester sees all three shapes in sequence without waiting on RNG.
// 'random': uniform-random pick each spawn (intended for the eventual live
// build, once a shape has been chosen as the winner).
let trajectoryTypeMode = "cycle";
let cycleIndex = 0;

export class ActiveCatSystem {

  /**
   * Switches how initMover() picks a trajectory shape.
   * @param {'cycle'|'random'} mode
   */
  static setTrajectoryTypeMode(mode) {
    if (mode === "cycle" || mode === "random") {
      trajectoryTypeMode = mode;
      if (mode === "cycle") cycleIndex = 0;
    }
  }

  static getTrajectoryTypeMode() {
    return trajectoryTypeMode;
  }

  static pickTrajectoryType() {
    const order = CFG.TRAJECTORY_ORDER;
    if (trajectoryTypeMode === "random") {
      return order[Math.floor(Math.random() * order.length)];
    }
    // cycle
    const type = order[cycleIndex % order.length];
    cycleIndex++;
    return type;
  }

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
  // UNCHANGED from Iteration 1 — trajectory shapes below all normalize
  // against this same band, they never redefine it.

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
  // UNCHANGED from Iteration 1.

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
  // UNCHANGED from Iteration 1.

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

    // (2) Active flight zone — vertical bounds only. UNCHANGED source of
    // truth; every trajectory shape below reads ceiling/floor from here and
    // never invents its own vertical room.
    const flightZone = this.getActiveFlightZone(state);
    mover.trajectoryCeiling = flightZone.ceiling;
    mover.trajectoryFloor = flightZone.floor;
    mover.arcHeight = flightZone.height;

    // (3)+(4) Visible zone + phantom extension — horizontal bounds. UNCHANGED.
    const phantom = this.getPhantomTrajectory(mover, state);
    mover.leftBound = phantom.visible.left;
    mover.rightBound = phantom.visible.right;
    mover.visibleScreenLeft = phantom.visible.screenLeft;
    mover.visibleScreenRight = phantom.visible.screenRight;
    mover.phantomLeft = phantom.phantomLeft;
    mover.phantomRight = phantom.phantomRight;

    // The cat's full horizontal travel spans the PHANTOM range, not just the
    // visible range — this is what makes it enter the visible zone already
    // in motion instead of teleporting into existence at the visible edge.
    mover.startX = mover.spawnFromLeft ? phantom.phantomLeft : phantom.phantomRight;
    mover.endX = mover.spawnFromLeft ? phantom.phantomRight : phantom.phantomLeft;

    // ── Iteration 2: pick one fixed trajectory shape for this cat's whole flight ──
    mover.trajectoryType = this.pickTrajectoryType();

    mover.state = "flying";
    mover.flightProgress = 0; // t from 0 to 1, spans the FULL phantom→phantom path
    mover.isVisible = false;  // starts in the phantom (invisible) segment
    mover._released = false;
    mover._prevX = mover.startX;
    mover._prevY = undefined; // set on first applyFlightPosition call below

    this.applyFlightPosition(mover, state);
    mover._prevY = mover.y;
  }

  // ── Main Update ──────────────────────────────────────────────────────────

  static update(mover, k, state) {
    if (!mover) return;

    if (mover.state === "falling") {
      if (!mover._released) {
        this.computeReleaseMomentum(mover, k);
        mover._released = true;
      }
      this.updateFalling(mover, k, state);
    } else {
      this.updateFlying(mover, k, state);
    }
  }

  // ── Trajectory (airborne, before TAP) ────────────────────────────────────

  static updateFlying(mover, k, state) {
    mover._prevX = mover.x;
    mover._prevY = mover.y;

    // Phase speed determines how fast it crosses the FULL phantom→phantom path.
    // Using mover.speed here makes the flight speed scale with the current level.
    mover.flightProgress += 0.025 * mover.speed * CFG.PHASE_SPEED * k;

    if (mover.flightProgress > 1) {
      // Crossed the entire phantom range without a TAP — missed shot, respawn.
      mover.state = "missed";
      mover.isVisible = false;
      return;
    }

    this.applyFlightPosition(mover, state);
  }

  /**
   * Computes screen-space Y as a fraction (0=ceiling, 1=floor) of the
   * active flight zone, for the cat's CURRENT trajectoryType, at path
   * fraction t (0..1 across the full phantom→phantom path).
   *
   * Returns a value in [0, 1] — the caller converts it to a real screen-Y
   * via mover.trajectoryFloor - frac * mover.arcHeight, so no shape here
   * can ever produce a Y outside the flight zone (it is mathematically
   * bounded to [0,1] by construction in every branch below).
   */
  static computeArcFraction(mover, t) {
    switch (mover.trajectoryType) {

      case "low_arc": {
        // Symmetric parabola, but confined to the LOWER portion of the zone:
        // entry/exit sit at LOW_ARC_FLOOR_FRACTION (not 1.0/full floor), and
        // the peak only rises to LOW_ARC_PEAK_FRACTION (not 0/full ceiling).
        const entryFrac = CFG.LOW_ARC_FLOOR_FRACTION;
        const peakFrac = CFG.LOW_ARC_PEAK_FRACTION;
        const arcT = 4 * t * (1 - t); // 0 at edges, 1 at t=0.5 — same shape as high_arc
        // Interpolate between entryFrac (arcT=0) and peakFrac (arcT=1)
        return entryFrac + (peakFrac - entryFrac) * arcT;
      }

      case "diagonal_arc": {
        // Two independent quadratic segments sharing only the peak point,
        // so the rise and fall genuinely differ in shape (not just a
        // horizontally-shifted symmetric parabola).
        const peakT = CFG.DIAGONAL_PEAK_T;
        const peakFrac = 0; // diagonal peak always reaches the zone ceiling (frac 0)

        // Entry/exit heights differ — mirrored depending on spawn direction
        // so a left-spawning and right-spawning diagonal cat both read as
        // "comes in low, leaves high" from the player's left-to-right or
        // right-to-left reading of the screen, rather than one of them
        // reading as an unintentional mirror-image low-to-low pass.
        const enterFrac = mover.spawnFromLeft ? CFG.DIAGONAL_ENTRY_FLOOR_FRACTION : CFG.DIAGONAL_EXIT_FLOOR_FRACTION;
        const exitFrac = mover.spawnFromLeft ? CFG.DIAGONAL_EXIT_FLOOR_FRACTION : CFG.DIAGONAL_ENTRY_FLOOR_FRACTION;

        if (t <= peakT) {
          // Rising segment: entryFrac -> peakFrac over [0, peakT]
          const localT = peakT > 0 ? t / peakT : 1;
          const eased = localT * localT; // ease-in: slow start, fast approach to peak
          return enterFrac + (peakFrac - enterFrac) * eased;
        } else {
          // Falling segment: peakFrac -> exitFrac over [peakT, 1]
          const span = 1 - peakT;
          const localT = span > 0 ? (t - peakT) / span : 1;
          const eased = 1 - (1 - localT) * (1 - localT); // ease-out: fast leave, slow settle
          return peakFrac + (exitFrac - peakFrac) * eased;
        }
      }

      case "high_arc":
      default: {
        // Symmetric parabola sweeping the FULL flight-zone height:
        // frac=1 (floor) at t=0 and t=1, frac=0 (ceiling) at t=0.5.
        const arcT = 4 * t * (1 - t);
        const entryFrac = CFG.HIGH_ARC_FLOOR_FRACTION;
        return entryFrac * (1 - arcT);
      }
    }
  }

  static applyFlightPosition(mover, state) {
    const t = mover.flightProgress;

    // Horizontal: linear interpolation across the FULL phantom→phantom range.
    // (Deliberately still linear in X — only the vertical curve and, for
    // diagonal_arc, the asymmetric timing of the vertical rise/fall express
    // each shape's character. A non-linear X would fight the "one clean shot"
    // readability the spatial model in Iteration 1 was built to guarantee.)
    mover.x = mover.startX + (mover.endX - mover.startX) * t;

    // (3) Visibility gate: purely a check of whether the cat's bounding box
    // overlaps the actual on-screen span — never mixed into the vertical
    // arc math or the phantom horizontal math above. Deliberately uses
    // visibleScreenLeft/Right (the hard visibility cutoff), NOT
    // leftBound/rightBound (which are turnaround bounds with edge-inset
    // slack for a different purpose — where the cat changes direction).
    mover.isVisible = (mover.x + mover.width > mover.visibleScreenLeft) && (mover.x < mover.visibleScreenRight);

    // Vertical: shape-specific curve (see computeArcFraction), confined to
    // the active flight zone (2) by construction — frac is always in [0,1].
    const frac = Math.max(0, Math.min(1, this.computeArcFraction(mover, t)));
    const screenY = mover.trajectoryFloor - (1 - frac) * mover.arcHeight;

    // Convert screen-space Y to world-space Y (camera used only for this
    // world<->screen conversion, exactly as in the tower exclusion zone calc).
    mover.y = state.cameraY + state.H - GROUND_MARGIN - screenY - BLOCK_H;
  }

  // ── Release (TAP moment) ─────────────────────────────────────────────────

  /**
   * Computes release velocity from the cat's ACTUAL instantaneous motion at
   * the moment of TAP (finite-difference over the last update), rather than
   * a fixed constant derived from the endpoints. This makes early vs. late
   * TAP genuinely different: for diagonal_arc in particular, horizontal
   * speed is constant (X is still linear) but the *vertical* speed varies
   * across the flight, and — because release also carries a fraction of
   * that vertical momentum now — the timing of TAP visibly changes the
   * shape of the resulting fall, not just a fixed sideways drift.
   */
  static computeReleaseMomentum(mover, k) {
    const safeK = k > 0.0001 ? k : 1;
    const instVx = mover._prevX !== undefined ? (mover.x - mover._prevX) / safeK : 0;
    const instVy = mover._prevY !== undefined ? (mover.y - mover._prevY) / safeK : 0;

    mover.vx = instVx * CFG.RELEASE_HORIZONTAL_RETAIN;
    // Vertical momentum retention uses the same fraction for consistency;
    // this is on top of (not instead of) the FALL_GRAVITY accel applied
    // every frame in updateFalling below.
    mover.vy = instVy * CFG.RELEASE_HORIZONTAL_RETAIN;
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