/**
 * Weather effects, fever sparkles, background theme decorations and milestone banners.
 */
import { roundRect } from "./drawCats.js";

const decorCache = {};

function getDecor(themeIdx, W) {
  if (decorCache[themeIdx]) return decorCache[themeIdx];
  const arr = [];
  let seed = themeIdx * 97 + 13;

  function rnd() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  for (let i = 0; i < 12; i++) {
    arr.push({
      relX: rnd(),
      relY: rnd() * 0.55,
      size: 10 + rnd() * 22,
      speed: 6 + rnd() * 16,
      phase: rnd() * Math.PI * 2
    });
  }
  decorCache[themeIdx] = arr;
  return arr;
}

export function drawDecorations(ctx, theme, themeIdx, timeSec, W, H, wind = 0) {
  const items = getDecor(themeIdx, W);

  for (const it of items) {
    // Smooth continuous movement independent of user clicks or wind changes
    const x = ((it.relX * (W + 140) + timeSec * it.speed) % (W + 140)) - 70;
    const y = it.relY * H * 0.65 + 15;

    ctx.save();
    if (theme.deco === "windows") {
      ctx.globalAlpha = 0.14 + 0.08 * Math.sin(timeSec + it.phase);
      ctx.fillStyle = theme.accent;
      roundRect(ctx, x, y, it.size * 0.7, it.size, 4);
      ctx.fill();
    } else if (theme.deco === "clouds") {
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      ctx.beginPath();
      ctx.ellipse(x, y, it.size, it.size * 0.6, 0, 0, Math.PI * 2);
      ctx.ellipse(x + it.size * 0.6, y + 3, it.size * 0.7, it.size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (theme.deco === "birds") {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "rgba(40, 20, 30, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.quadraticCurveTo(x - 3, y - 5, x, y);
      ctx.quadraticCurveTo(x + 3, y - 5, x + 6, y);
      ctx.stroke();
    } else if (theme.deco === "stars") {
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(timeSec * 2.5 + it.phase);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (theme.deco === "space") {
      const big = it.size > 24;
      ctx.globalAlpha = big ? 0.55 : 0.35 + 0.4 * Math.sin(timeSec * 2 + it.phase);
      ctx.fillStyle = big ? theme.accent : "#fff";
      ctx.beginPath();
      ctx.arc(x, y, big ? it.size * 0.35 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawMilestoneBanner(ctx, banner, W, H) {
  let a = 1;
  if (banner.life > banner.maxLife - 300) {
    a = (banner.maxLife - banner.life) / 300;
  } else if (banner.life < 400) {
    a = banner.life / 400;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  roundRect(ctx, W / 2 - 155, H * 0.32 - 26, 310, 52, 16);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 17px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(banner.text, W / 2, H * 0.32 + 6);
  ctx.restore();
}
