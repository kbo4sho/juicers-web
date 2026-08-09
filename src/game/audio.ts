import {
  MASTER_LEVEL,
  SCENE_PROFILES,
  SCORES,
  normalizeLoopPosition,
  scoreDurationSeconds,
  shouldPreserveGameplayTransport,
  type AudioScene,
  type Score,
  type ScoreEvent,
} from "./audioScore";

export type SoundName = "start" | "tick" | "correct" | "order" | "wrong" | "power" | "finish" | "close";

type BusName = "music" | "ambience" | "sfx";

type AudioBuses = {
  master: GainNode;
  music: GainNode;
  musicDuck: GainNode;
  ambience: GainNode;
  sfx: GainNode;
  limiter: DynamicsCompressorNode;
};

type Transport = {
  score: Score;
  anchor: number;
  eventIndex: number;
  cycle: number;
};

export type AudioDiagnostics = {
  scene: AudioScene;
  muted: boolean;
  visible: boolean;
  contextState: AudioContextState | "uninitialized";
  schedulerActive: boolean;
  schedulerGeneration: number;
  transport: Score["name"] | null;
  transportSeconds: number | null;
  scheduledSources: Record<BusName, number>;
  busLevels: { master: number; music: number; ambience: number; sfx: number; duck: number };
  requiresGesture: boolean;
};

const LOOKAHEAD_SECONDS = 0.65;
const SCHEDULER_INTERVAL_MS = 110;
const SILENCE = 0.0001;

function midiToFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

function seededNoise(index: number) {
  let value = (index + 1) * 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return (((value ^ (value >>> 14)) >>> 0) / 4294967296) * 2 - 1;
}

class JuiceAudio {
  private context: AudioContext | null = null;
  private buses: AudioBuses | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private visible = typeof document === "undefined" ? true : !document.hidden;
  private scene: AudioScene = "silent";
  private transport: Transport | null = null;
  private schedulerId: number | null = null;
  private schedulerGeneration = 0;
  private resumePosition = 0;
  private targetLevels = { master: 0, music: 0, ambience: 0, sfx: SCENE_PROFILES.silent.sfx };
  private sources: Record<BusName, Set<AudioScheduledSourceNode>> = {
    music: new Set(),
    ambience: new Set(),
    sfx: new Set(),
  };

  setMuted(muted: boolean) {
    if (this.muted === muted) return;
    this.muted = muted;

    if (muted) {
      this.applyMasterLevel(true);
      this.stopTransport(true);
      this.stopSources("sfx");
      void this.context?.suspend();
      return;
    }

    // The sound toggle itself is a user gesture, so resuming here respects
    // browser autoplay policy while making unmute feel immediate.
    void this.unlock();
  }

  setVisible(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible;
    if (!visible) {
      this.applyMasterLevel(true);
      this.stopTransport(true);
      this.stopSources("sfx");
      void this.context?.suspend();
    }
    // Becoming visible never resumes audio by itself. The next pointer/key
    // gesture calls unlock(), preventing a hidden tab from reviving sound.
  }

  setScene(nextScene: AudioScene) {
    if (this.scene === nextScene) return;
    const previousScene = this.scene;
    this.scene = nextScene;

    if (!this.context || !this.buses) return;
    this.applySceneMix();

    if (shouldPreserveGameplayTransport(previousScene, nextScene)) return;

    this.stopTransport(false);
    if (this.canRun()) this.startSceneTransport();
  }

  async unlock() {
    if (!this.context || this.context.state === "closed") this.createGraph();
    if (!this.context) return;
    if (this.muted || !this.visible) return;
    if (this.context.state === "suspended") await this.context.resume();
    this.applySceneMix();
    this.applyMasterLevel(true);
    if (!this.transport && this.scene !== "silent") this.startSceneTransport(this.resumePosition);
  }

  play(name: SoundName) {
    if (!this.context || !this.buses || !this.canRun()) return;
    const now = this.context.currentTime + 0.008;
    this.duckMusic(now, name === "order" || name === "finish" ? 0.72 : name === "wrong" ? 0.42 : 0.25);

    switch (name) {
      case "close":
        this.scheduleNoise(now, 0.06, 0.11, "sfx", "bandpass", 780, 2.8);
        this.scheduleGlide(now, 104, 72, 0.075, 0.07, "sfx", "sine");
        break;
      case "correct":
        this.scheduleMallet(72, now, 0.16, 0.16, "sfx");
        this.scheduleMallet(76, now + 0.055, 0.18, 0.13, "sfx");
        this.scheduleNoise(now + 0.018, 0.09, 0.055, "sfx", "bandpass", 2100, 1.3);
        break;
      case "wrong":
        this.scheduleGlide(now, 174, 116, 0.26, 0.13, "sfx", "triangle");
        this.scheduleGlide(now + 0.055, 146, 98, 0.22, 0.075, "sfx", "sine");
        this.scheduleNoise(now, 0.2, 0.09, "sfx", "lowpass", 620, 0.8);
        break;
      case "order":
        this.scheduleChrome(now, 0.52, 0.23, "sfx", 84);
        [67, 72, 76].forEach((note, index) => this.scheduleMallet(note, now + 0.06 + index * 0.055, 0.34, 0.12, "sfx"));
        this.scheduleNoise(now + 0.04, 0.32, 0.065, "sfx", "bandpass", 2800, 1.1);
        break;
      case "power":
        this.scheduleNoise(now, 0.48, 0.11, "sfx", "highpass", 1700, 1.2, true);
        [72, 76, 79, 84].forEach((note, index) => this.scheduleMallet(note, now + index * 0.07, 0.3, 0.1, "sfx"));
        this.scheduleChrome(now + 0.19, 0.58, 0.14, "sfx", 91);
        break;
      case "tick":
        this.scheduleWoodblock(now, 0.16);
        break;
      case "start":
        [60, 64, 67, 72].forEach((note, index) => this.scheduleMallet(note, now + index * 0.075, 0.42, 0.14, "sfx"));
        this.scheduleChrome(now + 0.24, 0.48, 0.14, "sfx", 84);
        break;
      case "finish":
        [76, 72, 69, 67].forEach((note, index) => this.scheduleMallet(note, now + index * 0.105, 0.42, 0.13, "sfx"));
        [60, 64, 67].forEach((note) => this.scheduleOrganNote(note, now + 0.38, 1.15, 0.045, "sfx"));
        this.scheduleChrome(now + 0.34, 0.72, 0.18, "sfx", 84);
        break;
    }
  }

  getDiagnostics(): AudioDiagnostics {
    const context = this.context;
    const transportOffset = context && this.transport ? context.currentTime - this.transport.anchor : null;
    const transportSeconds = transportOffset === null
      ? null
      : transportOffset < 0
        ? 0
        : normalizeLoopPosition(transportOffset, this.transport!.score);
    return {
      scene: this.scene,
      muted: this.muted,
      visible: this.visible,
      contextState: context?.state ?? "uninitialized",
      schedulerActive: this.schedulerId !== null,
      schedulerGeneration: this.schedulerGeneration,
      transport: this.transport?.score.name ?? null,
      transportSeconds,
      scheduledSources: {
        music: this.sources.music.size,
        ambience: this.sources.ambience.size,
        sfx: this.sources.sfx.size,
      },
      busLevels: {
        master: this.targetLevels.master,
        music: this.targetLevels.music,
        ambience: this.targetLevels.ambience,
        sfx: this.targetLevels.sfx,
        duck: this.buses?.musicDuck.gain.value ?? 1,
      },
      requiresGesture: Boolean(context && context.state === "suspended" && !this.muted && this.visible && this.scene !== "silent"),
    };
  }

  dispose() {
    this.scene = "silent";
    this.applyMasterLevel(true);
    this.stopTransport(false);
    this.stopSources("sfx");
    void this.context?.close();
    this.context = null;
    this.buses = null;
    this.noiseBuffer = null;
    this.targetLevels = { master: 0, music: 0, ambience: 0, sfx: SCENE_PROFILES.silent.sfx };
  }

  private canRun() {
    return Boolean(this.context && this.context.state === "running" && !this.muted && this.visible && this.scene !== "silent");
  }

  private createGraph() {
    const context = new AudioContext();
    const master = context.createGain();
    const music = context.createGain();
    const musicDuck = context.createGain();
    const ambience = context.createGain();
    const sfx = context.createGain();
    const limiter = context.createDynamicsCompressor();

    master.gain.value = 0;
    musicDuck.gain.value = 1;
    limiter.threshold.value = -13;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.19;

    music.connect(musicDuck).connect(master);
    ambience.connect(master);
    sfx.connect(master);
    master.connect(limiter).connect(context.destination);

    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = seededNoise(index);

    this.context = context;
    this.buses = { master, music, musicDuck, ambience, sfx, limiter };
    this.noiseBuffer = buffer;
    this.applySceneMix(true);
  }

  private applyMasterLevel(immediate = false) {
    if (!this.context || !this.buses) return;
    const now = this.context.currentTime;
    const level = this.canRun() ? MASTER_LEVEL : 0;
    this.targetLevels.master = level;
    this.buses.master.gain.cancelScheduledValues(now);
    if (immediate) this.buses.master.gain.setValueAtTime(level, now);
    else this.buses.master.gain.setTargetAtTime(level, now, 0.025);
  }

  private applySceneMix(immediate = false) {
    if (!this.context || !this.buses) return;
    const now = this.context.currentTime;
    const profile = SCENE_PROFILES[this.scene];
    this.targetLevels.music = profile.music;
    this.targetLevels.ambience = profile.ambience;
    this.targetLevels.sfx = profile.sfx;
    const entries: [GainNode, number][] = [
      [this.buses.music, profile.music],
      [this.buses.ambience, profile.ambience],
      [this.buses.sfx, profile.sfx],
    ];
    entries.forEach(([node, value]) => {
      node.gain.cancelScheduledValues(now);
      if (immediate) node.gain.setValueAtTime(value, now);
      else node.gain.setTargetAtTime(value, now, 0.045);
    });
    this.applyMasterLevel(immediate);
  }

  private startSceneTransport(position = 0) {
    const transportName = SCENE_PROFILES[this.scene].transport;
    if (!transportName || !this.context || !this.canRun()) return;
    const score = SCORES[transportName];
    const duration = scoreDurationSeconds(score);
    const loopPosition = normalizeLoopPosition(position, score);
    const secondsPerBeat = 60 / score.bpm;
    let eventIndex = score.events.findIndex((scoreEvent) => scoreEvent.beat * secondsPerBeat >= loopPosition - 0.002);
    let cycle = 0;
    if (eventIndex < 0) {
      eventIndex = 0;
      cycle = 1;
    }
    this.resumePosition = 0;
    this.transport = {
      score,
      anchor: this.context.currentTime + 0.055 - loopPosition,
      eventIndex,
      cycle,
    };
    this.schedulerGeneration += 1;
    const generation = this.schedulerGeneration;
    this.scheduleTransport(generation);
    this.schedulerId = window.setInterval(() => this.scheduleTransport(generation), SCHEDULER_INTERVAL_MS);

    // Keep the anchor in the current loop. This also bounds floating point
    // growth if a quiet tutorial/results screen is left open for hours.
    if (loopPosition >= duration) this.transport.anchor += duration;
  }

  private scheduleTransport(generation: number) {
    if (generation !== this.schedulerGeneration || !this.context || !this.transport || !this.canRun()) return;
    const horizon = this.context.currentTime + LOOKAHEAD_SECONDS;
    const { score } = this.transport;
    const secondsPerBeat = 60 / score.bpm;
    const duration = scoreDurationSeconds(score);
    let safety = 0;

    while (safety < 256) {
      const scoreEvent = score.events[this.transport.eventIndex];
      const at = this.transport.anchor + this.transport.cycle * duration + scoreEvent.beat * secondsPerBeat;
      if (at > horizon) break;
      if (at >= this.context.currentTime - 0.025) this.scheduleScoreEvent(scoreEvent, Math.max(at, this.context.currentTime + 0.002), secondsPerBeat);
      this.transport.eventIndex += 1;
      if (this.transport.eventIndex >= score.events.length) {
        this.transport.eventIndex = 0;
        this.transport.cycle += 1;
      }
      safety += 1;
    }
  }

  private stopTransport(preservePosition: boolean) {
    if (this.context && this.transport && preservePosition) {
      this.resumePosition = normalizeLoopPosition(this.context.currentTime - this.transport.anchor, this.transport.score);
    } else if (!preservePosition) {
      this.resumePosition = 0;
    }
    if (this.schedulerId !== null) window.clearInterval(this.schedulerId);
    this.schedulerId = null;
    this.schedulerGeneration += 1;
    this.transport = null;
    this.stopSources("music");
    this.stopSources("ambience");
  }

  private scheduleScoreEvent(scoreEvent: ScoreEvent, at: number, secondsPerBeat: number) {
    const duration = Math.max(0.04, scoreEvent.duration * secondsPerBeat);
    const notes = scoreEvent.notes ?? (scoreEvent.note === undefined ? [] : [scoreEvent.note]);
    switch (scoreEvent.voice) {
      case "keys":
        notes.forEach((note) => this.scheduleMallet(note, at, duration, scoreEvent.velocity / Math.sqrt(notes.length), "music"));
        break;
      case "organ":
        notes.forEach((note) => this.scheduleOrganNote(note, at, duration, scoreEvent.velocity / Math.sqrt(notes.length), "music"));
        break;
      case "bass":
        if (scoreEvent.note !== undefined) this.scheduleBass(scoreEvent.note, at, duration, scoreEvent.velocity);
        break;
      case "kick":
        this.scheduleKick(at, scoreEvent.velocity);
        break;
      case "brush":
        this.scheduleNoise(at, duration, scoreEvent.velocity * 0.12, "music", "bandpass", 1050, 0.75);
        break;
      case "shaker":
        this.scheduleNoise(at, duration, scoreEvent.velocity * 0.1, "music", "highpass", 5100, 0.65);
        break;
      case "fizz":
        this.scheduleNoise(at, duration, scoreEvent.velocity * 0.16, "ambience", "highpass", 2600, 1.2, true);
        break;
      case "chrome":
        this.scheduleChrome(at, duration, scoreEvent.velocity * 0.38, "ambience", scoreEvent.note ?? 84);
        break;
    }
  }

  private bus(bus: BusName) {
    return this.buses?.[bus] ?? null;
  }

  private registerSource(source: AudioScheduledSourceNode, bus: BusName) {
    this.sources[bus].add(source);
    source.addEventListener("ended", () => this.sources[bus].delete(source), { once: true });
  }

  private stopSources(bus: BusName) {
    this.sources[bus].forEach((source) => {
      try {
        source.stop();
      } catch {
        // A source that ended between iteration and stop is already silent.
      }
    });
    this.sources[bus].clear();
  }

  private scheduleMallet(note: number, at: number, duration: number, volume: number, bus: BusName) {
    if (!this.context) return;
    const destination = this.bus(bus);
    if (!destination) return;
    const output = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3100, at);
    filter.frequency.exponentialRampToValueAtTime(880, at + Math.min(duration, 0.7));
    output.gain.setValueAtTime(SILENCE, at);
    output.gain.exponentialRampToValueAtTime(Math.max(SILENCE, volume), at + 0.012);
    output.gain.exponentialRampToValueAtTime(SILENCE, at + duration);
    filter.connect(output).connect(destination);

    [
      { type: "sine" as OscillatorType, ratio: 1, level: 1 },
      { type: "triangle" as OscillatorType, ratio: 2, level: 0.16 },
    ].forEach((partial) => {
      const oscillator = this.context!.createOscillator();
      const partialGain = this.context!.createGain();
      oscillator.type = partial.type;
      oscillator.frequency.value = midiToFrequency(note) * partial.ratio;
      oscillator.detune.value = partial.ratio === 1 ? -3 : 4;
      partialGain.gain.value = partial.level;
      oscillator.connect(partialGain).connect(filter);
      this.registerSource(oscillator, bus);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.03);
    });
  }

  private scheduleOrganNote(note: number, at: number, duration: number, volume: number, bus: BusName) {
    if (!this.context) return;
    const destination = this.bus(bus);
    if (!destination) return;
    const output = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1500;
    output.gain.setValueAtTime(SILENCE, at);
    output.gain.linearRampToValueAtTime(Math.max(SILENCE, volume), at + Math.min(0.12, duration * 0.25));
    output.gain.setValueAtTime(Math.max(SILENCE, volume * 0.82), at + Math.max(0.13, duration - 0.16));
    output.gain.exponentialRampToValueAtTime(SILENCE, at + duration);
    filter.connect(output).connect(destination);
    [1, 2, 3].forEach((ratio, index) => {
      const oscillator = this.context!.createOscillator();
      const partialGain = this.context!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = midiToFrequency(note) * ratio;
      partialGain.gain.value = [1, 0.24, 0.08][index];
      oscillator.connect(partialGain).connect(filter);
      this.registerSource(oscillator, bus);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.025);
    });
  }

  private scheduleBass(note: number, at: number, duration: number, velocity: number) {
    if (!this.context || !this.buses) return;
    const oscillator = this.context.createOscillator();
    const sub = this.context.createOscillator();
    const subGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const output = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = midiToFrequency(note);
    sub.type = "sine";
    sub.frequency.value = midiToFrequency(note - 12);
    subGain.gain.value = 0.34;
    filter.type = "lowpass";
    filter.Q.value = 2.1;
    filter.frequency.setValueAtTime(720, at);
    filter.frequency.exponentialRampToValueAtTime(170, at + duration);
    output.gain.setValueAtTime(SILENCE, at);
    output.gain.exponentialRampToValueAtTime(Math.max(SILENCE, velocity * 0.17), at + 0.014);
    output.gain.exponentialRampToValueAtTime(SILENCE, at + duration);
    oscillator.connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(output).connect(this.buses.music);
    [oscillator, sub].forEach((source) => {
      this.registerSource(source, "music");
      source.start(at);
      source.stop(at + duration + 0.025);
    });
  }

  private scheduleKick(at: number, velocity: number) {
    if (!this.context || !this.buses) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(92, at);
    oscillator.frequency.exponentialRampToValueAtTime(43, at + 0.13);
    gain.gain.setValueAtTime(Math.max(SILENCE, velocity * 0.2), at);
    gain.gain.exponentialRampToValueAtTime(SILENCE, at + 0.16);
    oscillator.connect(gain).connect(this.buses.music);
    this.registerSource(oscillator, "music");
    oscillator.start(at);
    oscillator.stop(at + 0.18);
  }

  private scheduleWoodblock(at: number, volume: number) {
    this.scheduleGlide(at, 510, 430, 0.09, volume, "sfx", "triangle");
    this.scheduleGlide(at + 0.012, 765, 630, 0.07, volume * 0.48, "sfx", "sine");
  }

  private scheduleGlide(
    at: number,
    from: number,
    to: number,
    duration: number,
    volume: number,
    bus: BusName,
    type: OscillatorType,
  ) {
    if (!this.context) return;
    const destination = this.bus(bus);
    if (!destination) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    gain.gain.setValueAtTime(SILENCE, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, volume), at + Math.min(0.008, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(SILENCE, at + duration);
    oscillator.connect(gain).connect(destination);
    this.registerSource(oscillator, bus);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.015);
  }

  private scheduleChrome(at: number, duration: number, volume: number, bus: BusName, note: number) {
    if (!this.context) return;
    const destination = this.bus(bus);
    if (!destination) return;
    const output = this.context.createGain();
    output.gain.setValueAtTime(SILENCE, at);
    output.gain.exponentialRampToValueAtTime(Math.max(SILENCE, volume), at + 0.006);
    output.gain.exponentialRampToValueAtTime(SILENCE, at + duration);
    output.connect(destination);
    [1, 2.63, 4.17].forEach((ratio, index) => {
      const oscillator = this.context!.createOscillator();
      const partialGain = this.context!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = midiToFrequency(note) * ratio;
      partialGain.gain.value = [1, 0.28, 0.11][index];
      oscillator.connect(partialGain).connect(output);
      this.registerSource(oscillator, bus);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);
    });
  }

  private scheduleNoise(
    at: number,
    duration: number,
    volume: number,
    bus: BusName,
    filterType: BiquadFilterType,
    frequency: number,
    q: number,
    rising = false,
  ) {
    if (!this.context || !this.noiseBuffer) return;
    const destination = this.bus(bus);
    if (!destination) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(rising ? Math.max(180, frequency * 0.45) : frequency, at);
    if (rising) filter.frequency.exponentialRampToValueAtTime(frequency, at + duration);
    gain.gain.setValueAtTime(SILENCE, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, volume), at + Math.min(0.028, duration * 0.35));
    gain.gain.exponentialRampToValueAtTime(SILENCE, at + duration);
    source.connect(filter).connect(gain).connect(destination);
    this.registerSource(source, bus);
    source.start(at, (Math.floor(at * 997) % 1300) / 1000);
    source.stop(at + duration + 0.01);
  }

  private duckMusic(at: number, duration: number) {
    if (!this.buses) return;
    const duck = this.buses.musicDuck.gain;
    duck.cancelScheduledValues(at);
    duck.setValueAtTime(Math.min(duck.value, 0.56), at);
    duck.linearRampToValueAtTime(1, at + duration);
  }
}

export const juiceAudio = new JuiceAudio();

if (typeof window !== "undefined" && import.meta.env.DEV) {
  const debugWindow = window as typeof window & { __JUICERS_AUDIO__?: { getDiagnostics: () => AudioDiagnostics } };
  debugWindow.__JUICERS_AUDIO__ = juiceAudio;
  import.meta.hot?.dispose(() => {
    if (debugWindow.__JUICERS_AUDIO__ === juiceAudio) delete debugWindow.__JUICERS_AUDIO__;
    juiceAudio.dispose();
  });
}
