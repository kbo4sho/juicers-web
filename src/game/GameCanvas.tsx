import { useCallback, useEffect, useRef } from "react";
import { juiceAudio } from "./audio";
import {
  createSeededRandom,
  FRUIT_META,
  FRUITS,
  rankForScore,
  scoreJuice,
  type CustomerOrderSnapshot,
  type FruitKind,
  type PowerKind,
  type RoundResult,
  type RoundSnapshot,
} from "./model";
import type { TrackedPoint, TrackingFrame } from "./tracking";

type Phase = "tutorial" | "countdown" | "playing" | "results";

type Props = {
  phase: Phase;
  playToken: number;
  roundNumber: number;
  countdown: number;
  trackingRef: React.RefObject<TrackingFrame>;
  cameraActive: boolean;
  onSnapshot: (snapshot: RoundSnapshot) => void;
  onFinish: (result: RoundResult) => void;
  onAnnounce: (message: string) => void;
};

type FallingItem = {
  id: number;
  type: "fruit" | "power";
  kind: FruitKind | PowerKind;
  x: number;
  y: number;
  radius: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  rotationSpeed: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  gravity: number;
  shape: "drop" | "dot" | "spark";
};

type BurstText = {
  x: number;
  y: number;
  label: string;
  sublabel: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
};

type Splatter = {
  x: number;
  y: number;
  color: string;
  life: number;
  maxLife: number;
  radius: number;
  points: number[];
};

type CustomerOrder = CustomerOrderSnapshot & {
  completedUntil: number;
};

type Engine = {
  running: boolean;
  startedAt: number;
  lastFrame: number;
  nextSpawnAt: number;
  itemId: number;
  items: FallingItem[];
  particles: Particle[];
  texts: BurstText[];
  splatters: Splatter[];
  random: () => number;
  score: number;
  combo: number;
  bestCombo: number;
  correct: number;
  misses: number;
  orders: CustomerOrder[];
  orderId: number;
  ordersCompleted: number;
  orderStreak: number;
  previousClosed: { left: boolean; right: boolean };
  frenzyUntil: number;
  freezeUntil: number;
  flash: { color: string; amount: number };
  shake: number;
  lastHudUpdate: number;
};

const ROUND_SECONDS = 60;
const FRUIT_SPRITES: Partial<Record<FruitKind, HTMLImageElement>> = {};

if (typeof Image !== "undefined") {
  FRUITS.forEach((kind) => {
    const image = new Image();
    image.decoding = "async";
    image.src = `${import.meta.env.BASE_URL}fruits/${kind}.webp`;
    FRUIT_SPRITES[kind] = image;
  });
}

const CUSTOMERS = [
  { name: "Maya", accent: "#ff789f" },
  { name: "Theo", accent: "#65dfca" },
  { name: "Jo", accent: "#ffbf4d" },
  { name: "Nico", accent: "#a38bff" },
  { name: "Zara", accent: "#7ad5ff" },
  { name: "Remy", accent: "#b7ef63" },
] as const;

const DRINKS: { name: string; ingredients: FruitKind[] }[] = [
  { name: "Citrus Pop", ingredients: ["orange", "lime"] },
  { name: "Berry Glow", ingredients: ["berry", "orange"] },
  { name: "Melon Mist", ingredients: ["melon", "lime"] },
  { name: "Golden Crush", ingredients: ["pineapple", "orange"] },
  { name: "Sunset Splash", ingredients: ["orange", "berry", "pineapple"] },
  { name: "Green Machine", ingredients: ["lime", "melon", "pineapple"] },
  { name: "Pink Paradise", ingredients: ["berry", "melon", "orange"] },
  { name: "Tropic Thunder", ingredients: ["pineapple", "orange", "lime", "melon"] },
  { name: "Rainbow Rush", ingredients: ["berry", "lime", "orange", "pineapple"] },
  { name: "Juicer Deluxe", ingredients: ["melon", "berry", "pineapple", "lime"] },
];

function newEngine(seed: number): Engine {
  const random = createSeededRandom(seed);
  return {
    running: false,
    startedAt: 0,
    lastFrame: 0,
    nextSpawnAt: 0,
    itemId: 0,
    items: [],
    particles: [],
    texts: [],
    splatters: [],
    random,
    score: 0,
    combo: 0,
    bestCombo: 0,
    correct: 0,
    misses: 0,
    orders: [],
    orderId: 1,
    ordersCompleted: 0,
    orderStreak: 0,
    previousClosed: { left: false, right: false },
    frenzyUntil: 0,
    freezeUntil: 0,
    flash: { color: "#ffffff", amount: 0 },
    shake: 0,
    lastHudUpdate: 0,
  };
}

function createOrder(engine: Engine, elapsed: number): CustomerOrder {
  const maxIngredients = elapsed < 14 ? 2 : elapsed < 38 ? 3 : 4;
  const eligible = DRINKS.filter((drink) => drink.ingredients.length <= maxIngredients);
  const previousDrink = engine.orders.at(-1)?.drink;
  const choices = eligible.filter((drink) => drink.name !== previousDrink);
  const drink = choices[Math.floor(engine.random() * choices.length)] ?? eligible[0];
  const customer = CUSTOMERS[(engine.orderId - 1) % CUSTOMERS.length];
  const order: CustomerOrder = {
    id: engine.orderId,
    customer: customer.name,
    drink: drink.name,
    accent: customer.accent,
    ingredients: [...drink.ingredients],
    filled: drink.ingredients.map(() => false),
    completed: false,
    completedUntil: 0,
  };
  engine.orderId += 1;
  return order;
}

function refreshOrders(engine: Engine, now: number, elapsed: number) {
  engine.orders = engine.orders.filter((order) => !order.completed || now < order.completedUntil);
  const desiredOrders = elapsed < 22 ? 3 : 4;
  while (engine.orders.length < desiredOrders) engine.orders.push(createOrder(engine, elapsed));
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
}

function drawFallbackFruit(
  context: CanvasRenderingContext2D,
  kind: FruitKind,
  x: number,
  y: number,
  radius: number,
  rotation = 0,
) {
  const meta = FRUIT_META[kind];
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.shadowBlur = radius * 0.45;
  context.shadowColor = "rgba(0,0,0,.34)";
  context.shadowOffsetY = radius * 0.18;

  if (kind === "berry") {
    const berries = [
      [-0.28, -0.2, 0.48],
      [0.25, -0.2, 0.5],
      [-0.18, 0.22, 0.5],
      [0.27, 0.23, 0.47],
      [0, 0, 0.53],
    ];
    berries.forEach(([dx, dy, scale], index) => {
      const gradient = context.createRadialGradient(
        radius * (dx - 0.12),
        radius * (dy - 0.16),
        0,
        radius * dx,
        radius * dy,
        radius * scale,
      );
      gradient.addColorStop(0, index % 2 ? "#ff92c6" : "#ff73b4");
      gradient.addColorStop(0.5, meta.color);
      gradient.addColorStop(1, meta.dark);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(radius * dx, radius * dy, radius * scale, 0, Math.PI * 2);
      context.fill();
    });
  } else {
    const gradient = context.createRadialGradient(-radius * 0.32, -radius * 0.38, 0, 0, 0, radius * 1.08);
    gradient.addColorStop(0, "#fff5a6");
    gradient.addColorStop(0.18, meta.color);
    gradient.addColorStop(0.78, meta.color);
    gradient.addColorStop(1, meta.dark);
    context.fillStyle = gradient;
    context.beginPath();
    if (kind === "pineapple") {
      context.ellipse(0, radius * 0.12, radius * 0.68, radius * 0.86, 0, 0, Math.PI * 2);
    } else if (kind === "lime") {
      context.ellipse(0, 0, radius * 0.88, radius * 0.72, -0.18, 0, Math.PI * 2);
    } else if (kind === "melon") {
      context.ellipse(0, 0, radius * 0.88, radius, 0.12, 0, Math.PI * 2);
    } else {
      context.arc(0, 0, radius * 0.88, 0, Math.PI * 2);
    }
    context.fill();

    context.shadowColor = "transparent";
    if (kind === "orange") {
      context.strokeStyle = "rgba(255,239,165,.35)";
      context.lineWidth = Math.max(1.2, radius * 0.04);
      for (let index = 0; index < 7; index += 1) {
        const angle = (index / 7) * Math.PI * 2;
        context.beginPath();
        context.arc(Math.cos(angle) * radius * 0.46, Math.sin(angle) * radius * 0.46, radius * 0.025, 0, Math.PI * 2);
        context.stroke();
      }
    } else if (kind === "lime") {
      context.strokeStyle = "rgba(233,255,178,.55)";
      context.lineWidth = radius * 0.05;
      context.beginPath();
      context.arc(0, 0, radius * 0.49, -1.8, 1.1);
      context.stroke();
    } else if (kind === "melon") {
      context.strokeStyle = "rgba(9,102,87,.36)";
      context.lineWidth = radius * 0.08;
      [-0.34, 0, 0.34].forEach((offset) => {
        context.beginPath();
        context.moveTo(radius * offset, -radius * 0.75);
        context.quadraticCurveTo(radius * (offset - 0.15), 0, radius * offset, radius * 0.76);
        context.stroke();
      });
    } else if (kind === "pineapple") {
      context.strokeStyle = "rgba(171,101,18,.42)";
      context.lineWidth = radius * 0.045;
      for (let offset = -0.5; offset <= 0.5; offset += 0.34) {
        context.beginPath();
        context.moveTo(-radius * 0.55, radius * offset);
        context.lineTo(radius * 0.55, radius * (offset + 0.42));
        context.moveTo(radius * 0.55, radius * offset);
        context.lineTo(-radius * 0.55, radius * (offset + 0.42));
        context.stroke();
      }
    }
  }

  context.shadowColor = "transparent";
  context.fillStyle = kind === "pineapple" ? "#4bc15f" : "#6fd35e";
  if (kind === "pineapple") {
    [-0.34, -0.12, 0.12, 0.34].forEach((offset, index) => {
      context.save();
      context.rotate(offset);
      context.beginPath();
      context.moveTo(0, -radius * 0.62);
      context.quadraticCurveTo(radius * (index % 2 ? 0.33 : -0.33), -radius * 1.08, radius * offset, -radius * 1.35);
      context.quadraticCurveTo(radius * 0.08, -radius * 0.94, 0, -radius * 0.62);
      context.fill();
      context.restore();
    });
  } else {
    context.beginPath();
    context.ellipse(radius * 0.1, -radius * 0.85, radius * 0.34, radius * 0.16, -0.42, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#2b7540";
    context.lineWidth = Math.max(2, radius * 0.06);
    context.beginPath();
    context.moveTo(0, -radius * 0.6);
    context.lineTo(radius * 0.02, -radius * 0.96);
    context.stroke();
  }

  context.fillStyle = "rgba(255,255,255,.52)";
  context.beginPath();
  context.ellipse(-radius * 0.28, -radius * 0.31, radius * 0.13, radius * 0.23, -0.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawFruit(
  context: CanvasRenderingContext2D,
  kind: FruitKind,
  x: number,
  y: number,
  radius: number,
  rotation = 0,
) {
  const sprite = FRUIT_SPRITES[kind];
  if (!sprite?.complete || sprite.naturalWidth === 0) {
    drawFallbackFruit(context, kind, x, y, radius, rotation);
    return;
  }

  const size = radius * (kind === "pineapple" ? 3.55 : 3.25);
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.shadowColor = "rgba(20,8,32,.42)";
  context.shadowBlur = radius * 0.34;
  context.shadowOffsetY = radius * 0.18;
  context.drawImage(sprite, -size / 2, -size / 2, size, size);
  context.restore();
}

function drawPower(
  context: CanvasRenderingContext2D,
  kind: PowerKind,
  x: number,
  y: number,
  radius: number,
  rotation: number,
) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation * 0.35);
  context.shadowBlur = 24;
  context.shadowColor = kind === "freeze" ? "#53e8ff" : "#ffdc54";
  const gradient = context.createLinearGradient(-radius, -radius, radius, radius);
  if (kind === "freeze") {
    gradient.addColorStop(0, "rgba(221,254,255,.95)");
    gradient.addColorStop(1, "#45c7f0");
    context.fillStyle = gradient;
    roundedRect(context, -radius * 0.72, -radius * 0.72, radius * 1.44, radius * 1.44, radius * 0.24);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,.8)";
    context.lineWidth = radius * 0.08;
    for (let index = 0; index < 3; index += 1) {
      context.rotate(Math.PI / 3);
      context.beginPath();
      context.moveTo(-radius * 0.38, 0);
      context.lineTo(radius * 0.38, 0);
      context.stroke();
    }
  } else {
    gradient.addColorStop(0, "#fff488");
    gradient.addColorStop(0.55, "#ffb12f");
    gradient.addColorStop(1, "#f45d4b");
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(-radius * 0.28, -radius * 0.86);
    context.lineTo(radius * 0.3, -radius * 0.86);
    context.lineTo(radius * 0.66, radius * 0.55);
    context.quadraticCurveTo(0, radius * 0.94, -radius * 0.66, radius * 0.55);
    context.closePath();
    context.fill();
    context.fillStyle = "rgba(255,255,255,.86)";
    context.font = `900 ${radius * 0.76}px system-ui`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("×2", 0, radius * 0.08);
  }
  context.restore();
}

function toWorld(point: TrackedPoint, width: number, height: number) {
  return { x: point.x * width, y: point.y * height };
}

function drawDinerSpark(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha = 1,
) {
  context.save();
  context.translate(x, y);
  context.globalAlpha = alpha;
  context.strokeStyle = "#321432";
  context.fillStyle = color;
  context.lineWidth = Math.max(2, radius * 0.13);
  context.lineJoin = "round";
  context.beginPath();
  for (let point = 0; point < 16; point += 1) {
    const angle = -Math.PI / 2 + (point / 16) * Math.PI * 2;
    const pointRadius = point % 2 === 0 ? radius : radius * 0.34;
    const pointX = Math.cos(angle) * pointRadius;
    const pointY = Math.sin(angle) * pointRadius;
    if (point === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawMenuBoard(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  label: string,
  accent: string,
) {
  const height = Math.max(86, width * 0.56);
  const border = Math.max(5, width * 0.04);
  context.save();

  context.fillStyle = "rgba(22,8,29,.34)";
  roundedRect(context, x + 7, y + 9, width, height, 13);
  context.fill();

  context.fillStyle = "#321432";
  roundedRect(context, x, y, width, height, 13);
  context.fill();

  context.fillStyle = "#f3dfbd";
  roundedRect(context, x + 3, y + 3, width - 6, height - 6, 10);
  context.fill();

  context.fillStyle = "#182c33";
  roundedRect(context, x + border, y + border, width - border * 2, height - border * 2, 7);
  context.fill();

  // Slightly offset second keyline gives the sign the same print-built edge as the art.
  context.strokeStyle = accent;
  context.globalAlpha = 0.5;
  context.lineWidth = 2;
  roundedRect(context, x + border + 3, y + border + 3, width - border * 2 - 6, height - border * 2 - 6, 5);
  context.stroke();
  context.globalAlpha = 1;

  const cupX = x + border + 15;
  const cupY = y + border + 18;
  context.strokeStyle = "#321432";
  context.fillStyle = accent;
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(cupX - 7, cupY - 7);
  context.lineTo(cupX + 7, cupY - 7);
  context.lineTo(cupX + 5, cupY + 8);
  context.quadraticCurveTo(cupX, cupY + 12, cupX - 5, cupY + 8);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(cupX + 1, cupY - 8);
  context.lineTo(cupX + 7, cupY - 18);
  context.strokeStyle = "#f3dfbd";
  context.lineWidth = 3;
  context.stroke();

  context.fillStyle = accent;
  context.font = `950 ${Math.max(10, width * 0.078)}px "Arial Rounded MT Bold", system-ui`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(label, cupX + 16, cupY - 1, width - border * 2 - 44);

  context.strokeStyle = "rgba(243,223,189,.58)";
  context.lineCap = "round";
  context.lineWidth = 2;
  const rowStart = y + height * 0.58;
  for (let row = 0; row < 3; row += 1) {
    const lineY = rowStart + row * Math.max(10, height * 0.11);
    context.beginPath();
    context.moveTo(x + border + 13, lineY);
    context.lineTo(x + width - border - (row === 1 ? 26 : 13), lineY);
    context.stroke();
    context.fillStyle = accent;
    context.beginPath();
    context.arc(x + width - border - 8, lineY, 2.3, 0, Math.PI * 2);
    context.fill();
  }

  drawDinerSpark(context, x + width - 11, y + 12, Math.max(7, width * 0.052), accent, 0.9);
  context.restore();
}

function drawDinerStool(
  context: CanvasRenderingContext2D,
  x: number,
  seatY: number,
  scale: number,
  accent: string,
  floorY: number,
) {
  const seatWidth = 92 * scale;
  const seatHeight = 32 * scale;
  context.save();

  context.strokeStyle = "#321432";
  context.lineWidth = Math.max(5, 9 * scale);
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(x, seatY + seatHeight * 0.35);
  context.lineTo(x, floorY + 12);
  context.stroke();

  context.strokeStyle = "#b9d4cd";
  context.lineWidth = Math.max(2.5, 4 * scale);
  context.beginPath();
  context.moveTo(x - 1.5 * scale, seatY + seatHeight * 0.4);
  context.lineTo(x - 1.5 * scale, floorY + 10);
  context.stroke();

  const footY = seatY + (floorY - seatY) * 0.67;
  context.strokeStyle = "#321432";
  context.lineWidth = Math.max(3.5, 6 * scale);
  context.beginPath();
  context.ellipse(x, footY, seatWidth * 0.36, seatHeight * 0.37, 0, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "#9ebfba";
  context.lineWidth = Math.max(1.5, 2.4 * scale);
  context.beginPath();
  context.ellipse(x, footY - scale, seatWidth * 0.34, seatHeight * 0.31, 0, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = "#321432";
  context.beginPath();
  context.ellipse(x, seatY + 4 * scale, seatWidth * 0.53, seatHeight * 0.62, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.ellipse(x, seatY, seatWidth * 0.47, seatHeight * 0.48, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(255,242,207,.28)";
  context.beginPath();
  context.ellipse(x - seatWidth * 0.12, seatY - seatHeight * 0.12, seatWidth * 0.22, seatHeight * 0.09, -0.08, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const ink = "#321432";
  const cream = "#f3dfbd";
  const coral = "#ed5a50";
  const mint = "#66d9c0";
  const wallBottom = height * 0.72;

  context.fillStyle = "#10333b";
  context.fillRect(0, 0, width, height);

  const wallGlow = context.createRadialGradient(
    width * 0.5,
    height * 0.32,
    0,
    width * 0.5,
    height * 0.4,
    Math.max(width * 0.62, height * 0.74),
  );
  wallGlow.addColorStop(0, "#397d75");
  wallGlow.addColorStop(0.48, "#245b5b");
  wallGlow.addColorStop(1, "#10333b");
  context.fillStyle = wallGlow;
  context.fillRect(0, 0, width, wallBottom);

  // Large cel-shaded wall tiles keep the center readable while giving the room a drawn set.
  context.save();
  const tile = Math.max(50, Math.min(72, width * 0.052));
  const tileOffset = tile * 0.42;
  context.strokeStyle = "rgba(19,52,57,.55)";
  context.lineWidth = 2;
  for (let y = tileOffset; y < wallBottom; y += tile) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  for (let x = 0; x < width; x += tile) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, wallBottom);
    context.stroke();
  }
  context.strokeStyle = "rgba(117,213,194,.2)";
  context.lineWidth = 1.5;
  for (let y = tileOffset + 3; y < wallBottom; y += tile) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  for (let x = 3; x < width; x += tile) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, wallBottom);
    context.stroke();
  }
  context.restore();

  // Framed service window: thick plum linework, offset coral ink, and a clean fall zone.
  const windowMargin = Math.max(122, Math.min(238, width * 0.19));
  const windowX = windowMargin;
  const windowY = Math.max(168, height * 0.205);
  const windowWidth = Math.max(180, width - windowMargin * 2);
  const windowHeight = wallBottom - windowY + 5;
  if (windowWidth > 250) {
    context.fillStyle = "rgba(8,35,42,.24)";
    roundedRect(context, windowX + 8, windowY + 9, windowWidth, windowHeight, 16);
    context.fill();
    context.strokeStyle = ink;
    context.lineWidth = 11;
    roundedRect(context, windowX, windowY, windowWidth, windowHeight, 14);
    context.stroke();
    context.strokeStyle = cream;
    context.lineWidth = 5;
    roundedRect(context, windowX, windowY - 2, windowWidth, windowHeight, 13);
    context.stroke();
    context.strokeStyle = coral;
    context.globalAlpha = 0.56;
    context.lineWidth = 2.5;
    roundedRect(context, windowX + 5, windowY + 3, windowWidth - 10, windowHeight - 8, 9);
    context.stroke();
    context.globalAlpha = 1;
  }

  // Chrome ticket rail and checker inlay bridge the HTML order cards into the canvas world.
  const railY = Math.max(196, height * 0.245);
  context.fillStyle = ink;
  context.fillRect(0, railY - 7, width, 30);
  context.fillStyle = cream;
  context.fillRect(0, railY - 3, width, 20);
  const checkerWidth = Math.max(25, Math.min(42, width * 0.031));
  for (let x = -checkerWidth; x < width + checkerWidth; x += checkerWidth) {
    const column = Math.floor(x / checkerWidth);
    context.fillStyle = column % 2 === 0 ? coral : "#fff0cb";
    context.fillRect(x, railY - 1, checkerWidth, 16);
  }
  context.fillStyle = "rgba(255,255,255,.72)";
  context.fillRect(0, railY - 4, width, 3);
  context.fillStyle = mint;
  context.globalAlpha = 0.45;
  context.fillRect(0, railY + 15, width, 2);
  context.globalAlpha = 1;

  const menuY = Math.max(274, height * 0.345);
  const menuWidth = Math.max(116, Math.min(184, width * 0.145));
  const menuMargin = Math.max(18, width * 0.055);
  drawMenuBoard(context, menuMargin, menuY, menuWidth, "FRESH PRESSED", mint);
  drawMenuBoard(context, width - menuMargin - menuWidth, menuY, menuWidth, "HOUSE MIXES", "#ffc84c");

  // Quiet side-wall story details: a pair of sconce starbursts stay outside the play focus.
  const sparkRadius = Math.max(14, Math.min(23, width * 0.019));
  drawDinerSpark(context, menuMargin + menuWidth * 0.5, menuY - 38, sparkRadius, "#ffc84c", 0.4);
  drawDinerSpark(context, width - menuMargin - menuWidth * 0.5, menuY - 38, sparkRadius, coral, 0.38);

  // Counter lip has three authored material layers: ink, cream laminate, and chrome shine.
  context.fillStyle = ink;
  context.fillRect(0, wallBottom - 9, width, 34);
  context.fillStyle = cream;
  context.fillRect(0, wallBottom - 4, width, 22);
  context.fillStyle = "#bdc9c0";
  context.fillRect(0, wallBottom + 1, width, 7);
  context.fillStyle = "rgba(255,255,255,.78)";
  context.fillRect(0, wallBottom + 1, width, 2.5);
  context.fillStyle = coral;
  context.fillRect(0, wallBottom + 11, width, 12);
  context.fillStyle = "rgba(87,29,53,.25)";
  for (let x = -34; x < width + 34; x += 76) context.fillRect(x, wallBottom + 12, 38, 10);

  const counterGradient = context.createLinearGradient(0, wallBottom + 20, 0, height);
  counterGradient.addColorStop(0, "#643047");
  counterGradient.addColorStop(0.28, "#3d2139");
  counterGradient.addColorStop(1, "#171c2c");
  context.fillStyle = counterGradient;
  context.fillRect(0, wallBottom + 23, width, height - wallBottom - 23);

  // Panel seams and highlights make the bar front feel inked and cel shaded.
  const panelWidth = Math.max(118, Math.min(190, width * 0.145));
  context.strokeStyle = "rgba(20,10,29,.56)";
  context.lineWidth = 4;
  for (let x = panelWidth; x < width; x += panelWidth) {
    context.beginPath();
    context.moveTo(x, wallBottom + 26);
    context.lineTo(x, height);
    context.stroke();
    context.strokeStyle = "rgba(245,151,137,.08)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + 5, wallBottom + 27);
    context.lineTo(x + 5, height);
    context.stroke();
    context.strokeStyle = "rgba(20,10,29,.56)";
    context.lineWidth = 4;
  }

  const seatY = height * 0.86;
  const stoolScale = Math.max(0.72, Math.min(1, width / 1100));
  drawDinerStool(context, width * 0.18, seatY, stoolScale, coral, height);
  drawDinerStool(context, width * 0.5, seatY + height * 0.018, stoolScale, mint, height);
  drawDinerStool(context, width * 0.82, seatY, stoolScale, coral, height);

  // Subtle, deterministic ink/print freckles; denser near the edges so fruit remains crisp.
  context.save();
  context.fillStyle = "#f8dfb8";
  for (let index = 0; index < 92; index += 1) {
    const x = (index * 127 + 37) % Math.max(1, Math.floor(width));
    const y = (index * 83 + 19) % Math.max(1, Math.floor(wallBottom));
    const edge = Math.min(x, width - x) / Math.max(1, width * 0.5);
    context.globalAlpha = 0.025 + (1 - edge) * 0.04;
    context.beginPath();
    context.arc(x, y, index % 7 === 0 ? 1.5 : 0.8, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  const vignette = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, width * 0.78);
  vignette.addColorStop(0, "rgba(9,23,29,0)");
  vignette.addColorStop(0.66, "rgba(8,10,20,.05)");
  vignette.addColorStop(1, "rgba(8,10,20,.52)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  // Fine vertical risograph grain ties the code-drawn room to the illustrated assets.
  context.fillStyle = "rgba(255,244,218,.025)";
  for (let x = 0; x < width; x += 41) context.fillRect(x, 0, 1, height);
}

function drawHand(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  closed: boolean,
  id: "left" | "right",
  time: number,
) {
  const pulse = closed ? 1.06 : 1 + Math.sin(time * 0.006) * 0.025;
  const accent = id === "left" ? "#66efd3" : "#ff78b8";
  const accentDark = id === "left" ? "#168f7d" : "#b63178";
  context.save();
  context.translate(x, y);
  context.scale(pulse, pulse);

  context.globalAlpha = closed ? 0.52 : 0.36;
  context.strokeStyle = closed ? "#ffe66b" : accent;
  context.lineWidth = closed ? 8 : 5;
  context.shadowBlur = closed ? 30 : 18;
  context.shadowColor = closed ? "#ffe66b" : accent;
  context.beginPath();
  context.arc(0, 0, closed ? 43 : 51, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
  context.shadowBlur = 0;

  context.save();
  if (id === "left") context.scale(-1, 1);
  const glove = new Path2D();
  if (closed) {
    glove.moveTo(-31, 20);
    glove.bezierCurveTo(-39, 9, -38, -6, -31, -15);
    glove.bezierCurveTo(-26, -22, -18, -21, -14, -15);
    glove.bezierCurveTo(-13, -27, -5, -32, 3, -27);
    glove.bezierCurveTo(9, -34, 18, -31, 22, -24);
    glove.bezierCurveTo(30, -28, 38, -20, 36, -10);
    glove.lineTo(32, 16);
    glove.bezierCurveTo(28, 29, 15, 35, 0, 35);
    glove.bezierCurveTo(-14, 35, -26, 30, -31, 20);
    glove.closePath();
  } else {
    glove.moveTo(-21, 28);
    glove.bezierCurveTo(-29, 24, -35, 18, -39, 12);
    glove.lineTo(-50, -2);
    glove.bezierCurveTo(-55, -9, -53, -15, -48, -18);
    glove.bezierCurveTo(-43, -22, -37, -19, -33, -14);
    glove.lineTo(-28, -8);
    glove.lineTo(-31, -28);
    glove.bezierCurveTo(-32, -36, -27, -41, -22, -41);
    glove.bezierCurveTo(-17, -41, -14, -37, -14, -30);
    glove.lineTo(-13, -48);
    glove.bezierCurveTo(-13, -56, -8, -60, -3, -59);
    glove.bezierCurveTo(2, -59, 5, -55, 5, -48);
    glove.lineTo(6, -31);
    glove.lineTo(7, -51);
    glove.bezierCurveTo(8, -59, 13, -62, 18, -60);
    glove.bezierCurveTo(23, -58, 25, -53, 24, -46);
    glove.lineTo(22, -28);
    glove.lineTo(25, -42);
    glove.bezierCurveTo(27, -49, 32, -52, 37, -49);
    glove.bezierCurveTo(42, -47, 43, -41, 41, -35);
    glove.lineTo(35, -12);
    glove.bezierCurveTo(33, 3, 32, 13, 27, 22);
    glove.bezierCurveTo(20, 34, 9, 40, -4, 39);
    glove.bezierCurveTo(-11, 39, -17, 35, -21, 28);
    glove.closePath();
  }

  const gloveGradient = context.createLinearGradient(-25, -58, 22, 38);
  gloveGradient.addColorStop(0, "#ffffff");
  gloveGradient.addColorStop(0.56, "#fffdf1");
  gloveGradient.addColorStop(1, "#d9d6ea");
  context.fillStyle = gloveGradient;
  context.strokeStyle = "#321432";
  context.lineWidth = 5.5;
  context.lineJoin = "round";
  context.fill(glove);
  context.stroke(glove);

  context.strokeStyle = "rgba(89,65,103,.48)";
  context.lineWidth = 2.4;
  context.lineCap = "round";
  if (closed) {
    context.beginPath();
    context.moveTo(-26, 3);
    context.bezierCurveTo(-10, -1, 10, 2, 26, 11);
    context.bezierCurveTo(17, 19, 3, 21, -9, 17);
    context.stroke();
    [-14, 0, 14].forEach((offset) => {
      context.beginPath();
      context.moveTo(offset - 4, -16);
      context.quadraticCurveTo(offset, -20, offset + 5, -16);
      context.stroke();
    });
  } else {
    context.beginPath();
    context.moveTo(-20, 18);
    context.quadraticCurveTo(1, 7, 25, 17);
    context.stroke();
    context.beginPath();
    context.moveTo(-27, -8);
    context.quadraticCurveTo(-20, -3, -17, 5);
    context.stroke();
  }
  context.restore();

  context.fillStyle = accent;
  context.strokeStyle = "#321432";
  context.lineWidth = 4;
  roundedRect(context, -29, 29, 58, 22, 8);
  context.fill();
  context.stroke();
  context.fillStyle = accentDark;
  context.font = "1000 10px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`${id === "left" ? "L" : "R"} · ${closed ? "POP" : "OPEN"}`, 0, 40);

  if (closed) {
    context.strokeStyle = "#fff7a8";
    context.lineWidth = 3;
    context.globalAlpha = 0.88;
    const sparkPositions = [[-45, -30], [45, -20], [43, 13]];
    sparkPositions.forEach(([baseX, baseY], spark) => {
      const shimmer = Math.sin(time * 0.012 + spark * 1.8) * 2;
      const sparkX = baseX + shimmer;
      const sparkY = baseY - shimmer;
      context.beginPath();
      context.moveTo(sparkX - 4, sparkY);
      context.lineTo(sparkX + 4, sparkY);
      context.moveTo(sparkX, sparkY - 4);
      context.lineTo(sparkX, sparkY + 4);
      context.stroke();
    });
  }
  context.restore();
}

function createParticles(
  engine: Engine,
  x: number,
  y: number,
  colors: string[],
  count: number,
  shape: Particle["shape"],
) {
  for (let index = 0; index < count; index += 1) {
    const angle = engine.random() * Math.PI * 2;
    const speed = 90 + engine.random() * 360;
    const life = 0.42 + engine.random() * 0.72;
    engine.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 50,
      size: 3 + engine.random() * 12,
      color: colors[Math.floor(engine.random() * colors.length)],
      life,
      maxLife: life,
      gravity: shape === "spark" ? 90 : 470,
      shape,
    });
  }
}

function addSplatter(engine: Engine, x: number, y: number, color: string, radius = 68) {
  const points = Array.from({ length: 20 }, (_, index) =>
    index % 2 === 0 ? 0.7 + engine.random() * 0.55 : 0.55 + engine.random() * 0.22,
  );
  engine.splatters.push({ x, y, color, life: 0.64, maxLife: 0.64, radius, points });
}

function snapshot(engine: Engine, now: number): RoundSnapshot {
  return {
    score: engine.score,
    combo: engine.combo,
    bestCombo: engine.bestCombo,
    correct: engine.correct,
    misses: engine.misses,
    timeLeft: Math.max(0, ROUND_SECONDS - (now - engine.startedAt) / 1000),
    orders: engine.orders.map(({ completedUntil: _completedUntil, ...order }) => ({
      ...order,
      ingredients: [...order.ingredients],
      filled: [...order.filled],
    })),
    ordersCompleted: engine.ordersCompleted,
    orderStreak: engine.orderStreak,
    frenzyLeft: Math.max(0, (engine.frenzyUntil - now) / 1000),
    freezeLeft: Math.max(0, (engine.freezeUntil - now) / 1000),
  };
}

export function GameCanvas({
  phase,
  playToken,
  roundNumber,
  countdown,
  trackingRef,
  cameraActive,
  onSnapshot,
  onFinish,
  onAnnounce,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine>(newEngine(0x4a554943));
  const phaseRef = useRef(phase);
  const callbackRef = useRef({ onSnapshot, onFinish, onAnnounce });
  const countdownRef = useRef(countdown);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    countdownRef.current = countdown;
  }, [countdown]);
  useEffect(() => {
    callbackRef.current = { onSnapshot, onFinish, onAnnounce };
  }, [onSnapshot, onFinish, onAnnounce]);

  useEffect(() => {
    if (phase !== "playing") return;
    const engine = newEngine(0x4a554943 + roundNumber * 977 + playToken * 37);
    const now = performance.now();
    engine.running = true;
    engine.startedAt = now;
    engine.lastFrame = now;
    engine.nextSpawnAt = now + 360;
    refreshOrders(engine, now, 0);
    engineRef.current = engine;
    onSnapshot(snapshot(engine, now));
  }, [phase, playToken, roundNumber, onSnapshot]);

  const updateDemoPoint = useCallback(
    (id: "left" | "right", x: number, y: number, closed?: boolean) => {
      const old = trackingRef.current;
      if (old.source !== "demo") return;
      const hands = old.hands.map((hand) =>
        hand.id === id
          ? { ...hand, x: Math.max(0.03, Math.min(0.97, x)), y: Math.max(0.08, Math.min(0.96, y)), closed: closed ?? hand.closed }
          : hand,
      );
      trackingRef.current = { ...old, hands, updatedAt: performance.now() };
    },
    [trackingRef],
  );

  useEffect(() => {
    if (cameraActive) return;
    const pressed = new Set<string>();
    const move = (id: "left" | "right", dx: number, dy: number) => {
      const hand = trackingRef.current.hands.find((candidate) => candidate.id === id);
      if (hand) updateDemoPoint(id, hand.x + dx, hand.y + dy);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
      pressed.add(event.code);
      if (event.code === "KeyZ") updateDemoPoint("left", trackingRef.current.hands[0]?.x ?? 0.32, trackingRef.current.hands[0]?.y ?? 0.68, true);
      if (event.code === "KeyM" || event.code === "Space") {
        const right = trackingRef.current.hands.find((hand) => hand.id === "right");
        updateDemoPoint("right", right?.x ?? 0.68, right?.y ?? 0.68, true);
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      pressed.delete(event.code);
      if (event.code === "KeyZ") {
        const left = trackingRef.current.hands.find((hand) => hand.id === "left");
        updateDemoPoint("left", left?.x ?? 0.32, left?.y ?? 0.68, false);
      }
      if (event.code === "KeyM" || event.code === "Space") {
        const right = trackingRef.current.hands.find((hand) => hand.id === "right");
        updateDemoPoint("right", right?.x ?? 0.68, right?.y ?? 0.68, false);
      }
    };
    let animation = 0;
    const keyboardLoop = () => {
      const speed = 0.012;
      if (pressed.has("KeyA")) move("left", -speed, 0);
      if (pressed.has("KeyD")) move("left", speed, 0);
      if (pressed.has("KeyW")) move("left", 0, -speed);
      if (pressed.has("KeyS")) move("left", 0, speed);
      if (pressed.has("ArrowLeft")) move("right", -speed, 0);
      if (pressed.has("ArrowRight")) move("right", speed, 0);
      if (pressed.has("ArrowUp")) move("right", 0, -speed);
      if (pressed.has("ArrowDown")) move("right", 0, speed);
      animation = requestAnimationFrame(keyboardLoop);
    };
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    animation = requestAnimationFrame(keyboardLoop);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      cancelAnimationFrame(animation);
    };
  }, [cameraActive, trackingRef, updateDemoPoint]);

  const pointerPosition = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (cameraActive) return;
      const rect = event.currentTarget.getBoundingClientRect();
      updateDemoPoint("right", (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    },
    [cameraActive, updateDemoPoint],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animationFrame = 0;
    let width = 1;
    let height = 1;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const spawn = (engine: Engine, now: number, elapsed: number) => {
      const progress = Math.min(1, elapsed / ROUND_SECONDS);
      const powerChance = elapsed > 8 ? 0.065 : 0;
      const isPower = engine.random() < powerChance;
      const baseRadius = Math.max(30, Math.min(47, width * 0.032));
      if (isPower) {
        engine.items.push({
          id: engine.itemId++,
          type: "power",
          kind: engine.itemId % 2 === 0 ? "freeze" : "frenzy",
          x: 0.12 + engine.random() * 0.76,
          y: -baseRadius * 1.6,
          radius: baseRadius * 0.9,
          velocityX: (engine.random() - 0.5) * 0.035,
          velocityY: 145 + progress * 145,
          rotation: engine.random() * 2,
          rotationSpeed: (engine.random() - 0.5) * 1.4,
        });
      } else {
        const neededFruit = engine.orders
          .filter((order) => !order.completed)
          .flatMap((order) => order.ingredients.filter((_, index) => !order.filled[index]));
        const shouldMatch = neededFruit.length > 0 && engine.random() < 0.68;
        const kind = shouldMatch
          ? neededFruit[Math.floor(engine.random() * neededFruit.length)]
          : FRUITS[Math.floor(engine.random() * FRUITS.length)];
        engine.items.push({
          id: engine.itemId++,
          type: "fruit",
          kind,
          x: 0.08 + engine.random() * 0.84,
          y: -baseRadius * 1.6,
          radius: baseRadius * (0.86 + engine.random() * 0.18),
          velocityX: (engine.random() - 0.5) * (0.045 + progress * 0.035),
          velocityY: 150 + progress * 205 + engine.random() * 55,
          rotation: engine.random() * Math.PI * 2,
          rotationSpeed: (engine.random() - 0.5) * 2.5,
        });
      }
      const interval = 970 - progress * 510 + engine.random() * 170;
      engine.nextSpawnAt = now + interval;
      if (progress > 0.5 && engine.random() < 0.18) engine.nextSpawnAt -= interval * 0.45;
    };

    const hitItem = (engine: Engine, item: FallingItem, x: number, y: number, now: number) => {
      engine.items = engine.items.filter((candidate) => candidate.id !== item.id);
      if (item.type === "power") {
        const kind = item.kind as PowerKind;
        if (kind === "freeze") engine.freezeUntil = now + 6500;
        else engine.frenzyUntil = now + 6500;
        const color = kind === "freeze" ? "#6eeeff" : "#ffe05b";
        addSplatter(engine, x, y, color, 82);
        createParticles(engine, x, y, [color, "#fff", kind === "freeze" ? "#8fddff" : "#ff7a5e"], 34, "spark");
        engine.texts.push({
          x,
          y,
          label: kind === "freeze" ? "CHILL FLOW" : "JUICE RUSH",
          sublabel: kind === "freeze" ? "SLOW MOTION · 6 SEC" : "DOUBLE TIPS · 6 SEC",
          color,
          life: 1.25,
          maxLife: 1.25,
          scale: 1.2,
        });
        engine.flash = { color, amount: 0.38 };
        juiceAudio.play("power");
        callbackRef.current.onAnnounce(kind === "freeze" ? "Chill Flow activated for six seconds" : "Juice Rush activated: matching fruit is double points");
        return;
      }

      const kind = item.kind as FruitKind;
      const frenzy = engine.frenzyUntil > now;
      const matchingOrder = engine.orders.find((order) =>
        !order.completed && order.ingredients.some((ingredient, index) => ingredient === kind && !order.filled[index]),
      );
      const ingredientIndex = matchingOrder?.ingredients.findIndex((ingredient, index) => ingredient === kind && !matchingOrder.filled[index]) ?? -1;
      const correct = Boolean(matchingOrder && ingredientIndex >= 0);
      const scored = scoreJuice(engine.score, engine.combo, correct, frenzy);
      engine.score = scored.score;
      engine.combo = scored.combo;
      engine.bestCombo = Math.max(engine.bestCombo, engine.combo);
      if (correct) {
        if (!matchingOrder || ingredientIndex < 0) return;
        matchingOrder.filled[ingredientIndex] = true;
        engine.correct += 1;
        const meta = FRUIT_META[kind];
        addSplatter(engine, x, y, meta.splash, 72 + Math.min(28, engine.combo * 2));
        createParticles(engine, x, y, [meta.color, meta.splash, "#fff4ad", meta.dark], 25 + Math.min(15, engine.combo), "drop");
        engine.texts.push({
          x,
          y,
          label: engine.combo >= 8 ? "MEGA SPLASH!" : engine.combo >= 4 ? "COMBO POUR!" : "JUICY!",
          sublabel: `+${scored.delta}${engine.combo > 1 ? `  ·  ${engine.combo}× COMBO` : ""}`,
          color: frenzy ? "#ffe667" : meta.splash,
          life: 0.92,
          maxLife: 0.92,
          scale: engine.combo >= 8 ? 1.22 : 1,
        });
        engine.flash = { color: meta.splash, amount: 0.22 };
        engine.shake = Math.min(11, 3 + engine.combo * 0.7);
        const orderComplete = matchingOrder.filled.every(Boolean);
        if (orderComplete) {
          const orderBonus = (300 + matchingOrder.ingredients.length * 125 + Math.min(500, engine.orderStreak * 75)) * (frenzy ? 2 : 1);
          engine.score += orderBonus;
          engine.ordersCompleted += 1;
          engine.orderStreak += 1;
          matchingOrder.completed = true;
          matchingOrder.completedUntil = now + 950;
          engine.texts.push({
            x: width * 0.5,
            y: Math.max(260, height * 0.43),
            label: "ORDER UP!",
            sublabel: `${matchingOrder.customer.toUpperCase()} · +${orderBonus} BONUS · ${engine.ordersCompleted} SERVED`,
            color: "#fff279",
            life: 1.45,
            maxLife: 1.45,
            scale: 1.45,
          });
          createParticles(engine, width * 0.5, height * 0.42, ["#fff279", meta.splash, "#77f6d4", "#ff569d", "#ffffff"], 64, "spark");
          addSplatter(engine, width * 0.5, height * 0.42, matchingOrder.accent, 125);
          engine.flash = { color: "#fff279", amount: 0.46 };
          engine.shake = 18;
          juiceAudio.play("order");
          callbackRef.current.onAnnounce(`${matchingOrder.customer}'s ${matchingOrder.drink} complete. Order up! ${orderBonus} bonus points. ${engine.ordersCompleted} ${engine.ordersCompleted === 1 ? "order" : "orders"} served.`);
        } else {
          juiceAudio.play("correct");
          callbackRef.current.onAnnounce(`${meta.label} added to ${matchingOrder.customer}'s ${matchingOrder.drink}. Plus ${scored.delta}. ${matchingOrder.filled.filter(Boolean).length} of ${matchingOrder.ingredients.length} ingredients filled.`);
        }
      } else {
        engine.misses += 1;
        engine.orderStreak = 0;
        addSplatter(engine, x, y, "#ff375f", 88);
        createParticles(engine, x, y, ["#ff375f", "#681e4c", "#ffd3da"], 23, "dot");
        engine.texts.push({
          x,
          y,
          label: "WRONG MIX",
          sublabel: `${scored.delta || 0}  ·  COMBO LOST`,
          color: "#ff6680",
          life: 1.06,
          maxLife: 1.06,
          scale: 1.12,
        });
        engine.flash = { color: "#ff244f", amount: 0.4 };
        engine.shake = 16;
        juiceAudio.play("wrong");
        callbackRef.current.onAnnounce(`No customer needs ${FRUIT_META[kind].label} right now. ${Math.abs(scored.delta)} point penalty. Combo reset.`);
      }
    };

    const updateEngine = (engine: Engine, now: number) => {
      const delta = Math.min(0.04, Math.max(0, (now - engine.lastFrame) / 1000));
      engine.lastFrame = now;
      const elapsed = (now - engine.startedAt) / 1000;
      if (elapsed >= ROUND_SECONDS) {
        engine.running = false;
        juiceAudio.play("finish");
        callbackRef.current.onFinish({
          score: engine.score,
          combo: engine.combo,
          bestCombo: engine.bestCombo,
          correct: engine.correct,
          misses: engine.misses,
          ordersCompleted: engine.ordersCompleted,
          rank: rankForScore(engine.score),
        });
        return;
      }

      refreshOrders(engine, now, elapsed);
      if (now >= engine.nextSpawnAt) spawn(engine, now, elapsed);
      const timeScale = engine.freezeUntil > now ? 0.44 : 1;
      engine.items.forEach((item) => {
        item.y += item.velocityY * delta * timeScale;
        item.x += item.velocityX * delta * timeScale;
        item.rotation += item.rotationSpeed * delta * timeScale;
        if (item.x < 0.045 || item.x > 0.955) item.velocityX *= -1;
      });
      engine.items = engine.items.filter((item) => item.y < height + item.radius * 2);

      const frame = trackingRef.current;
      frame.hands.forEach((hand) => {
        const justClosed = hand.closed && !engine.previousClosed[hand.id];
        engine.previousClosed[hand.id] = hand.closed;
        if (!justClosed) return;
        const point = toWorld(hand, width, height);
        const nearest = engine.items
          .map((item) => ({ item, distance: Math.hypot(item.x * width - point.x, item.y - point.y) }))
          .filter(({ item, distance }) => distance <= item.radius + 46)
          .sort((a, b) => a.distance - b.distance)[0];
        if (nearest) hitItem(engine, nearest.item, nearest.item.x * width, nearest.item.y, now);
        else juiceAudio.play("close");
      });

      engine.particles.forEach((particle) => {
        particle.life -= delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vy += particle.gravity * delta;
        particle.vx *= 0.992;
      });
      engine.particles = engine.particles.filter((particle) => particle.life > 0);
      engine.texts.forEach((text) => {
        text.life -= delta;
        text.y -= 35 * delta;
      });
      engine.texts = engine.texts.filter((text) => text.life > 0);
      engine.splatters.forEach((splatter) => (splatter.life -= delta));
      engine.splatters = engine.splatters.filter((splatter) => splatter.life > 0);
      engine.flash.amount = Math.max(0, engine.flash.amount - delta * 1.7);
      engine.shake = Math.max(0, engine.shake - delta * 32);

      if (now - engine.lastHudUpdate >= 90) {
        engine.lastHudUpdate = now;
        callbackRef.current.onSnapshot(snapshot(engine, now));
      }
    };

    const drawEffects = (engine: Engine) => {
      engine.splatters.forEach((splatter) => {
        const progress = 1 - splatter.life / splatter.maxLife;
        context.save();
        context.globalAlpha = Math.min(0.68, splatter.life / splatter.maxLife) * (1 - progress * 0.35);
        context.fillStyle = splatter.color;
        context.translate(splatter.x, splatter.y);
        context.scale(Math.min(1, progress * 5), Math.min(1, progress * 5));
        context.beginPath();
        splatter.points.forEach((point, index) => {
          const angle = (index / splatter.points.length) * Math.PI * 2;
          const radius = splatter.radius * point;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
        context.fill();
        context.restore();
      });

      engine.particles.forEach((particle) => {
        const alpha = Math.min(1, particle.life / Math.min(0.25, particle.maxLife));
        context.save();
        context.globalAlpha = alpha;
        context.fillStyle = particle.color;
        context.translate(particle.x, particle.y);
        context.rotate(Math.atan2(particle.vy, particle.vx) + Math.PI / 2);
        if (particle.shape === "drop") {
          context.beginPath();
          context.moveTo(0, -particle.size * 1.6);
          context.quadraticCurveTo(particle.size, -particle.size * 0.3, particle.size * 0.72, particle.size * 0.65);
          context.arc(0, particle.size * 0.45, particle.size * 0.75, 0, Math.PI);
          context.closePath();
          context.fill();
        } else if (particle.shape === "spark") {
          context.fillRect(-particle.size * 0.18, -particle.size * 1.6, particle.size * 0.36, particle.size * 3.2);
        } else {
          context.beginPath();
          context.arc(0, 0, particle.size, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      });
    };

    const drawTexts = (engine: Engine) => {
      engine.texts.forEach((text) => {
        const progress = 1 - text.life / text.maxLife;
        const intro = Math.min(1, progress * 8);
        context.save();
        context.translate(text.x, text.y);
        context.scale(intro * text.scale, intro * text.scale);
        context.globalAlpha = Math.min(1, text.life * 2.5);
        context.textAlign = "center";
        context.lineJoin = "round";
        context.font = "1000 31px system-ui";
        context.lineWidth = 9;
        context.strokeStyle = "rgba(20,8,36,.86)";
        context.strokeText(text.label, 0, 0);
        context.fillStyle = text.color;
        context.fillText(text.label, 0, 0);
        context.font = "900 12px system-ui";
        context.letterSpacing = "1.5px";
        context.fillStyle = "#fff";
        context.strokeStyle = "rgba(20,8,36,.85)";
        context.lineWidth = 5;
        context.strokeText(text.sublabel, 0, 23);
        context.fillText(text.sublabel, 0, 23);
        context.restore();
      });
    };

    const render = (now: number) => {
      animationFrame = requestAnimationFrame(render);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const engine = engineRef.current;
      if (phaseRef.current === "playing" && engine.running) updateEngine(engine, now);

      context.save();
      const shakeX = engine.shake ? Math.sin(now * 0.19) * engine.shake * 0.5 : 0;
      const shakeY = engine.shake ? Math.cos(now * 0.23) * engine.shake * 0.5 : 0;
      context.translate(shakeX, shakeY);
      drawBackdrop(context, width, height);

      drawEffects(engine);
      engine.items.forEach((item) => {
        const x = item.x * width;
        if (item.type === "fruit") drawFruit(context, item.kind as FruitKind, x, item.y, item.radius, item.rotation);
        else drawPower(context, item.kind as PowerKind, x, item.y, item.radius, item.rotation);
      });

      const frame = trackingRef.current;
      frame.hands.forEach((hand) => {
        const point = toWorld(hand, width, height);
        drawHand(context, point.x, point.y, hand.closed, hand.id, now);
      });
      drawTexts(engine);

      if (engine.freezeUntil > now) {
        context.fillStyle = "rgba(76,217,255,.055)";
        context.fillRect(0, 0, width, height);
      }
      if (engine.flash.amount > 0) {
        context.globalAlpha = engine.flash.amount;
        context.fillStyle = engine.flash.color;
        context.fillRect(0, 0, width, height);
      }
      context.restore();

      if (phaseRef.current === "countdown") {
        const value = countdownRef.current;
        context.fillStyle = "rgba(11,5,25,.48)";
        context.fillRect(0, 0, width, height);
        context.save();
        context.translate(width / 2, height / 2);
        context.shadowBlur = 60;
        context.shadowColor = value === 0 ? "#8dfbdd" : "#ffb82f";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = `1000 ${Math.min(180, width * 0.14)}px system-ui`;
        context.lineWidth = 15;
        context.strokeStyle = "rgba(28,10,43,.72)";
        const label = value === 0 ? "POUR!" : String(value);
        context.strokeText(label, 0, 0);
        context.fillStyle = value === 0 ? "#8dfbdd" : "#fff4c2";
        context.fillText(label, 0, 0);
        context.restore();
      }
    };

    animationFrame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [cameraActive, trackingRef]);

  return (
    <canvas
      ref={canvasRef}
      className="game-canvas"
      tabIndex={cameraActive ? -1 : 0}
      aria-label={
        cameraActive
          ? "Juicers camera playfield"
          : "Juicers demo playfield. Move the right hand with the mouse or arrow keys. Hold click, Space, or M to squeeze. Move the left hand with W A S D and squeeze with Z."
      }
      onPointerMove={pointerPosition}
      onPointerDown={(event) => {
        if (cameraActive) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerPosition(event);
        const hand = trackingRef.current.hands.find((candidate) => candidate.id === "right");
        updateDemoPoint("right", hand?.x ?? 0.68, hand?.y ?? 0.68, true);
      }}
      onPointerUp={() => {
        const hand = trackingRef.current.hands.find((candidate) => candidate.id === "right");
        updateDemoPoint("right", hand?.x ?? 0.68, hand?.y ?? 0.68, false);
      }}
      onPointerCancel={() => {
        const hand = trackingRef.current.hands.find((candidate) => candidate.id === "right");
        updateDemoPoint("right", hand?.x ?? 0.68, hand?.y ?? 0.68, false);
      }}
    />
  );
}
