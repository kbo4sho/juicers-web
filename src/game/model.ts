export const FRUITS = ["orange", "lime", "berry", "melon", "pineapple"] as const;
export type FruitKind = (typeof FRUITS)[number];
export type PowerKind = "freeze" | "frenzy";
export type RoundMode = "timed" | "endless";
export type CustomerName = "Maya" | "Theo" | "Pip" | "Mina" | "Zara" | "Dax";
export type PatienceKind = "calm" | "steady" | "eager";

export type Recipe = {
  name: string;
  ingredients: FruitKind[];
  art: string;
};

export type CustomerPersona = {
  name: CustomerName;
  accent: string;
  tag: string;
  patience: PatienceKind;
  dwellMs: number;
};

export type AimableOrder = {
  id: number;
  customer: string;
  drink: string;
  ingredients: FruitKind[];
  filled: boolean[];
  completed: boolean;
};

export type AimHand = {
  id: "left" | "right";
  x: number;
  closed: boolean;
};

export type AimPreview = {
  orderId: number | null;
  mode: "locked" | "open";
};

export type SqueezeTarget = {
  kind: "served" | "wrong-ticket" | "fallback" | "nobody";
  orderId: number | null;
  aimedOrderId: number | null;
};

export type CustomerOrderSnapshot = {
  id: number;
  customer: string;
  drink: string;
  accent: string;
  ingredients: FruitKind[];
  filled: boolean[];
  completed: boolean;
  tag: string;
  patience: PatienceKind;
};

export const FRUIT_META: Record<
  FruitKind,
  { label: string; color: string; dark: string; splash: string }
> = {
  orange: { label: "Orange", color: "#ff9d24", dark: "#dc501e", splash: "#ffb22c" },
  lime: { label: "Lime", color: "#a9ec45", dark: "#3e9b3b", splash: "#c8ff54" },
  berry: { label: "Berry", color: "#f04e9b", dark: "#852d79", splash: "#ff66b4" },
  melon: { label: "Melon", color: "#63dbc5", dark: "#137d74", splash: "#80f1cf" },
  pineapple: { label: "Pineapple", color: "#ffd84f", dark: "#de8b22", splash: "#ffe56e" },
};

export const CUSTOMER_CAST: readonly CustomerPersona[] = [
  { name: "Maya", accent: "#ff789f", tag: "BRIGHT", patience: "steady", dwellMs: 950 },
  { name: "Theo", accent: "#65dfca", tag: "NO RUSH", patience: "calm", dwellMs: 1650 },
  { name: "Pip", accent: "#ff8a4c", tag: "UP-TEMPO", patience: "eager", dwellMs: 780 },
  { name: "Mina", accent: "#f0a23d", tag: "TART", patience: "steady", dwellMs: 950 },
  { name: "Zara", accent: "#7ad5ff", tag: "WILD CARD", patience: "eager", dwellMs: 880 },
  { name: "Dax", accent: "#9b6cff", tag: "GO BIG", patience: "eager", dwellMs: 820 },
] as const;

export const RECIPES: readonly Recipe[] = [
  { name: "Citrus Pop", ingredients: ["orange", "lime"], art: "citrus-pop" },
  { name: "Golden Crush", ingredients: ["pineapple", "orange"], art: "golden-crush" },
  { name: "Berry Glow", ingredients: ["berry", "orange"], art: "berry-glow" },
  { name: "Quiet Cup", ingredients: ["orange"], art: "citrus-pop" },
  { name: "Easy Lime", ingredients: ["lime"], art: "melon-mist" },
  { name: "Sunset Splash", ingredients: ["orange", "berry", "pineapple"], art: "sunset-splash" },
  { name: "Pink Paradise", ingredients: ["berry", "melon", "orange"], art: "pink-paradise" },
  { name: "Melon Mist", ingredients: ["melon", "lime"], art: "melon-mist" },
  { name: "Green Machine", ingredients: ["lime", "melon", "pineapple"], art: "green-machine" },
  { name: "Oddball Ade", ingredients: ["berry", "lime"], art: "berry-glow" },
  { name: "Moon Mix", ingredients: ["melon", "pineapple", "berry"], art: "pink-paradise" },
  { name: "Chaos Cooler", ingredients: ["lime", "berry", "melon"], art: "green-machine" },
  { name: "Tropic Thunder", ingredients: ["pineapple", "orange", "lime", "melon"], art: "tropic-thunder" },
  { name: "Rainbow Rush", ingredients: ["berry", "lime", "orange", "pineapple"], art: "rainbow-rush" },
  { name: "Juicer Deluxe", ingredients: ["melon", "berry", "pineapple", "lime"], art: "juicer-deluxe" },
] as const;

export const CUSTOMER_RECIPES: Record<CustomerName, readonly string[]> = {
  Maya: ["Citrus Pop", "Golden Crush", "Berry Glow"],
  Theo: ["Quiet Cup", "Easy Lime"],
  Pip: ["Sunset Splash", "Pink Paradise"],
  Mina: ["Melon Mist", "Green Machine"],
  Zara: ["Oddball Ade", "Moon Mix", "Chaos Cooler"],
  Dax: ["Tropic Thunder", "Rainbow Rush", "Juicer Deluxe"],
};

export const FRESH_PRESSED_MENU = ["Citrus Pop", "Berry Glow", "Melon Mist"] as const;
export const HOUSE_MIXES_MENU = ["Tropic Thunder", "Rainbow Rush", "Juicer Deluxe"] as const;

/** Horizontal band matching the HTML ticket rail. Hands outside it are "aimed at nobody". */
export const AIM_RAIL_LEFT = 0.16;
export const AIM_RAIL_RIGHT = 0.84;

export type RoundSnapshot = {
  score: number;
  combo: number;
  bestCombo: number;
  correct: number;
  misses: number;
  timeLeft: number | null;
  orders: CustomerOrderSnapshot[];
  ordersCompleted: number;
  orderStreak: number;
  frenzyLeft: number;
  freezeLeft: number;
  aimedOrderId: number | null;
};

export type RoundResult = Omit<
  RoundSnapshot,
  "timeLeft" | "orders" | "orderStreak" | "frenzyLeft" | "freezeLeft" | "aimedOrderId"
> & {
  rank: string;
};

export function scoreJuice(
  score: number,
  combo: number,
  correct: boolean,
  frenzy: boolean,
): { score: number; combo: number; delta: number } {
  if (!correct) {
    const delta = -Math.min(75, score);
    return { score: Math.max(0, score + delta), combo: 0, delta };
  }
  const nextCombo = combo + 1;
  const multiplier = 1 + Math.min(3, Math.floor(nextCombo / 4));
  const delta = 100 * multiplier * (frenzy ? 2 : 1);
  return { score: score + delta, combo: nextCombo, delta };
}

export function rankForScore(score: number): string {
  if (score >= 7500) return "LEGENDARY POUR";
  if (score >= 4800) return "MASTER JUICER";
  if (score >= 2600) return "SPLASH MAKER";
  return "FRESH SQUEEZE";
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function nextTarget(current: FruitKind, random: () => number): FruitKind {
  const choices = FRUITS.filter((fruit) => fruit !== current);
  return choices[Math.floor(random() * choices.length)];
}

export function personaByName(name: string): CustomerPersona {
  return CUSTOMER_CAST.find((persona) => persona.name === name) ?? CUSTOMER_CAST[0];
}

export function recipeByName(name: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.name === name);
}

export function drinkArtSlug(drink: string): string {
  const recipe = recipeByName(drink);
  if (recipe) return recipe.art;
  return drink.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function orderWantsFruit(order: AimableOrder, kind: FruitKind): boolean {
  if (order.completed) return false;
  return order.ingredients.some((ingredient, index) => ingredient === kind && !order.filled[index]);
}

function pickOne<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

export function nextCustomerName(orderId: number, seated: readonly string[]): CustomerName {
  const start = (Math.max(1, orderId) - 1) % CUSTOMER_CAST.length;
  for (let offset = 0; offset < CUSTOMER_CAST.length; offset += 1) {
    const name = CUSTOMER_CAST[(start + offset) % CUSTOMER_CAST.length].name;
    if (!seated.includes(name)) return name;
  }
  return CUSTOMER_CAST[start].name;
}

export function pickRecipeForCustomer(
  customer: CustomerName,
  takenNames: readonly string[],
  random: () => number,
): Recipe {
  const preferred = CUSTOMER_RECIPES[customer]
    .map((name) => recipeByName(name))
    .filter((recipe): recipe is Recipe => recipe !== undefined && !takenNames.includes(recipe.name));
  if (preferred.length > 0) return pickOne(preferred, random);

  const unused = RECIPES.filter((recipe) => !takenNames.includes(recipe.name));
  if (unused.length > 0) return pickOne(unused, random);

  const fallback = recipeByName(CUSTOMER_RECIPES[customer][0]) ?? RECIPES[0];
  return { ...fallback, name: `${fallback.name} Extra` };
}

export function createCustomerOrder(
  orderId: number,
  seatedCustomers: readonly string[],
  takenDrinks: readonly string[],
  random: () => number,
): CustomerOrderSnapshot {
  const customer = nextCustomerName(orderId, seatedCustomers);
  const persona = personaByName(customer);
  const recipe = pickRecipeForCustomer(customer, takenDrinks, random);
  return {
    id: orderId,
    customer,
    drink: recipe.name,
    accent: persona.accent,
    ingredients: [...recipe.ingredients],
    filled: recipe.ingredients.map(() => false),
    completed: false,
    tag: persona.tag,
    patience: persona.patience,
  };
}

export function createPracticeOrder(): CustomerOrderSnapshot {
  const persona = personaByName("Maya");
  const recipe = recipeByName("Citrus Pop") ?? RECIPES[0];
  return {
    id: 1,
    customer: persona.name,
    drink: recipe.name,
    accent: persona.accent,
    ingredients: [...recipe.ingredients],
    filled: recipe.ingredients.map(() => false),
    completed: false,
    tag: persona.tag,
    patience: persona.patience,
  };
}

export function chalkboardLines(liveDrinks: readonly string[], fallback: readonly string[], count = 3): string[] {
  const lines: string[] = [];
  liveDrinks.forEach((drink) => {
    if (lines.length >= count || lines.includes(drink)) return;
    lines.push(drink);
  });
  fallback.forEach((drink) => {
    if (lines.length >= count || lines.includes(drink)) return;
    lines.push(drink);
  });
  return lines;
}

function railCenters(count: number): number[] {
  if (count <= 0) return [];
  const span = AIM_RAIL_RIGHT - AIM_RAIL_LEFT;
  return Array.from({ length: count }, (_, index) => AIM_RAIL_LEFT + ((index + 0.5) / count) * span);
}

function nearestIndex(x: number, centers: readonly number[]): number {
  if (centers.length === 0) return -1;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  centers.forEach((center, index) => {
    const distance = Math.abs(x - center);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

export function activeOrders<T extends AimableOrder>(orders: readonly T[]): T[] {
  return orders.filter((order) => !order.completed);
}

export function resolveAimedOrder(handX: number, orders: readonly AimableOrder[]): AimPreview {
  const open = activeOrders(orders);
  if (open.length === 0) return { orderId: null, mode: "open" };
  const centers = railCenters(open.length);
  const index = nearestIndex(handX, centers);
  return { orderId: open[index]?.id ?? null, mode: "locked" };
}

export function selectAimingHand(
  hands: readonly AimHand[],
  preferRight: boolean,
): AimHand | null {
  if (hands.length === 0) return null;
  const squeezing = hands.filter((hand) => hand.closed);
  if (squeezing.length === 1) return squeezing[0];
  if (squeezing.length > 1) {
    return preferRight
      ? squeezing.find((hand) => hand.id === "right") ?? squeezing[0]
      : squeezing[0];
  }
  if (preferRight) return hands.find((hand) => hand.id === "right") ?? hands[0];
  return hands.reduce((closest, hand) => {
    const closestMid = Math.abs(closest.x - 0.5);
    const handMid = Math.abs(hand.x - 0.5);
    return handMid < closestMid ? hand : closest;
  });
}

export function resolveSqueezeTarget(
  handX: number,
  kind: FruitKind,
  orders: readonly AimableOrder[],
): SqueezeTarget {
  const open = activeOrders(orders);
  const aimed = resolveAimedOrder(handX, open);

  if (aimed.orderId === null) {
    return { kind: "nobody", orderId: null, aimedOrderId: null };
  }

  const ticket = open.find((order) => order.id === aimed.orderId) ?? null;
  if (ticket && orderWantsFruit(ticket, kind)) {
    return { kind: "served", orderId: ticket.id, aimedOrderId: ticket.id };
  }
  if (ticket) {
    return { kind: "wrong-ticket", orderId: ticket.id, aimedOrderId: ticket.id };
  }

  const matching = open.filter((order) => orderWantsFruit(order, kind));
  if (matching.length === 0) {
    return { kind: "nobody", orderId: null, aimedOrderId: aimed.orderId };
  }
  const centers = railCenters(open.length);
  const fallback = [...matching].sort((left, right) => {
    const leftIndex = open.findIndex((order) => order.id === left.id);
    const rightIndex = open.findIndex((order) => order.id === right.id);
    return Math.abs(handX - (centers[leftIndex] ?? 0.5)) - Math.abs(handX - (centers[rightIndex] ?? 0.5));
  })[0];
  return { kind: "fallback", orderId: fallback.id, aimedOrderId: fallback.id };
}

export function previewAim(
  hands: readonly AimHand[],
  orders: readonly AimableOrder[],
  preferRight: boolean,
  fruitKind?: FruitKind,
): AimPreview {
  const hand = selectAimingHand(hands, preferRight);
  if (!hand) return { orderId: null, mode: "open" };
  if (fruitKind) {
    const target = resolveSqueezeTarget(hand.x, fruitKind, orders);
    if (target.orderId !== null) {
      return { orderId: target.orderId, mode: target.kind === "nobody" ? "open" : "locked" };
    }
  }
  return resolveAimedOrder(hand.x, orders);
}
