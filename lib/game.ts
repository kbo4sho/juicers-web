export const FRUIT_KEYS = ["orange", "strawberry", "lime", "blueberry"] as const;

export type FruitKey = (typeof FRUIT_KEYS)[number];

export type FallingFruit = {
  id: number;
  type: FruitKey;
  x: number;
  y: number;
  speed: number;
  rotation: number;
};

export type Point = { x: number; y: number };

export const FRUIT_META: Record<
  FruitKey,
  { emoji: string; label: string; color: string }
> = {
  orange: { emoji: "🍊", label: "orange", color: "#ff8f1f" },
  strawberry: { emoji: "🍓", label: "strawberry", color: "#ff416c" },
  lime: { emoji: "🍋‍🟩", label: "lime", color: "#95df3a" },
  blueberry: { emoji: "🫐", label: "blueberry", color: "#7759f3" },
};

export function fruitMatches(target: FruitKey, candidate: FruitKey) {
  return target === candidate;
}

export function scoreForCatch(matches: boolean, combo: number) {
  return matches ? 10 + Math.min(Math.max(combo, 0), 5) * 2 : 0;
}

export function nextTarget(current: FruitKey, selector = Math.random()): FruitKey {
  const choices = FRUIT_KEYS.filter((fruit) => fruit !== current);
  const index = Math.min(choices.length - 1, Math.floor(selector * choices.length));
  return choices[Math.max(0, index)];
}

export function createFruit(
  id: number,
  target: FruitKey,
  random = Math.random,
): FallingFruit {
  const targetWeighted = random() < 0.54;
  const alternatives = FRUIT_KEYS.filter((fruit) => fruit !== target);
  const alternativeIndex = Math.min(
    alternatives.length - 1,
    Math.floor(random() * alternatives.length),
  );

  return {
    id,
    type: targetWeighted ? target : alternatives[Math.max(0, alternativeIndex)],
    x: 0.1 + random() * 0.8,
    y: -0.1,
    speed: 0.12 + random() * 0.08,
    rotation: -20 + random() * 40,
  };
}

export function advanceFruits(fruits: FallingFruit[], deltaSeconds: number) {
  return fruits
    .map((fruit) => ({ ...fruit, y: fruit.y + fruit.speed * deltaSeconds }))
    .filter((fruit) => fruit.y < 1.12);
}

export function findCatch(
  fruits: FallingFruit[],
  point: Point,
  target: FruitKey,
  radius = 0.13,
) {
  const candidate = fruits
    .map((fruit) => ({
      fruit,
      distance: Math.hypot(fruit.x - point.x, fruit.y - point.y),
    }))
    .filter(({ distance }) => distance <= radius)
    .sort((a, b) => a.distance - b.distance)[0];

  if (!candidate) return null;

  return {
    fruit: candidate.fruit,
    matches: fruitMatches(target, candidate.fruit.type),
    distance: candidate.distance,
  };
}
