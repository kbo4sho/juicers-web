import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/game/audioScore.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const score = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("gameplay score is one exact 60-second round", () => {
  assert.equal(score.GAMEPLAY_SCORE.beats, 96);
  assert.equal(score.GAMEPLAY_SCORE.bpm, 96);
  assert.equal(score.scoreDurationSeconds(score.GAMEPLAY_SCORE), 60);
});

test("gameplay arrangement uses the complete soda-fountain palette", () => {
  const voices = new Set(score.GAMEPLAY_SCORE.events.map((event) => event.voice));
  assert.deepEqual(
    [...voices].sort(),
    ["bass", "brush", "chrome", "fizz", "keys", "kick", "organ", "shaker"],
  );
});

test("all score events remain inside their loop boundary", () => {
  Object.values(score.SCORES).forEach((arrangement) => {
    arrangement.events.forEach((event) => {
      assert.ok(event.beat >= 0, `${arrangement.name} has a negative event`);
      assert.ok(event.beat < arrangement.beats, `${arrangement.name} event starts outside loop`);
      assert.ok(event.duration > 0, `${arrangement.name} event must have duration`);
      assert.ok(event.beat + event.duration <= arrangement.beats, `${arrangement.name} event rings beyond loop`);
      assert.ok(event.velocity > 0 && event.velocity <= 1, `${arrangement.name} velocity is bounded`);
    });
  });
});

test("each ten-second gameplay section has a distinct orchestration signature", () => {
  const signatures = Array.from({ length: 6 }, (_, section) =>
    score.scoreSectionSignature(score.GAMEPLAY_SCORE, section * 16, (section + 1) * 16),
  );
  assert.equal(new Set(signatures).size, signatures.length, signatures.join("\n"));
});

test("last ten seconds increase rhythmic density without changing loop tempo", () => {
  const count = (from, to) => score.GAMEPLAY_SCORE.events.filter((event) => event.beat >= from && event.beat < to).length;
  assert.ok(count(80, 96) > count(64, 80));
  assert.equal(score.GAMEPLAY_SCORE.bpm, 96);
});

test("every audible scene has an intentional transport and conservative bus levels", () => {
  for (const [scene, profile] of Object.entries(score.SCENE_PROFILES)) {
    if (scene === "silent") {
      assert.equal(profile.transport, null);
      assert.equal(profile.music, 0);
      assert.equal(profile.ambience, 0);
      continue;
    }
    assert.ok(profile.transport, `${scene} needs a transport`);
    assert.ok(profile.music > 0 && profile.music < 0.6);
    assert.ok(profile.ambience >= 0 && profile.ambience < 0.2);
    assert.ok(profile.sfx > profile.music, `${scene} cues must read above music`);
  }
  assert.ok(score.MASTER_LEVEL < 0.85);
});

test("playing-to-urgent preserves one transport; other scene changes replace it", () => {
  assert.equal(score.shouldPreserveGameplayTransport("playing", "urgent"), true);
  assert.equal(score.shouldPreserveGameplayTransport("urgent", "playing"), true);
  assert.equal(score.shouldPreserveGameplayTransport("countdown", "playing"), false);
  assert.equal(score.shouldPreserveGameplayTransport("playing", "results"), false);
});

test("loop position normalization is stable across pause and replay boundaries", () => {
  assert.equal(score.normalizeLoopPosition(60, score.GAMEPLAY_SCORE), 0);
  assert.equal(score.normalizeLoopPosition(61.25, score.GAMEPLAY_SCORE), 1.25);
  assert.equal(score.normalizeLoopPosition(-0.5, score.GAMEPLAY_SCORE), 59.5);
});
