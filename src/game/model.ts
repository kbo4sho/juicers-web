export const FRUITS = ["orange", "lime", "berry", "melon", "pineapple"] as const;
export type FruitKind = (typeof FRUITS)[number];
export type PowerKind = "freeze" | "frenzy";

export type CustomerOrderSnapshot = {
  id: number;
  customer: string;
  drink: string;
  accent: string;
  ingredients: FruitKind[];
  filled: boolean[];
  completed: boolean;
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

export type RoundSnapshot = {
  score: number;
  combo: number;
  bestCombo: number;
  correct: number;
  misses: number;
  timeLeft: number;
  orders: CustomerOrderSnapshot[];
  ordersCompleted: number;
  orderStreak: number;
  frenzyLeft: number;
  freezeLeft: number;
};

export type RoundResult = Omit<RoundSnapshot, "timeLeft" | "orders" | "orderStreak" | "frenzyLeft" | "freezeLeft"> & {
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
