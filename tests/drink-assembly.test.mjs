import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const compile = (source, fileName) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName,
}).outputText;

const modelSource = await readFile(new URL("../src/game/model.ts", import.meta.url), "utf8");
const modelUrl = `data:text/javascript;base64,${Buffer.from(compile(modelSource, "model.ts")).toString("base64")}`;
const assemblySource = (await readFile(new URL("../src/game/drinkAssembly.ts", import.meta.url), "utf8"))
  .replace('from "./model"', `from "${modelUrl}"`);
const assembly = await import(`data:text/javascript;base64,${Buffer.from(compile(assemblySource, "drinkAssembly.ts")).toString("base64")}`);
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

function arc(overrides = {}) {
  return {
    orderId: 1,
    kind: "lime",
    startX: 10,
    startY: 10,
    startedAt: 0,
    durationMs: 320,
    ...overrides,
  };
}

function firstVar(source, name, after = 0) {
  const match = source.slice(after).match(new RegExp(`${name}:\\s*([0-9.]+)px`));
  assert.ok(match, `missing ${name}`);
  return Number(match[1]);
}

test("ORDER_STATION fallbacks match the CSS custom properties", () => {
  const rootEnd = css.indexOf("@media (max-width: 760px)");
  const narrow = css.slice(rootEnd, css.indexOf("}", css.indexOf(":root", rootEnd)) + 1);
  assert.equal(firstVar(css, "--order-station-left", 0), assembly.ORDER_STATION.railLeft.wide);
  assert.equal(firstVar(narrow, "--order-station-left"), assembly.ORDER_STATION.railLeft.narrow);
  assert.equal(firstVar(css, "--order-station-card-width", 0), assembly.ORDER_STATION.cardWidth.wide);
  assert.equal(firstVar(narrow, "--order-station-card-width"), assembly.ORDER_STATION.cardWidth.narrow);
  assert.equal(firstVar(css, "--order-station-stack-peek", 0), assembly.ORDER_STATION.stackPeek.wide);
  assert.equal(firstVar(narrow, "--order-station-stack-peek"), assembly.ORDER_STATION.stackPeek.narrow);
  assert.equal(firstVar(css, "--order-station-gap", 0), assembly.ORDER_STATION.gap.wide);
  assert.equal(firstVar(narrow, "--order-station-gap"), assembly.ORDER_STATION.gap.narrow);
  assert.equal(firstVar(css, "--order-station-rail-bottom", 0), assembly.ORDER_STATION.railBottom.wide);
  assert.equal(firstVar(narrow, "--order-station-rail-bottom"), assembly.ORDER_STATION.railBottom.narrow);
});

test("getDrinkStationLayout falls back to ORDER_STATION metrics", () => {
  const wide = assembly.getDrinkStationLayout(1280, 800);
  assert.equal(wide.isNarrow, false);
  assert.equal(wide.x, 24 + 200 + 78 + 8 + wide.topWidth * 0.5);
  const narrow = assembly.getDrinkStationLayout(390, 844);
  assert.equal(narrow.isNarrow, true);
  assert.equal(narrow.x, 8 + 155 + 70 + 8 + narrow.topWidth * 0.5);
  const box = assembly.drinkCupBox(narrow);
  assert.equal(box.left, narrow.x - narrow.topWidth * 0.5);
  assert.equal(box.right, narrow.x + narrow.topWidth * 0.5);
  assert.ok(box.right > box.left);
  assert.ok(box.bottom > box.top);
});

test("stepPourArcs drops arcs that are not aimed and does not bounce them", () => {
  const other = arc({ orderId: 1, startedAt: 0 });
  const aimed = arc({ orderId: 2, startedAt: 0 });
  const stepped = assembly.stepPourArcs([other, aimed], 2, 220, false);
  assert.equal(stepped.arcs.length, 1);
  assert.equal(stepped.arcs[0].orderId, 2);
  assert.equal(stepped.arcs[0].bounced, true);
  assert.equal(stepped.bounce, true);
  assert.equal(other.bounced, undefined);
});

test("stepPourArcs does not bounce until the aimed arc lands", () => {
  const stepped = assembly.stepPourArcs([arc()], 1, 100, false);
  assert.equal(stepped.arcs.length, 1);
  assert.equal(stepped.bounce, false);
  assert.equal(stepped.arcs[0].bounced, undefined);
});

test("stepPourArcs skips the cup bounce when motion is reduced", () => {
  const stepped = assembly.stepPourArcs([arc()], 1, 220, true);
  assert.equal(stepped.bounce, false);
  assert.equal(stepped.arcs[0].bounced, true);
});

test("stepPourArcs drops a finished aimed arc", () => {
  const stepped = assembly.stepPourArcs([arc()], 1, 400, false);
  assert.equal(stepped.arcs.length, 0);
  assert.equal(stepped.bounce, true);
});
