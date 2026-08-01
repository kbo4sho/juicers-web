import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceFruits,
  createFruit,
  findCatch,
  fruitMatches,
  nextTarget,
  scoreForCatch,
  type FallingFruit,
} from "../lib/game";

test("matching fruit earns base points and a bounded combo bonus", () => {
  assert.equal(fruitMatches("orange", "orange"), true);
  assert.equal(fruitMatches("orange", "lime"), false);
  assert.equal(scoreForCatch(true, 0), 10);
  assert.equal(scoreForCatch(true, 3), 16);
  assert.equal(scoreForCatch(true, 99), 20);
  assert.equal(scoreForCatch(false, 4), 0);
});

test("target selection always changes the active order", () => {
  assert.equal(nextTarget("orange", 0), "strawberry");
  assert.notEqual(nextTarget("lime", 0.99), "lime");
});

test("fruit creation keeps items in the playable horizontal band", () => {
  const values = [0.1, 0.8, 0.5, 0.25];
  let index = 0;
  const fruit = createFruit(7, "orange", () => values[index++ % values.length]);
  assert.equal(fruit.id, 7);
  assert.equal(fruit.type, "orange");
  assert.ok(fruit.x >= 0.1 && fruit.x <= 0.9);
  assert.ok(fruit.speed >= 0.12 && fruit.speed <= 0.2);
});

test("collision chooses the closest fruit and reports whether it matches", () => {
  const fruits: FallingFruit[] = [
    { id: 1, type: "lime", x: 0.4, y: 0.45, speed: 0.1, rotation: 0 },
    { id: 2, type: "orange", x: 0.51, y: 0.51, speed: 0.1, rotation: 0 },
  ];
  const caught = findCatch(fruits, { x: 0.5, y: 0.5 }, "orange", 0.2);
  assert.equal(caught?.fruit.id, 2);
  assert.equal(caught?.matches, true);
  assert.equal(findCatch(fruits, { x: 0.9, y: 0.9 }, "orange", 0.05), null);
});

test("falling fruit advances by elapsed time and leaves the round cleanly", () => {
  const fruits: FallingFruit[] = [
    { id: 1, type: "orange", x: 0.5, y: 0.2, speed: 0.2, rotation: 0 },
    { id: 2, type: "lime", x: 0.2, y: 1.1, speed: 0.2, rotation: 0 },
  ];
  const next = advanceFruits(fruits, 0.5);
  assert.equal(next.length, 1);
  assert.equal(next[0].id, 1);
  assert.equal(next[0].y, 0.30000000000000004);
});
