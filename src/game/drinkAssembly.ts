import { FRUIT_META, RECIPES, type FruitKind } from "./model";

export type PourArc = {
  orderId: number;
  kind: FruitKind;
  startX: number;
  startY: number;
  startedAt: number;
  durationMs: number;
  bounced?: boolean;
};

export type DrinkCelebration = {
  orderId: number;
  customer: string;
  drink: string;
  art: string;
  accent: string;
  pouredKinds: FruitKind[];
  startedAt: number;
  durationMs: number;
};

export type DrinkStationLayout = {
  x: number;
  baseY: number;
  mouthY: number;
  cupHeight: number;
  topWidth: number;
  bottomWidth: number;
  isNarrow: boolean;
};

type CupPaths = {
  outerPath: Path2D;
  innerClip: Path2D;
  glassShinePath: Path2D;
  coasterPath: Path2D;
  starburstPath: Path2D;
};

const INK = "#321432";
const CREAM = "#f3dfbd";
const CORAL = "#ed5a50";

const DRINK_SPRITES: Partial<Record<string, HTMLImageElement>> = {};
const CUP_PATH_CACHE = new Map<string, CupPaths>();

if (typeof Image !== "undefined") {
  const seen = new Set<string>();
  for (const recipe of RECIPES) {
    if (seen.has(recipe.art)) continue;
    seen.add(recipe.art);
    const image = new Image();
    image.decoding = "async";
    image.src = `${import.meta.env.BASE_URL}drinks/${recipe.art}.webp`;
    DRINK_SPRITES[recipe.art] = image;
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function createPourArc(
  orderId: number,
  kind: FruitKind,
  startX: number,
  startY: number,
  now: number,
): PourArc {
  return {
    orderId,
    kind,
    startX,
    startY,
    startedAt: now,
    durationMs: 320,
  };
}

// Keep the HTML ticket rail and the canvas cup on one station: one face-up
// card at the far left, the cup immediately to its right on the same rail.
export const ORDER_STATION = {
  narrowBreakpoint: 760,
  railLeft: { wide: 24, narrow: 8 },
  cardWidth: { wide: 200, narrow: 155 },
  stackPeek: { wide: 78, narrow: 70 },
  gap: { wide: 8, narrow: 8 },
  railBottom: { wide: 24, narrow: 18 },
} as const;

export function getDrinkStationLayout(width: number, height: number): DrinkStationLayout {
  const isNarrow = width < ORDER_STATION.narrowBreakpoint;
  const size = isNarrow ? "narrow" : "wide";
  const cupHeight = Math.round(
    Math.max(76, Math.min(108, Math.min(width * 0.22, height * 0.138))),
  );
  const topWidth = Math.round(cupHeight * 0.74);
  const bottomWidth = Math.round(cupHeight * 0.52);
  const stationLeft = ORDER_STATION.railLeft[size];
  const cardWidth = ORDER_STATION.cardWidth[size];
  const stackPeek = ORDER_STATION.stackPeek[size];
  const gap = ORDER_STATION.gap[size];
  const x = stationLeft + cardWidth + stackPeek + gap + topWidth * 0.5;
  const baseY = height - ORDER_STATION.railBottom[size] - 8;
  return {
    x,
    baseY,
    mouthY: baseY - cupHeight,
    cupHeight,
    topWidth,
    bottomWidth,
    isNarrow,
  };
}

function getCupPaths(topWidth: number, bottomWidth: number, cupHeight: number): CupPaths {
  const key = `${topWidth}x${bottomWidth}x${cupHeight}`;
  const cached = CUP_PATH_CACHE.get(key);
  if (cached) return cached;

  const topHalf = topWidth * 0.5;
  const botHalf = bottomWidth * 0.5;
  const corner = Math.max(5, Math.round(bottomWidth * 0.14));

  const outerPath = new Path2D();
  outerPath.moveTo(-topHalf, -cupHeight);
  outerPath.lineTo(topHalf, -cupHeight);
  outerPath.lineTo(botHalf, -corner);
  outerPath.quadraticCurveTo(botHalf, 0, botHalf - corner, 0);
  outerPath.lineTo(-botHalf + corner, 0);
  outerPath.quadraticCurveTo(-botHalf, 0, -botHalf, -corner);
  outerPath.closePath();

  const insetX = 4;
  const insetBottom = 5;
  const insetTop = 4;
  const innerTopHalf = Math.max(8, topHalf - insetX);
  const innerBotHalf = Math.max(6, botHalf - insetX);
  const innerCorner = Math.max(3, corner - 2);
  const innerClip = new Path2D();
  innerClip.moveTo(-innerTopHalf, -cupHeight + insetTop);
  innerClip.lineTo(innerTopHalf, -cupHeight + insetTop);
  innerClip.lineTo(innerBotHalf, -insetBottom - innerCorner);
  innerClip.quadraticCurveTo(
    innerBotHalf,
    -insetBottom,
    innerBotHalf - innerCorner,
    -insetBottom,
  );
  innerClip.lineTo(-innerBotHalf + innerCorner, -insetBottom);
  innerClip.quadraticCurveTo(
    -innerBotHalf,
    -insetBottom,
    -innerBotHalf,
    -insetBottom - innerCorner,
  );
  innerClip.closePath();

  const shineTopX = -topHalf * 0.62;
  const shineBotX = -botHalf * 0.58;
  const shineW = Math.max(4, topWidth * 0.11);
  const glassShinePath = new Path2D();
  glassShinePath.moveTo(shineTopX, -cupHeight + 10);
  glassShinePath.lineTo(shineTopX + shineW, -cupHeight + 10);
  glassShinePath.lineTo(shineBotX + shineW * 0.8, -12);
  glassShinePath.lineTo(shineBotX, -12);
  glassShinePath.closePath();

  const coasterW = bottomWidth * 1.62;
  const coasterH = 14;
  const coasterPath = new Path2D();
  coasterPath.ellipse(0, 1, coasterW * 0.5, coasterH * 0.5, 0, 0, Math.PI * 2);

  const starburstPath = new Path2D();
  const points = 14;
  for (let i = 0; i < points * 2; i += 1) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI * 0.5;
    const radius = i % 2 === 0 ? 1 : 0.72;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) starburstPath.moveTo(px, py);
    else starburstPath.lineTo(px, py);
  }
  starburstPath.closePath();

  const bundle = { outerPath, innerClip, glassShinePath, coasterPath, starburstPath };
  CUP_PATH_CACHE.set(key, bundle);
  return bundle;
}

function drawPillBadge(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  fill: string,
  dotColor: string,
  textColor = INK,
  fontSize = 10,
) {
  context.save();
  context.font = `900 ${fontSize}px "DM Sans", system-ui, sans-serif`;
  const textWidth = context.measureText(text).width;
  const padX = 9;
  const dotSpace = dotColor ? 11 : 0;
  const width = Math.ceil(textWidth + padX * 2 + dotSpace);
  const height = Math.round(fontSize + 9);
  const left = Math.round(x - width * 0.5);
  const top = Math.round(y - height * 0.5);
  const radius = Math.round(height * 0.45);

  context.fillStyle = INK;
  context.beginPath();
  context.roundRect(left + 2, top + 3, width, height, radius);
  context.fill();

  context.fillStyle = fill;
  context.strokeStyle = INK;
  context.lineWidth = 2.5;
  context.beginPath();
  context.roundRect(left, top, width, height, radius);
  context.fill();
  context.stroke();

  if (dotColor) {
    context.fillStyle = dotColor;
    context.beginPath();
    context.arc(left + padX + 3, y, 3.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = INK;
    context.lineWidth = 1.4;
    context.stroke();
  }

  context.fillStyle = textColor;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(text, left + padX + dotSpace, y + 0.5);
  context.restore();
}

function drawRimGarnish(
  context: CanvasRenderingContext2D,
  topWidth: number,
  cupHeight: number,
  accentFruit: FruitKind,
  popScale: number,
) {
  const meta = FRUIT_META[accentFruit];
  const topHalf = topWidth * 0.5;
  context.save();
  context.translate(0, -cupHeight);
  context.scale(popScale, popScale);

  // Striped diner straw leaning right
  context.save();
  context.translate(topHalf * 0.34, 4);
  context.rotate(0.24);
  const strawW = Math.max(6, topWidth * 0.1);
  const strawH = Math.max(26, topWidth * 0.44);
  context.fillStyle = CREAM;
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(-strawW * 0.5, -strawH, strawW, strawH + 4, 2);
  context.fill();
  context.stroke();

  context.fillStyle = CORAL;
  for (let sy = -strawH + 5; sy < -2; sy += 9) {
    context.fillRect(-strawW * 0.5 + 1.5, sy, strawW - 3, 4);
  }
  context.restore();

  // Citrus / fruit wheel perched on left rim
  const wheelR = Math.max(11, topWidth * 0.19);
  context.save();
  context.translate(-topHalf * 0.58, 0);
  context.rotate(-0.28);
  context.fillStyle = meta.color;
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(0, 0, wheelR, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = CREAM;
  context.beginPath();
  context.arc(0, 0, wheelR * 0.72, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = meta.splash;
  context.beginPath();
  context.arc(0, 0, wheelR * 0.56, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.restore();
}

function drawTumblerWithLayers(
  context: CanvasRenderingContext2D,
  layout: DrinkStationLayout,
  paths: CupPaths,
  pouredKinds: readonly FruitKind[],
  visualFill: number,
  totalSlots: number,
  now: number,
  reducedMotion: boolean,
  showGarnish: boolean,
  garnishScale = 1,
) {
  const { cupHeight, topWidth } = layout;
  const topHalf = topWidth * 0.5;
  const safeTotal = Math.max(1, totalSlots);

  // Cream glass body so an empty cup still reads on the dark bar front.
  context.fillStyle = "rgba(255, 244, 220, 0.9)";
  context.fill(paths.outerPath);
  context.fillStyle = "rgba(214, 245, 236, 0.28)";
  context.fill(paths.innerClip);

  // Layered liquid bands clipped cleanly inside the glass walls
  if (visualFill > 0.01 && pouredKinds.length > 0) {
    context.save();
    context.clip(paths.innerClip);

    const usableH = cupHeight - 14;
    const bandH = usableH / safeTotal;
    const count = Math.min(pouredKinds.length, safeTotal);

    for (let i = 0; i < count; i += 1) {
      const fillAmount = Math.max(0, Math.min(1, visualFill - i));
      if (fillAmount <= 0.01) continue;
      const kind = pouredKinds[i];
      const meta = FRUIT_META[kind];
      const bottomY = -5 - i * bandH;
      const layerH = bandH * fillAmount;
      const topY = bottomY - layerH;

      // Primary juice band
      context.fillStyle = meta.color;
      context.fillRect(-topHalf - 6, topY, topWidth + 12, layerH + 2);

      // Cel lower-band shadow for separation between fruit layers
      if (layerH > 6) {
        context.fillStyle = meta.dark;
        context.globalAlpha = 0.28;
        context.fillRect(-topHalf - 6, bottomY - Math.min(5, layerH * 0.25), topWidth + 12, Math.min(5, layerH * 0.25) + 1);
        context.globalAlpha = 1;
      }

      // Bright meniscus highlight at the top of each poured layer
      context.fillStyle = meta.splash;
      context.fillRect(-topHalf - 6, topY, topWidth + 12, Math.min(3.5, layerH));

      // Crisp cel bubbles inside layer
      context.fillStyle = "rgba(255, 250, 232, 0.55)";
      const bob = reducedMotion ? 0 : Math.sin(now * 0.005 + i * 1.9) * 1.5;
      const bx = (i % 2 === 0 ? -1 : 1) * topHalf * 0.24;
      const by = topY + layerH * 0.52 + bob;
      if (layerH > 8) {
        context.beginPath();
        context.arc(bx, by, 2.3, 0, Math.PI * 2);
        context.arc(bx + (i % 2 === 0 ? 9 : -8), by - 4, 1.4, 0, Math.PI * 2);
        context.fill();
      }
    }

    // Floating cel ice cubes near the liquid surface
    const surfaceY = -5 - Math.min(safeTotal, visualFill) * bandH;
    const iceFloat = reducedMotion ? 0 : Math.sin(now * 0.004) * 1.4;
    context.save();
    context.translate(-topHalf * 0.2, surfaceY + 4 + iceFloat);
    context.rotate(-0.18);
    context.fillStyle = "rgba(255, 255, 255, 0.42)";
    context.strokeStyle = "rgba(243, 223, 189, 0.7)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.roundRect(-6, -6, 12, 12, 3);
    context.fill();
    context.stroke();
    context.restore();

    if (topWidth >= 66) {
      context.save();
      context.translate(topHalf * 0.22, surfaceY + 6 - iceFloat * 0.8);
      context.rotate(0.24);
      context.fillStyle = "rgba(255, 255, 255, 0.36)";
      context.strokeStyle = "rgba(243, 223, 189, 0.65)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.roundRect(-5, -5, 10, 10, 2.5);
      context.fill();
      context.stroke();
      context.restore();
    }

    context.restore();
  }

  // Right-wall recipe measure ticks
  const usableH = cupHeight - 14;
  const bandH = usableH / safeTotal;
  context.strokeStyle = "rgba(243, 223, 189, 0.65)";
  context.lineWidth = 2;
  context.lineCap = "round";
  for (let slot = 1; slot <= safeTotal; slot += 1) {
    const ty = -5 - slot * bandH;
    const t = Math.abs(ty) / cupHeight;
    const halfAtY = layout.bottomWidth * 0.5 + (topHalf - layout.bottomWidth * 0.5) * t;
    context.beginPath();
    context.moveTo(halfAtY - 9, ty);
    context.lineTo(halfAtY - 3, ty);
    context.stroke();
  }

  // Left glass reflection
  context.fillStyle = "rgba(255, 250, 236, 0.34)";
  context.fill(paths.glassShinePath);

  // Garnish on completion
  if (showGarnish && pouredKinds.length > 0) {
    drawRimGarnish(context, topWidth, cupHeight, pouredKinds[pouredKinds.length - 1], garnishScale);
  }

  // Thick plum ink outline + top rim
  context.strokeStyle = INK;
  context.lineWidth = 4;
  context.lineJoin = "round";
  context.stroke(paths.outerPath);

  context.fillStyle = "rgba(243, 223, 189, 0.48)";
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(0, -cupHeight, topHalf, 5, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

export function drawPourArcs(
  context: CanvasRenderingContext2D,
  arcs: readonly PourArc[],
  layout: DrinkStationLayout,
  now: number,
  reducedMotion: boolean,
) {
  if (reducedMotion || arcs.length === 0) return;

  const targetX = layout.x;
  const targetY = layout.mouthY + 6;

  for (const arc of arcs) {
    const progress = Math.max(0, Math.min(1, (now - arc.startedAt) / arc.durationMs));
    if (progress >= 1) continue;

    const meta = FRUIT_META[arc.kind];
    const cx = (arc.startX + targetX) * 0.5;
    const cy = Math.min(arc.startY, targetY) - Math.max(58, Math.abs(arc.startX - targetX) * 0.22);

    const head = Math.min(1, progress * 1.25);
    const tail = Math.max(0, (progress - 0.28) * 1.38);
    if (head <= tail) continue;

    const steps = 10;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = tail + ((head - tail) * i) / steps;
      const u = 1 - t;
      pts.push({
        x: u * u * arc.startX + 2 * u * t * cx + t * t * targetX,
        y: u * u * arc.startY + 2 * u * t * cy + t * t * targetY,
      });
    }

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    // Dark plum ink casing
    context.strokeStyle = INK;
    context.lineWidth = 14 * (1 - progress * 0.25);
    context.beginPath();
    pts.forEach((pt, idx) => {
      if (idx === 0) context.moveTo(pt.x, pt.y);
      else context.lineTo(pt.x, pt.y);
    });
    context.stroke();

    // Rich juice body
    context.strokeStyle = meta.color;
    context.lineWidth = 8.5 * (1 - progress * 0.25);
    context.stroke();

    // Specular splash core
    context.strokeStyle = meta.splash;
    context.lineWidth = 3.2 * (1 - progress * 0.25);
    context.stroke();

    // Leading & trailing cel droplets
    const tip = pts[pts.length - 1];
    context.fillStyle = meta.splash;
    context.strokeStyle = INK;
    context.lineWidth = 2.4;
    context.beginPath();
    context.arc(tip.x, tip.y, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (pts.length > 6) {
      const dropA = pts[2];
      const dropB = pts[5];
      context.fillStyle = meta.color;
      context.lineWidth = 1.8;
      context.beginPath();
      context.arc(dropA.x - 4, dropA.y - 7, 3.2, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.beginPath();
      context.arc(dropB.x + 5, dropB.y + 6, 2.6, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }

    context.restore();
  }
}

export function drawDrinkAssembly(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: {
    now: number;
    reducedMotion: boolean;
    aimedOrder: {
      id: number;
      customer: string;
      drink: string;
      accent: string;
      ingredients: readonly FruitKind[];
      pouredKinds: readonly FruitKind[];
    } | null;
    visualLayerCount: number;
    cupBounce: number;
    celebration: DrinkCelebration | null;
  },
) {
  const { now, reducedMotion, aimedOrder, visualLayerCount, cupBounce, celebration } = options;
  const layout = getDrinkStationLayout(width, height);
  const paths = getCupPaths(layout.topWidth, layout.bottomWidth, layout.cupHeight);

  const activeCelebration =
    celebration && now - celebration.startedAt < celebration.durationMs ? celebration : null;

  if (!activeCelebration && !aimedOrder) return;

  const accent = activeCelebration ? activeCelebration.accent : aimedOrder!.accent;

  context.save();
  context.translate(layout.x, layout.baseY);

  // Coaster base anchored on the counter lip
  context.fillStyle = INK;
  context.save();
  context.translate(0, 3);
  context.fill(paths.coasterPath);
  context.restore();

  context.fillStyle = CREAM;
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.fill(paths.coasterPath);
  context.stroke(paths.coasterPath);

  context.fillStyle = accent;
  context.beginPath();
  context.ellipse(0, 1, layout.bottomWidth * 0.62, 4, 0, 0, Math.PI * 2);
  context.fill();

  if (activeCelebration) {
    const elapsed = Math.max(0, now - activeCelebration.startedAt);
    const total = activeCelebration.durationMs;
    const sprite = DRINK_SPRITES[activeCelebration.art];
    const spriteReady = Boolean(sprite && sprite.complete && sprite.naturalWidth > 0);
    const fadeOut = elapsed > total - 180 ? Math.max(0, (total - elapsed) / 180) : 1;

    if (reducedMotion) {
      const fadeIn = Math.min(1, elapsed / 150);
      context.globalAlpha = fadeIn * fadeOut;

      // Crisp static starburst halo behind the finished drink
      const burstRadius = layout.cupHeight * 0.72;
      context.save();
      context.translate(0, -layout.cupHeight * 0.56);
      context.scale(burstRadius, burstRadius);
      context.fillStyle = "#ffe27a";
      context.fill(paths.starburstPath);
      context.lineWidth = 3 / burstRadius;
      context.strokeStyle = INK;
      context.stroke(paths.starburstPath);
      context.restore();

      if (spriteReady && sprite) {
        const size = Math.round(layout.cupHeight * 1.18);
        context.drawImage(sprite, -size * 0.5, -size + 6, size, size);
      } else {
        drawTumblerWithLayers(
          context,
          layout,
          paths,
          activeCelebration.pouredKinds,
          activeCelebration.pouredKinds.length,
          activeCelebration.pouredKinds.length,
          now,
          true,
          true,
          1,
        );
      }
      context.globalAlpha = fadeOut;
      drawPillBadge(
        context,
        0,
        -layout.cupHeight - (layout.isNarrow ? 16 : 20),
        "ORDER UP!",
        "#ffe27a",
        activeCelebration.accent,
        INK,
        layout.isNarrow ? 9 : 10,
      );
      drawPillBadge(
        context,
        0,
        7,
        `${activeCelebration.customer.toUpperCase()} · READY`,
        CREAM,
        activeCelebration.accent,
        INK,
        layout.isNarrow ? 8 : 9,
      );
      context.restore();
      return;
    }

    // Animated celebration: quick garnish fill -> finished-drink illustration pop!
    const revealAt = 210;
    if (elapsed < revealAt) {
      const gProgress = Math.min(1, elapsed / revealAt);
      const pop = gProgress < 0.7 ? (gProgress / 0.7) * 1.16 : 1.16 - ((gProgress - 0.7) / 0.3) * 0.16;
      context.save();
      context.scale(1 + cupBounce * 0.08, 1 - cupBounce * 0.06);
      drawTumblerWithLayers(
        context,
        layout,
        paths,
        activeCelebration.pouredKinds,
        activeCelebration.pouredKinds.length,
        activeCelebration.pouredKinds.length,
        now,
        false,
        true,
        pop,
      );
      context.restore();
    } else {
      const popElapsed = elapsed - revealAt;
      const popT = Math.min(1, popElapsed / 220);
      const popScale =
        popT < 0.65
          ? 0.72 + (popT / 0.65) * 0.42
          : 1.14 - ((popT - 0.65) / 0.35) * 0.14;

      context.globalAlpha = fadeOut;

      // Inked starburst coaster halo
      const burstRadius = layout.cupHeight * 0.76 * Math.min(1.06, popScale);
      context.save();
      context.translate(0, -layout.cupHeight * 0.56);
      context.rotate(popElapsed * 0.0007);
      context.scale(burstRadius, burstRadius);
      context.fillStyle = "#ffe27a";
      context.fill(paths.starburstPath);
      context.lineWidth = 3 / Math.max(1, burstRadius);
      context.strokeStyle = INK;
      context.stroke(paths.starburstPath);
      context.restore();

      context.save();
      context.scale(popScale, popScale);
      if (spriteReady && sprite) {
        const size = Math.round(layout.cupHeight * 1.24);
        context.drawImage(sprite, -size * 0.5, -size + 6, size, size);
      } else {
        drawTumblerWithLayers(
          context,
          layout,
          paths,
          activeCelebration.pouredKinds,
          activeCelebration.pouredKinds.length,
          activeCelebration.pouredKinds.length,
          now,
          false,
          true,
          1,
        );
      }
      context.restore();

      drawPillBadge(
        context,
        0,
        -layout.cupHeight - (layout.isNarrow ? 18 : 22),
        "ORDER UP!",
        "#ffe27a",
        activeCelebration.accent,
        INK,
        layout.isNarrow ? 9 : 10,
      );
    }

    context.globalAlpha = fadeOut;
    drawPillBadge(
      context,
      0,
      7,
      `${activeCelebration.customer.toUpperCase()} · READY`,
      CREAM,
      activeCelebration.accent,
      INK,
      layout.isNarrow ? 8 : 9,
    );
    context.restore();
    return;
  }

  // Active order assembly cup
  const order = aimedOrder!;
  const squashX = reducedMotion ? 1 : 1 + cupBounce * 0.09;
  const squashY = reducedMotion ? 1 : 1 - cupBounce * 0.07;

  context.save();
  context.scale(squashX, squashY);
  drawTumblerWithLayers(
    context,
    layout,
    paths,
    order.pouredKinds,
    visualLayerCount,
    order.ingredients.length,
    now,
    reducedMotion,
    order.pouredKinds.length >= order.ingredients.length,
    1,
  );
  context.restore();

  const settled = Math.min(order.ingredients.length, Math.round(visualLayerCount));
  drawPillBadge(
    context,
    0,
    7,
    `${order.customer.toUpperCase()} · ${settled}/${order.ingredients.length}`,
    CREAM,
    order.accent,
    INK,
    layout.isNarrow ? 8 : 9,
  );

  context.restore();
}
