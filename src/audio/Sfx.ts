/**
 * Placeholder sound effects, synthesized with WebAudio (no audio files, no licensing).
 * Each effect is throttled so 20 rifles firing at once don't turn into noise.
 *
 * iOS only allows audio to start inside a user gesture, so call `unlock()` from a tap.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlayed = new Map<string, number>();
  private enabled = true;
  volume = 0.55;

  /** Must be called from a touch/click handler. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      // A gentle compressor keeps big battles from clipping.
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.volume : 0;
  }

  /** Pause/resume all audio (e.g. when the app goes to the background). */
  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  private ok(key: string, minGapMs: number): boolean {
    if (!this.ready || !this.enabled) return false;
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? 0) < minGapMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private burst(freq: number, q: number, dur: number, gain: number, pitchDrop = 0, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (pitchDrop) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq * pitchDrop), t + dur);
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(env).connect(this.master!);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0): void {
    const ctx = this.ctx!, t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  rifle(): void { if (this.ok('rifle', 45)) this.burst(1800, 0.9, 0.09, 0.45, 0.4); }
  launcher(): void { if (this.ok('launcher', 80)) { this.burst(400, 1, 0.15, 0.6, 0.5); this.tone('sine', 160, 60, 0.12, 0.3); } }
  explosion(): void { if (this.ok('explosion', 60)) { this.burst(220, 0.7, 0.5, 0.9, 0.3); this.tone('sine', 90, 35, 0.35, 0.5); } }
  squish(): void { if (this.ok('squish', 40)) this.burst(600, 2.5, 0.12, 0.35, 0.5); }
  shieldHit(): void { if (this.ok('shieldHit', 70)) this.tone('triangle', 900, 1400, 0.06, 0.08); }
  shieldBreak(): void { if (this.ok('shieldBreak', 60)) { this.tone('square', 1600, 200, 0.25, 0.12); this.burst(5000, 0.5, 0.2, 0.3, 0.3, 'highpass'); } }
  plasma(): void { if (this.ok('plasma', 70)) this.tone('sawtooth', 520, 140, 0.14, 0.1); }
  melee(): void { if (this.ok('melee', 70)) this.burst(900, 3, 0.07, 0.3, 0.6); }
  trooperDown(): void { if (this.ok('trooperDown', 120)) this.tone('triangle', 300, 120, 0.25, 0.18); }
  roar(): void { if (this.ok('roar', 200)) { this.burst(160, 1.5, 0.6, 0.6, 0.6, 'lowpass'); this.tone('sawtooth', 110, 70, 0.6, 0.15); } }
  alarm(): void { if (this.ok('alarm', 400)) { this.tone('square', 660, 660, 0.12, 0.12); this.tone('square', 440, 440, 0.15, 0.12, 0.14); } }
  coin(): void { if (this.ok('coin', 50)) this.tone('square', 1300, 1700, 0.05, 0.04); }
  place(): void { if (this.ok('place', 50)) { this.burst(300, 1, 0.12, 0.5, 0.5, 'lowpass'); this.tone('sine', 220, 110, 0.12, 0.25); } }
  upgrade(): void { if (this.ok('upgrade', 80)) { this.tone('square', 440, 440, 0.08, 0.1); this.tone('square', 660, 660, 0.08, 0.1, 0.08); this.tone('square', 880, 880, 0.12, 0.1, 0.16); } }
  sell(): void { if (this.ok('sell', 80)) { this.tone('square', 880, 880, 0.06, 0.08); this.tone('square', 660, 660, 0.1, 0.08, 0.07); } }
  error(): void { if (this.ok('error', 150)) this.tone('square', 180, 140, 0.15, 0.12); }
  waveHorn(): void { if (this.ok('waveHorn', 500)) { this.tone('sawtooth', 147, 147, 0.7, 0.12); this.tone('sawtooth', 220, 220, 0.7, 0.08, 0.05); } }
  cleared(): void { if (this.ok('cleared', 300)) { this.tone('triangle', 523, 523, 0.12, 0.15); this.tone('triangle', 784, 784, 0.25, 0.15, 0.12); } }
  victory(): void { if (this.ok('victory', 1000)) [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.35, 0.18, i * 0.15)); }
  defeat(): void { if (this.ok('defeat', 1000)) [392, 330, 262, 196].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.4, 0.1, i * 0.22)); }

  sniper(): void { if (this.ok('sniper', 90)) { this.burst(900, 0.6, 0.28, 0.75, 0.25); this.tone('sine', 120, 50, 0.2, 0.25); } }
  turret(): void { if (this.ok('turret', 60)) this.burst(2400, 1.2, 0.06, 0.3, 0.5); }
  rocket(): void { if (this.ok('rocket', 90)) { this.burst(700, 0.6, 0.45, 0.55, 0.2, 'lowpass'); this.tone('sawtooth', 220, 90, 0.3, 0.06); } }
  flame(): void { if (this.ok('flame', 150)) this.burst(500, 0.4, 0.6, 0.5, 0.6, 'lowpass'); }
  promote(): void { if (this.ok('promote', 200)) { this.tone('triangle', 660, 660, 0.1, 0.12); this.tone('triangle', 990, 990, 0.18, 0.12, 0.1); } }

  casing(): void { if (this.ok('casing', 70)) this.tone('triangle', 3200 + Math.random() * 1200, 2600, 0.05, 0.025); }
  gatling(): void { if (this.ok('gatling', 35)) this.burst(1500, 1.1, 0.06, 0.35, 0.5); }
  shotgun(): void { if (this.ok('shotgun', 60)) { this.burst(900, 0.7, 0.18, 0.6, 0.35); } }

  click(): void { if (this.ok('click', 30)) this.tone('square', 880, 440, 0.08, 0.12); }
}

export const sfx = new Sfx();
