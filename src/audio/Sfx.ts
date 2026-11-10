/**
 * Placeholder sound effects, synthesized with WebAudio (no audio files, no licensing).
 * In M1 this moves behind the asset manifest so real sound files can replace any effect.
 *
 * iOS only allows audio to start inside a user gesture, so call `unlock()` from a tap.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlayed = new Map<string, number>();
  volume = 0.6;

  /** Must be called from a touch/click handler. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // One shared second of white noise, reused by every gunshot/explosion (no per-shot allocation).
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Avoid ear-splitting stacks when many units fire on the same frame. */
  private throttle(key: string, minGapMs: number): boolean {
    const now = performance.now();
    const last = this.lastPlayed.get(key) ?? 0;
    if (now - last < minGapMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private burst(freq: number, q: number, dur: number, gain: number, pitchDrop = 0): void {
    if (!this.ctx || !this.master || !this.noise || !this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t);
    if (pitchDrop) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq * pitchDrop), t + dur);
    filter.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  rifle(): void {
    if (this.throttle('rifle', 45)) this.burst(1800, 0.9, 0.09, 0.5, 0.4);
  }

  explosion(): void {
    if (this.throttle('explosion', 60)) this.burst(220, 0.7, 0.45, 0.9, 0.3);
  }

  squish(): void {
    if (this.throttle('squish', 40)) this.burst(600, 2.5, 0.12, 0.35, 0.5);
  }

  click(): void {
    if (!this.ctx || !this.master || !this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.08);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.15, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.12);
  }
}

export const sfx = new Sfx();
