import type { Beat } from "../core/present";

type SoundName = Beat["sound"];

export class Mixer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.master || !this.context) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0.0001 : 0.2, now, 0.03);
  }

  resume(): void {
    const context = this.ensure();
    if (context.state === "suspended") void context.resume();
  }

  play(name: SoundName): void {
    if (this.muted || name === "none" || name === "tick") return;
    const context = this.ensure();
    if (context.state !== "running" || !this.master) return;
    if (name === "start") this.cue(196, 0.18, "triangle", 0.08);
    if (name === "step") this.cue(420, 0.05, "square", 0.025);
    if (name === "loot") {
      this.cue(660, 0.12, "sine", 0.05);
      this.cue(880, 0.16, "sine", 0.04, 0.06);
    }
    if (name === "hack") {
      this.cue(520, 0.08, "square", 0.03);
      this.cue(640, 0.08, "square", 0.03, 0.1);
      this.cue(780, 0.14, "triangle", 0.04, 0.2);
    }
    if (name === "side") this.cue(300, 0.12, "triangle", 0.04);
    if (name === "alarm") {
      this.cue(140, 0.18, "sawtooth", 0.03);
      this.cue(96, 0.28, "sine", 0.04, 0.16);
    }
    if (name === "vault") {
      this.cue(110, 0.4, "sine", 0.06);
      this.cue(220, 0.5, "triangle", 0.04, 0.12);
      this.cue(330, 0.7, "sine", 0.035, 0.28);
      this.cue(494, 0.8, "sine", 0.03, 0.45);
    }
    if (name === "end") {
      this.cue(392, 0.22, "triangle", 0.04);
      this.cue(523, 0.28, "sine", 0.035, 0.08);
    }
  }

  private ensure(): AudioContext {
    if (this.context && this.master) return this.context;
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = this.muted ? 0.0001 : 0.2;
    const bed = context.createOscillator();
    const bedGain = context.createGain();
    bed.type = "sine";
    bed.frequency.value = 72;
    bedGain.gain.value = 0.015;
    bed.connect(bedGain);
    bedGain.connect(master);
    master.connect(context.destination);
    bed.start();
    this.context = context;
    this.master = master;
    return context;
  }

  private cue(freq: number, duration: number, type: OscillatorType, peak: number, delay = 0): void {
    if (!this.context || !this.master) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const start = this.context.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}
