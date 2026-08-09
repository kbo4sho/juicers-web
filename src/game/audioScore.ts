export type AudioScene = "silent" | "tutorial" | "countdown" | "playing" | "urgent" | "results";

export type ScoreVoice =
  | "keys"
  | "organ"
  | "bass"
  | "kick"
  | "brush"
  | "shaker"
  | "fizz"
  | "chrome";

export type ScoreEvent = {
  beat: number;
  duration: number;
  voice: ScoreVoice;
  note?: number;
  notes?: readonly number[];
  velocity: number;
};

export type Score = {
  name: "tutorial" | "countdown" | "gameplay" | "results";
  bpm: number;
  beats: number;
  events: readonly ScoreEvent[];
};

export type SceneProfile = {
  music: number;
  ambience: number;
  sfx: number;
  transport: Score["name"] | null;
};

export const MASTER_LEVEL = 0.78;

export const SCENE_PROFILES: Record<AudioScene, SceneProfile> = {
  silent: { music: 0, ambience: 0, sfx: 0.72, transport: null },
  tutorial: { music: 0.28, ambience: 0.13, sfx: 0.72, transport: "tutorial" },
  countdown: { music: 0.34, ambience: 0.1, sfx: 0.76, transport: "countdown" },
  playing: { music: 0.48, ambience: 0.12, sfx: 0.76, transport: "gameplay" },
  urgent: { music: 0.56, ambience: 0.08, sfx: 0.79, transport: "gameplay" },
  results: { music: 0.36, ambience: 0.1, sfx: 0.76, transport: "results" },
};

const event = (
  beat: number,
  duration: number,
  voice: ScoreVoice,
  velocity: number,
  note?: number,
  notes?: readonly number[],
): ScoreEvent => ({ beat, duration, voice, velocity, ...(note === undefined ? {} : { note }), ...(notes ? { notes } : {}) });

function sortEvents(events: ScoreEvent[]) {
  return events.sort((left, right) => left.beat - right.beat || left.voice.localeCompare(right.voice));
}

// 24 bars at 96 BPM: the gameplay arrangement is exactly one 60-second round.
// Harmony moves through a diner-jazz I–VI–II–V family and resolves before the loop.
const GAMEPLAY_CHORDS = [
  [60, 64, 67, 69], [57, 61, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65],
  [60, 64, 67, 69], [57, 61, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65],
  [65, 69, 72, 76], [66, 69, 72, 75], [60, 64, 67, 71], [57, 61, 64, 67],
  [62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 69], [55, 59, 62, 65],
  [65, 69, 72, 76], [64, 68, 71, 74], [62, 65, 69, 72], [55, 59, 62, 65],
  [60, 64, 67, 69], [57, 61, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65],
] as const;

const GAMEPLAY_ROOTS = [
  36, 33, 38, 31, 36, 33, 38, 31,
  41, 42, 36, 33, 38, 31, 36, 31,
  41, 40, 38, 31, 36, 33, 38, 31,
] as const;

function makeGameplayScore(): Score {
  const events: ScoreEvent[] = [];

  GAMEPLAY_CHORDS.forEach((chord, bar) => {
    const start = bar * 4;
    const section = Math.floor(bar / 4);
    const root = GAMEPLAY_ROOTS[bar];

    // Warm electric-piano/mallet comping. Later sections add offbeats without
    // abandoning the roomy first chorus.
    events.push(event(start, section === 0 ? 1.45 : 1.05, "keys", section === 0 ? 0.52 : 0.58, undefined, chord));
    if (section >= 1) events.push(event(start + 2.5, 0.72, "keys", 0.43 + section * 0.025, undefined, chord));
    if (section >= 3) events.push(event(start + 1.5, 0.4, "keys", 0.3, chord[2] + 12));
    if (bar >= 8 && bar < 16 && bar % 2 === 0) events.push(event(start, 3.7, "organ", 0.2, undefined, chord.slice(0, 3)));

    // A rounded, mostly quarter-note bass becomes a walk in the second half.
    if (bar >= 2) {
      events.push(event(start, 0.54, "bass", 0.64, root));
      events.push(event(start + 2, 0.48, "bass", 0.54, root + 7));
    }
    if (bar >= 8) events.push(event(start + 1, 0.4, "bass", 0.38, root + (bar % 2 === 0 ? 4 : 3)));
    if (bar >= 16) events.push(event(start + 3, 0.36, "bass", 0.46, GAMEPLAY_ROOTS[(bar + 1) % GAMEPLAY_ROOTS.length] - 1));

    // Brushes and a soft shoe-shuffle establish motion without a sharp drum kit.
    if (bar >= 1) {
      events.push(event(start, 0.22, "kick", 0.34));
      events.push(event(start + 2, 0.2, "kick", bar >= 16 ? 0.38 : 0.29));
      events.push(event(start + 1, 0.3, "brush", 0.4));
      events.push(event(start + 3, 0.3, "brush", 0.46));
    }
    if (bar >= 4) {
      const step = bar >= 20 ? 0.25 : 0.5;
      for (let offset = 0; offset < 4; offset += step) {
        const downbeat = Math.abs(offset % 1) < 0.001;
        events.push(event(start + offset, 0.08, "shaker", downbeat ? 0.18 : 0.11));
      }
    }

    // Soda-fountain punctuation: glassy counter chrome and little carbonation lifts.
    if ([3, 7, 11, 15, 19, 23].includes(bar)) events.push(event(start + 3.5, 0.34, "chrome", bar === 23 ? 0.36 : 0.22, 84));
    if ([6, 14, 18, 22].includes(bar)) events.push(event(start + 3.25, 0.58, "fizz", 0.18));

    // The final ten seconds are an authored urgency passage, not a tempo jump:
    // bright top notes and denser brushes keep the clock readable without panic.
    if (bar >= 20) {
      events.push(event(start + 0.5, 0.28, "keys", 0.32, chord[1] + 12));
      events.push(event(start + 1.5, 0.28, "keys", 0.34, chord[2] + 12));
      events.push(event(start + 2.5, 0.28, "keys", 0.36, chord[3] + 12));
      events.push(event(start + 3.5, 0.22, "brush", 0.34));
    }
  });

  return { name: "gameplay", bpm: 96, beats: 96, events: sortEvents(events) };
}

export const GAMEPLAY_SCORE = makeGameplayScore();

export const TUTORIAL_SCORE: Score = {
  name: "tutorial",
  bpm: 96,
  beats: 16,
  events: sortEvents([
    event(0, 3.7, "organ", 0.14, undefined, [60, 64, 67]),
    event(0.25, 1.5, "keys", 0.24, undefined, [64, 67, 72]),
    event(4, 3.7, "organ", 0.12, undefined, [57, 60, 64]),
    event(6.5, 0.34, "chrome", 0.12, 84),
    event(8, 3.7, "organ", 0.14, undefined, [62, 65, 69]),
    event(8.25, 1.5, "keys", 0.22, undefined, [65, 69, 74]),
    event(12, 3.7, "organ", 0.12, undefined, [55, 59, 62]),
    event(14.75, 0.54, "fizz", 0.1),
  ]),
};

export const COUNTDOWN_SCORE: Score = {
  name: "countdown",
  bpm: 96,
  beats: 8,
  events: sortEvents([
    event(0, 3.6, "organ", 0.16, undefined, [55, 60, 64]),
    event(2, 0.7, "fizz", 0.1),
    event(4, 3.6, "organ", 0.18, undefined, [55, 59, 65]),
    event(6.5, 0.7, "fizz", 0.12),
  ]),
};

export const RESULTS_SCORE: Score = {
  name: "results",
  bpm: 96,
  beats: 16,
  events: sortEvents([
    event(0, 0.7, "keys", 0.4, undefined, [60, 64, 67]),
    event(1, 0.7, "keys", 0.34, undefined, [62, 65, 69]),
    event(2, 1.8, "keys", 0.42, undefined, [64, 67, 72]),
    event(4, 3.7, "organ", 0.14, undefined, [65, 69, 72]),
    event(6.5, 0.35, "chrome", 0.16, 84),
    event(8, 3.7, "organ", 0.13, undefined, [60, 64, 69]),
    event(8.25, 1.4, "keys", 0.22, undefined, [64, 67, 72]),
    event(12, 3.7, "organ", 0.11, undefined, [55, 59, 65]),
    event(14.75, 0.55, "fizz", 0.09),
  ]),
};

export const SCORES: Record<Score["name"], Score> = {
  tutorial: TUTORIAL_SCORE,
  countdown: COUNTDOWN_SCORE,
  gameplay: GAMEPLAY_SCORE,
  results: RESULTS_SCORE,
};

export function scoreDurationSeconds(score: Score) {
  return score.beats * (60 / score.bpm);
}

export function normalizeLoopPosition(seconds: number, score: Score) {
  const duration = scoreDurationSeconds(score);
  return ((seconds % duration) + duration) % duration;
}

export function shouldPreserveGameplayTransport(from: AudioScene, to: AudioScene) {
  return (from === "playing" || from === "urgent") && (to === "playing" || to === "urgent");
}

export function scoreSectionSignature(score: Score, fromBeat: number, toBeat: number) {
  const counts: Partial<Record<ScoreVoice, number>> = {};
  score.events.forEach((scoreEvent) => {
    if (scoreEvent.beat < fromBeat || scoreEvent.beat >= toBeat) return;
    counts[scoreEvent.voice] = (counts[scoreEvent.voice] ?? 0) + 1;
  });
  return Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)).map(([voice, count]) => `${voice}:${count}`).join("|");
}
