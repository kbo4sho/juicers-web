export type SoundName = "start" | "tick" | "correct" | "order" | "wrong" | "power" | "finish" | "close";

class JuiceAudio {
  private context: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 0.18, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
      }
      this.noiseBuffer = buffer;
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  play(name: SoundName) {
    if (this.muted || !this.context) return;
    const now = this.context.currentTime;
    if (name === "correct") {
      this.tone(330, 620, now, 0.13, "sine", 0.12);
      this.tone(660, 910, now + 0.06, 0.1, "triangle", 0.08);
      this.noise(now, 0.05, 0.045);
    } else if (name === "order") {
      [523, 659, 784, 1047].forEach((frequency, index) =>
        this.tone(frequency, frequency * 1.08, now + index * 0.065, 0.2, index % 2 ? "sine" : "triangle", 0.09),
      );
      this.noise(now + 0.08, 0.18, 0.065);
    } else if (name === "wrong") {
      this.tone(170, 92, now, 0.24, "sawtooth", 0.09);
      this.noise(now, 0.16, 0.08);
    } else if (name === "power") {
      [392, 523, 659, 784].forEach((frequency, index) =>
        this.tone(frequency, frequency * 1.05, now + index * 0.055, 0.13, "triangle", 0.07),
      );
      this.noise(now, 0.12, 0.05);
    } else if (name === "tick") {
      this.tone(245, 245, now, 0.08, "square", 0.035);
    } else if (name === "start") {
      this.tone(220, 440, now, 0.3, "triangle", 0.09);
      this.tone(440, 880, now + 0.1, 0.28, "sine", 0.08);
    } else if (name === "finish") {
      [659, 523, 392, 784].forEach((frequency, index) =>
        this.tone(frequency, frequency, now + index * 0.12, 0.14, "triangle", 0.075),
      );
    } else {
      this.tone(110, 75, now, 0.07, "sine", 0.025);
    }
  }

  private tone(
    startFrequency: number,
    endFrequency: number,
    at: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ) {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private noise(at: number, duration: number, volume: number) {
    if (!this.context || !this.noiseBuffer) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 1250;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(this.context.destination);
    source.start(at);
    source.stop(at + duration);
  }
}

export const juiceAudio = new JuiceAudio();
