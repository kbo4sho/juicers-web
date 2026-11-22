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
const assemblyUrl = `data:text/javascript;base64,${Buffer.from(compile(assemblySource, "drinkAssembly.ts")).toString("base64")}`;
const assembly = await import(assemblyUrl);

const backdropSource = (await readFile(new URL("../src/game/counterBackdrop.ts", import.meta.url), "utf8"))
  .replace('from "./drinkAssembly"', `from "${assemblyUrl}"`)
  .replace('from "./model"', `from "${modelUrl}"`);
const backdrop = await import(`data:text/javascript;base64,${Buffer.from(compile(backdropSource, "counterBackdrop.ts")).toString("base64")}`);

function assertInsideViewport(box, width, height, label) {
  assert.ok(box.left >= 0, `${label} left (${box.left}) >= 0`);
  assert.ok(box.right <= width, `${label} right (${box.right}) <= ${width}`);
  assert.ok(box.top >= 0, `${label} top (${box.top}) >= 0`);
  assert.ok(box.bottom <= height, `${label} bottom (${box.bottom}) <= ${height}`);
  assert.ok(box.right > box.left, `${label} width > 0`);
  assert.ok(box.bottom > box.top, `${label} height > 0`);
}

function boxesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test("counter scene layout keeps prep props inside bounds and clear of the cup station", () => {
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [390, 844],
    [320, 640],
    [844, 390],
    [667, 375],
  ]) {
    const station = assembly.getDrinkStationLayout(width, height);
    const cup = assembly.drinkCupBox(station);
    const layout = backdrop.getCounterSceneLayout(width, height, station);

    assertInsideViewport(layout.prepMat, width, height, `${width}x${height} prepMat`);
    assert.ok(layout.prepMat.right > cup.right, `${width}x${height} prepMat covers cup`);

    for (const [name, box] of [
      ["cuttingBoard", layout.cuttingBoard],
      ["juicerPress", layout.juicerPress],
      ["fruitCrate", layout.fruitCrate],
    ]) {
      if (!box) continue;
      assertInsideViewport(box, width, height, `${width}x${height} ${name}`);
      assert.equal(boxesOverlap(box, cup), false, `${width}x${height} ${name} overlaps cup`);
      assert.equal(boxesOverlap(box, layout.prepMat), false, `${width}x${height} ${name} overlaps prepMat`);
    }

    if (layout.cupStackRight) {
      assert.ok(layout.cupStackRight.x - 16 > layout.juicerPress.right, `${width}x${height} cupStack clears juicer`);
      assert.ok(layout.cupStackRight.x + 16 <= width, `${width}x${height} cupStack inside viewport`);
    }
  }
});

test("counterBackdrop uses no shadowBlur calls", () => {
  assert.equal(/shadowBlur/.test(backdropSource), false);
});
