import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/game/model.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function ticket(overrides) {
  return {
    id: 1,
    customer: "Maya",
    drink: "Citrus Pop",
    ingredients: ["orange", "lime"],
    filled: [false, false],
    completed: false,
    ...overrides,
  };
}

test("correct fruit increases score and combo", () => {
  assert.deepEqual(model.scoreJuice(0, 0, true, false), { score: 100, combo: 1, delta: 100 });
});

test("fourth match raises the score multiplier", () => {
  assert.deepEqual(model.scoreJuice(300, 3, true, false), { score: 500, combo: 4, delta: 200 });
});

test("frenzy doubles correct fruit value", () => {
  assert.equal(model.scoreJuice(0, 0, true, true).delta, 200);
});

test("wrong fruit penalizes and resets without going negative", () => {
  assert.deepEqual(model.scoreJuice(40, 7, false, false), { score: 0, combo: 0, delta: -40 });
});

test("regular recipe names never overlap across the cast", () => {
  const names = Object.values(model.CUSTOMER_RECIPES).flat();
  assert.equal(new Set(names).size, names.length);
});

test("regulars keep distinct recipe shapes", () => {
  const size = (customer) => model.CUSTOMER_RECIPES[customer].map((name) => model.recipeByName(name).ingredients.length);
  assert.deepEqual([...new Set(size("Theo"))], [1]);
  assert.deepEqual([...new Set(size("Dax"))], [4]);
  assert.ok(size("Maya").every((count) => count === 2));
  assert.ok(size("Pip").every((count) => count === 3));
  assert.ok(model.CUSTOMER_RECIPES.Zara.every((name) => {
    const recipe = model.recipeByName(name);
    const unusual = recipe.name === "Oddball Ade" || recipe.name === "Moon Mix" || recipe.name === "Chaos Cooler";
    const hasBerryLime = recipe.ingredients.includes("berry") && recipe.ingredients.includes("lime");
    const hasMelonBerry = recipe.ingredients.includes("melon") && recipe.ingredients.includes("berry");
    return unusual && (hasBerryLime || hasMelonBerry);
  }));
  assert.equal(model.personaByName("Theo").patience, "calm");
  assert.ok(model.personaByName("Theo").dwellMs > model.personaByName("Pip").dwellMs);
});

test("a visible queue never repeats a drink name", () => {
  for (let seed = 1; seed <= 48; seed += 1) {
    const random = model.createSeededRandom(seed * 97);
    const orders = [];
    for (let id = 1; id <= 4; id += 1) {
      orders.push(model.createCustomerOrder(
        id,
        orders.map((order) => order.customer),
        orders.map((order) => order.drink),
        random,
      ));
    }
    const drinks = orders.map((order) => order.drink);
    assert.equal(new Set(drinks).size, drinks.length, `seed ${seed}: ${drinks.join(", ")}`);
    assert.equal(new Set(orders.map((order) => order.customer)).size, orders.length);
  }
});

test("squeeze fills the aimed ticket instead of the first match", () => {
  const orders = [
    ticket({ id: 1, customer: "Maya", drink: "Citrus Pop", ingredients: ["orange", "lime"], filled: [false, false] }),
    ticket({ id: 2, customer: "Pip", drink: "Sunset Splash", ingredients: ["orange", "berry", "pineapple"], filled: [false, false, false] }),
    ticket({ id: 3, customer: "Mina", drink: "Melon Mist", ingredients: ["melon", "lime"], filled: [false, false] }),
  ];
  const result = model.resolveSqueezeTarget(0.5, "orange", orders);
  assert.equal(result.kind, "served");
  assert.equal(result.orderId, 2);
});

test("an aimed ticket that does not want the fruit is a miss, not a dump", () => {
  const orders = [
    ticket({ id: 1, customer: "Maya", drink: "Citrus Pop", ingredients: ["orange", "lime"], filled: [false, false] }),
    ticket({ id: 2, customer: "Pip", drink: "Sunset Splash", ingredients: ["orange", "berry", "pineapple"], filled: [false, false, false] }),
  ];
  const result = model.resolveSqueezeTarget(0.22, "berry", orders);
  assert.equal(result.kind, "wrong-ticket");
  assert.equal(result.orderId, 1);
  assert.equal(result.aimedOrderId, 1);
});

test("previewed card is the card that would be served, including off the old rail band", () => {
  const orders = [
    ticket({ id: 1, customer: "Maya", drink: "Citrus Pop", ingredients: ["orange", "lime"], filled: [false, false] }),
    ticket({ id: 2, customer: "Pip", drink: "Sunset Splash", ingredients: ["orange", "berry", "pineapple"], filled: [false, false, false] }),
  ];
  const hands = [{ id: "right", x: 0.04, closed: false }];
  const preview = model.previewAim(hands, orders, true);
  const squeeze = model.resolveSqueezeTarget(0.04, "berry", orders);
  assert.equal(preview.orderId, squeeze.orderId);
  assert.equal(preview.orderId, 1);
  assert.equal(squeeze.kind, "wrong-ticket");
  assert.equal(squeeze.aimedOrderId, 1);

  const servedPreview = model.previewAim([{ id: "right", x: 0.72, closed: false }], orders, true, "orange");
  const served = model.resolveSqueezeTarget(0.72, "orange", orders);
  assert.equal(servedPreview.orderId, served.orderId);
  assert.equal(served.kind, "served");
  assert.equal(served.orderId, 2);
});

test("glove X always selects a ticket while any order is open", () => {
  const orders = [
    ticket({ id: 1, customer: "Maya", drink: "Citrus Pop", ingredients: ["orange", "lime"], filled: [false, false] }),
    ticket({ id: 3, customer: "Mina", drink: "Melon Mist", ingredients: ["melon", "lime"], filled: [false, false] }),
  ];
  for (const x of [0.02, 0.16, 0.5, 0.84, 0.98]) {
    const preview = model.resolveAimedOrder(x, orders);
    assert.equal(preview.mode, "locked");
    assert.ok(preview.orderId === 1 || preview.orderId === 3, `x=${x} selected ${preview.orderId}`);
    const squeeze = model.resolveSqueezeTarget(x, "lime", orders);
    assert.equal(squeeze.orderId, preview.orderId);
    assert.equal(squeeze.aimedOrderId, preview.orderId);
  }
  assert.equal(model.resolveAimedOrder(0.1, orders).orderId, 1);
  assert.equal(model.resolveAimedOrder(0.9, orders).orderId, 3);
});

test("demo aiming prefers the right glove until a fist closes", () => {
  const hands = [
    { id: "left", x: 0.22, closed: false },
    { id: "right", x: 0.78, closed: false },
  ];
  assert.equal(model.selectAimingHand(hands, true).id, "right");
  assert.equal(model.selectAimingHand([{ ...hands[0], closed: true }, hands[1]], true).id, "left");
});

test("chalkboard lines fill empty boards from the house list", () => {
  assert.deepEqual(model.chalkboardLines([], model.FRESH_PRESSED_MENU), [...model.FRESH_PRESSED_MENU]);
  assert.deepEqual(
    model.chalkboardLines(["Quiet Cup", "Moon Mix"], model.FRESH_PRESSED_MENU),
    ["Quiet Cup", "Moon Mix", "Citrus Pop"],
  );
});
