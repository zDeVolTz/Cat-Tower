/**
 * Procedural Cat block renderer with Squish & Stretch physics and safe geometry bounds.
 */
import { BLOCK_H } from "../game/config.js";

/**
 * Safe roundRect drawing function that clamps corner radius to prevent Canvas geometry distortion on small blocks.
 */
export function roundRect(ctx, x, y, w, h, r) {
  const safeW = Math.max(2, w);
  const safeH = Math.max(2, h);
  const safeR = Math.max(0, Math.min(r, safeW / 2 - 0.1, safeH / 2 - 0.1));

  ctx.beginPath();
  if (safeR < 0.5) {
    ctx.rect(x, y, safeW, safeH);
  } else {
    ctx.moveTo(x + safeR, y);
    ctx.arcTo(x + safeW, y, x + safeW, y + safeH, safeR);
    ctx.arcTo(x + safeW, y + safeH, x, y + safeH, safeR);
    ctx.arcTo(x, y + safeH, x, y, safeR);
    ctx.arcTo(x, y, x + safeW, y, safeR);
  }
  ctx.closePath();
}

export function drawBlockShape(ctx, x, screenY, width, color, typeId, isGolden, withFace, timeSec, squishX = 1, squishY = 1, tiltAngle = 0) {
  const h = BLOCK_H;
  const safeW = Math.max(6, width);
  let drawY = screenY;

  if (typeId === "light") {
    drawY += Math.sin(timeSec * 4 + x * 0.05) * 2;
  }

  ctx.save();

  // Apply Squish & Stretch Transformation around block center
  const centerX = x + safeW / 2;
  const centerY = drawY + h / 2;
  ctx.translate(centerX, centerY);
  ctx.scale(squishX, squishY);
  ctx.translate(-centerX, -centerY);

  // Block Body Fill (Gradients for Golden / Standard)
  if (isGolden) {
    const g = ctx.createLinearGradient(x, drawY, x, drawY + h);
    g.addColorStop(0, "#fff5b8");
    g.addColorStop(0.5, "#ffd54a");
    g.addColorStop(1, "#ffb800");
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = color;
  }
  roundRect(ctx, x, drawY, safeW, h, 10);
  ctx.fill();

  // Golden Glow Border
  if (isGolden && safeW > 8) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    roundRect(ctx, x + 1, drawY + 1, safeW - 2, h - 2, 8);
    ctx.stroke();
  }

  // Type-specific skin patterns
  if (typeId === "heavy") {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 2.5;
    roundRect(ctx, x, drawY, safeW, h, 10);
    ctx.stroke();
  } else if (typeId === "slippery" && safeW > 12) {
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, drawY, safeW, h, 10);
    ctx.clip();
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.beginPath();
    ctx.moveTo(x + safeW * 0.1, drawY);
    ctx.lineTo(x + safeW * 0.35, drawY);
    ctx.lineTo(x + safeW * 0.15, drawY + h);
    ctx.lineTo(x - safeW * 0.1, drawY + h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (typeId === "sticky" && safeW > 16) {
    ctx.fillStyle = color;
    for (let dx = safeW * 0.2; dx < safeW; dx += safeW * 0.3) {
      ctx.beginPath();
      ctx.ellipse(x + dx, drawY + h, 3, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Cute Pointy Cat Ears (Safe Bounding to prevent S-curve crossover distortion)
  if (safeW >= 12) {
    const earW = Math.min(14, safeW * 0.28);
    const earH = Math.min(14, h * 0.38);

    // Left Ear
    const leftEarX = x + Math.min(safeW * 0.1, safeW / 2 - earW);
    ctx.fillStyle = isGolden ? "#ffd54a" : color;
    ctx.beginPath();
    ctx.moveTo(leftEarX, drawY);
    ctx.lineTo(leftEarX + earW * 0.5, drawY - earH);
    ctx.lineTo(leftEarX + earW, drawY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffb6c1";
    ctx.beginPath();
    ctx.moveTo(leftEarX + earW * 0.2, drawY);
    ctx.lineTo(leftEarX + earW * 0.5, drawY - earH * 0.65);
    ctx.lineTo(leftEarX + earW * 0.8, drawY);
    ctx.closePath();
    ctx.fill();

    // Right Ear
    const rightEarX = x + safeW - Math.min(safeW * 0.1, safeW / 2 - earW) - earW;
    ctx.fillStyle = isGolden ? "#ffd54a" : color;
    ctx.beginPath();
    ctx.moveTo(rightEarX, drawY);
    ctx.lineTo(rightEarX + earW * 0.5, drawY - earH);
    ctx.lineTo(rightEarX + earW, drawY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffb6c1";
    ctx.beginPath();
    ctx.moveTo(rightEarX + earW * 0.2, drawY);
    ctx.lineTo(rightEarX + earW * 0.5, drawY - earH * 0.65);
    ctx.lineTo(rightEarX + earW * 0.8, drawY);
    ctx.closePath();
    ctx.fill();
  }

  // Dynamic Cat Facial Expressions (Drawn only if block width is wide enough)
  if (withFace && safeW >= 22) {
    const ey = drawY + h * 0.42;
    const isScared = Math.abs(tiltAngle) > 0.15;

    // Whiskers
    if (safeW >= 30) {
      ctx.strokeStyle = "rgba(40, 20, 30, 0.4)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + safeW * 0.22, ey); ctx.lineTo(x + 2, ey - 2);
      ctx.moveTo(x + safeW * 0.22, ey + 4); ctx.lineTo(x + 2, ey + 5);
      ctx.moveTo(x + safeW * 0.78, ey); ctx.lineTo(x + safeW - 2, ey - 2);
      ctx.moveTo(x + safeW * 0.78, ey + 4); ctx.lineTo(x + safeW - 2, ey + 5);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(40, 20, 30, 0.85)";

    if (isScared) {
      ctx.beginPath();
      ctx.arc(x + safeW * 0.38, ey, 2.8, 0, Math.PI * 2);
      ctx.arc(x + safeW * 0.62, ey, 2.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x + safeW * 0.5, ey + 6, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Sweat drop
      ctx.fillStyle = "#7fd8e8";
      ctx.beginPath();
      ctx.arc(x + safeW * 0.8, ey - 5, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      if (isGolden) {
        ctx.fillStyle = "#3a2010";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("★", x + safeW * 0.38, ey + 3);
        ctx.fillText("★", x + safeW * 0.62, ey + 3);
      } else {
        ctx.beginPath();
        ctx.arc(x + safeW * 0.38, ey, 2.2, 0, Math.PI * 2);
        ctx.arc(x + safeW * 0.62, ey, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pink Nose & Mouth
      ctx.fillStyle = "#ff8fa3";
      ctx.beginPath();
      ctx.moveTo(x + safeW * 0.5 - 2.5, ey + 4.5);
      ctx.lineTo(x + safeW * 0.5 + 2.5, ey + 4.5);
      ctx.lineTo(x + safeW * 0.5, ey + 7.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
}


export function drawCatBlock(ctx, b, x, screenY, tiltAngle = 0) {
  const timeSec = performance.now() / 1000;
  drawBlockShape(ctx, x, screenY, b.width, b.color, b.typeId, b.isGolden, true, timeSec, b.squishX || 1, b.squishY || 1, tiltAngle);
}

