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

export type SqueezeTarget = {
  kind: "served" | "wrong-ticket" | "nobody";
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

// Selection is an explicit UI action. Hand coordinates and closed state never
// enter this contract. Only order lifecycle can advance an unavailable ticket.
export function resolveSelectedOrder(selectedId: number | null, orders: readonly AimableOrder[]): number | null {
  const open = orders.filter((order) => !order.completed);
  return open.find((order) => order.id === selectedId)?.id ?? open[0]?.id ?? null;
}

export function resolveSqueezeTarget(
  selectedId: number | null,
  kind: FruitKind,
  orders: readonly AimableOrder[],
): SqueezeTarget {
  const ticket = orders.find((order) => order.id === selectedId && !order.completed);
  if (!ticket) return { kind: "nobody", orderId: null, aimedOrderId: selectedId };
  return {
    kind: orderWantsFruit(ticket, kind) ? "served" : "wrong-ticket",
    orderId: ticket.id,
    aimedOrderId: ticket.id,
  };
}
