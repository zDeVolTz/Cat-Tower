import { findSurfaceYForFootprint, handleDrop } from "../physics.js";
import { getMoverLimits } from "../gameState.js";

// Vertical acceleration per frame (tuned for prototype)
// Assuming k is ~1.0 at 60fps.
const GRAVITY = 12.0; 

export class ActiveCatSystem {
  static update(mover, k, state) {
    if (!mover) return;

    if (mover.state === "moving" || !mover.state) {
      mover.x += mover.dir * mover.speed * k;
      const limits = getMoverLimits();

      if (mover.x < limits.left) {
        mover.x = limits.left;
        mover.dir = 1;
      }
      if (mover.x > limits.right) {
        mover.x = limits.right;
        mover.dir = -1;
      }
    } else if (mover.state === "falling") {
      // Y goes UP in this game logic (0 is ground, higher is up)
      // Falling means velocity goes negative.
      mover.vy -= GRAVITY * k;
      mover.y += mover.vy * k;

      const landingY = findSurfaceYForFootprint(mover.x, mover.x + mover.width);
      
      if (mover.y <= landingY) {
        // Snap to surface to avoid penetrating the block
        mover.y = landingY;
        handleDrop();
      }
    }
  }
}
