import { findSurfaceYForFootprint, handleDrop } from "../physics.js";
import { getMoverLimits } from "../gameState.js";
import { BLOCK_H, GROUND_MARGIN } from "../config.js";

export const ACTIVE_CAT_CONFIG = {
  ACTIVE_CAT_ZONE_TOP: 0.15,          // Peak of the parabola (15% from top of screen)
  PARABOLA_GRAVITY: 0.25,             // Gravity for the screen-space arc flight
  SLOW_FALL_GRAVITY: 2.0,             // Slow vertical gravity after TAP (in world space)
};

export class ActiveCatSystem {
  static initMover(mover, state) {
    mover.spawnFromLeft = mover.dir === 1;
    this.respawn(mover, state);
    
    // Immediately calculate world Y so there's no 1-frame render flash at old Y coordinates
    mover.y = state.cameraY + state.H - GROUND_MARGIN - mover.screenY - BLOCK_H;
  }

  static respawn(mover, state) {
    const limits = getMoverLimits();
    // Calculate dynamic jump speeds based on screen size
    const targetPeakY = state.H * ACTIVE_CAT_CONFIG.ACTIVE_CAT_ZONE_TOP;
    // Spawn somewhat lower than the peak (e.g., 25% of screen height below peak)
    const arcHeight = state.H * 0.25;
    const startY = targetPeakY + arcHeight; 
    
    // v^2 = 2 * g * h
    const jumpSpeedY = Math.sqrt(2 * ACTIVE_CAT_CONFIG.PARABOLA_GRAVITY * arcHeight);
    
    // time to peak
    const timeToPeak = jumpSpeedY / ACTIVE_CAT_CONFIG.PARABOLA_GRAVITY;
    
    // We want the cat to reach the peak exactly at the center of the arcade lane
    const centerLaneX = limits.spawnLeft + (limits.spawnRight - limits.spawnLeft) / 2;
    
    // Spawn exactly from the lane boundaries defined by getMoverLimits
    const spawnXLeft = limits.spawnLeft;
    const spawnXRight = limits.spawnRight;
    
    const distToCenter = mover.spawnFromLeft 
      ? (centerLaneX - spawnXLeft) 
      : (spawnXRight - centerLaneX);
      
    const jumpSpeedX = distToCenter / timeToPeak;

    mover.x = mover.spawnFromLeft ? spawnXLeft : spawnXRight;
    mover.vx = mover.spawnFromLeft ? jumpSpeedX : -jumpSpeedX;
    
    mover.screenY = startY;
    mover.screenVy = -jumpSpeedY; // Negative is UP in screen space
  }

  static update(mover, k, state) {
    if (!mover) return;

    if (mover.state === "falling") {
      this.updateFalling(mover, k, state);
    } else {
      this.updateMoving(mover, k, state);
    }
  }

  static updateMoving(mover, k, state) {
    // 1. Move in Screen Space (Parabola Arc)
    mover.screenVy += ACTIVE_CAT_CONFIG.PARABOLA_GRAVITY * k;
    mover.screenY += mover.screenVy * k;
    
    mover.x += mover.vx * k;

    // 2. Map Screen Y back to World Y for correct rendering and physics
    mover.y = state.cameraY + state.H - GROUND_MARGIN - mover.screenY - BLOCK_H;

    // 3. Re-spawn if it flew completely behind the visual lane walls
    const limits = getMoverLimits();
    // It is fully behind the left wall when x <= limits.spawnLeft
    const isOffLeft = mover.x <= limits.spawnLeft && mover.vx < 0;
    // It is fully behind the right wall when x >= limits.spawnRight
    const isOffRight = mover.x >= limits.spawnRight && mover.vx > 0;
    
    if (isOffLeft || isOffRight || mover.screenY > state.H + 100) {
      // Alternate sides. Because it fully hides first, it will look like a new cat 
      // is coming out, rather than the same cat bouncing.
      mover.spawnFromLeft = !mover.spawnFromLeft;
      this.respawn(mover, state);
    }
  }

  static updateFalling(mover, k, state) {
    // After TAP, the cat falls straight down slowly.
    // обнуляем горизонтальную скорость как просил пользователь ("просто относительно медленно падал вниз")
    mover.vx = 0;

    // Y goes UP in this game logic (0 is ground, higher is up)
    if (mover.vy === undefined) mover.vy = 0; // Initialize if missing
    mover.vy -= ACTIVE_CAT_CONFIG.SLOW_FALL_GRAVITY * k;
    mover.y += mover.vy * k;

    const landingY = findSurfaceYForFootprint(mover.x, mover.x + mover.width);
    
    if (mover.y <= landingY) {
      mover.y = landingY;
      handleDrop();
    }
  }
}
