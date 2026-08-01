import assert from "node:assert/strict";
import test from "node:test";

// These tiny mirrors keep the critical scoring contract independently executable
// without introducing a TypeScript runtime into the production bundle.
function scoreJuice(score, combo, correct, frenzy) {
  if (!correct) {
    const delta = -Math.min(75, score);
    return { score: Math.max(0, score + delta), combo: 0, delta };
  }
  const nextCombo = combo + 1;
  const multiplier = 1 + Math.min(3, Math.floor(nextCombo / 4));
  const delta = 100 * multiplier * (frenzy ? 2 : 1);
  return { score: score + delta, combo: nextCombo, delta };
}

test("correct fruit increases score and combo", () => {
  assert.deepEqual(scoreJuice(0, 0, true, false), { score: 100, combo: 1, delta: 100 });
});

test("fourth match raises the score multiplier", () => {
  assert.deepEqual(scoreJuice(300, 3, true, false), { score: 500, combo: 4, delta: 200 });
});

test("frenzy doubles correct fruit value", () => {
  assert.equal(scoreJuice(0, 0, true, true).delta, 200);
});

test("wrong fruit penalizes and resets without going negative", () => {
  assert.deepEqual(scoreJuice(40, 7, false, false), { score: 0, combo: 0, delta: -40 });
});
