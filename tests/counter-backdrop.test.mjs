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

function stationFromChrome(width, height, chrome) {
  const cupHeight = Math.round(Math.max(76, Math.min(108, Math.min(width * 0.22, height * 0.138))));
  const topWidth = Math.round(cupHeight * 0.74);
  const bottomWidth = Math.round(cupHeight * 0.52);
  const x = chrome.railLeft + chrome.cardWidth + chrome.stackPeek + chrome.gap + topWidth * 0.5;
  return {
    x,
    baseY: height - chrome.railBottom - 8,
    mouthY: height - chrome.railBottom - 8 - cupHeight,
    cupHeight,
    topWidth,
    bottomWidth,
    isNarrow: width < 760,
  };
}

const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [1280, 500],
  [844, 390],
  [667, 375],
  [390, 844],
  [320, 640],
];

test("counter scene layout keeps prep props inside bounds and clear of the cup station", () => {
  for (const [width, height] of VIEWPORTS) {
    const chrome = backdrop.fallbackStationChrome(width, height);
    const station = stationFromChrome(width, height, chrome);
    const reserved = backdrop.reservedStationRegions(width, height, station, chrome);
    const layout = backdrop.getCounterSceneLayout(width, height, station);
    const label = `${width}x${height}`;

    assert.equal(reserved.cup.left, assembly.drinkCupBox(station).left);
    assert.equal(station.baseY, height - chrome.railBottom - 8, `${label} uses CSS rail bottom`);
    assertInsideViewport(layout.prepMat, width, height, `${label} prepMat`);
    assert.ok(layout.prepMat.right > reserved.cup.right, `${label} prepMat covers cup`);

    for (const [name, box] of [
      ["cuttingBoard", layout.cuttingBoard],
      ["juicerPress", layout.juicerPress],
      ["fruitCrate", layout.fruitCrate],
    ]) {
      if (!box) continue;
      assertInsideViewport(box, width, height, `${label} ${name}`);
      assert.equal(boxesOverlap(box, reserved.cup), false, `${label} ${name} overlaps cup`);
      assert.equal(boxesOverlap(box, reserved.card), false, `${label} ${name} overlaps card`);
      assert.equal(boxesOverlap(box, reserved.hint), false, `${label} ${name} overlaps hint`);
      assert.equal(boxesOverlap(box, layout.prepMat), false, `${label} ${name} overlaps prepMat`);
    }

    if (layout.cupStackRight) {
      assert.ok(layout.juicerPress, `${label} cupStack requires juicer`);
      assert.ok(layout.cupStackRight.x - 16 > layout.juicerPress.right, `${label} cupStack clears juicer`);
      assert.ok(layout.cupStackRight.x + 16 <= width, `${label} cupStack inside viewport`);
    }
  }
});

test("short-landscape chrome matches the max-height 500px CSS contract", () => {
  const wideShort = backdrop.fallbackStationChrome(1280, 500);
  assert.equal(wideShort.railBottom, 10);
  assert.equal(wideShort.aimLift, 8);
  assert.equal(wideShort.cardHeight, 148);
  const phoneShort = backdrop.fallbackStationChrome(667, 375);
  assert.equal(phoneShort.railBottom, 10);
  assert.equal(phoneShort.aimLift, 8);
  assert.equal(phoneShort.cardHeight, 142);
  const landscapePhone = backdrop.fallbackStationChrome(844, 390);
  assert.equal(landscapePhone.railBottom, 10);
  assert.equal(landscapePhone.cardWidth, 200);
  assert.equal(landscapePhone.cardHeight, 148);
});

test("counterBackdrop uses no shadowBlur calls", () => {
  assert.equal(/shadowBlur/.test(backdropSource), false);
});
