import type { Settings } from './storage';

/** Only synthetic tones. One context per app; every voice disconnects on end. */
export class GameAudio {
  private context: AudioContext | null = null;
  private voices = new Set<OscillatorNode>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private beat = 0;
  private settings: Settings;
  constructor(settings: Settings) { this.settings = settings; }
  configure(settings: Settings): void { this.settings = settings; }
  async unlock(): Promise<void> {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Browsers without audio still support every game rule. */ }
  }
  private tone(frequency: number, duration: number, volume: number, type: OscillatorType = 'sine', slide = 1): void {
    const context = this.context;
    if (!context || context.state !== 'running' || volume <= 0) return;
    const oscillator = context.createOscillator(), gain = context.createGain(), now = context.currentTime;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(25, frequency * slide), now + duration);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume * .12, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(context.destination); this.voices.add(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(oscillator); };
    oscillator.start(now); oscillator.stop(now + duration + .02);
  }
  play(kind: 'select' | 'skill' | 'ultimate' | 'hurt' | 'upgrade' | 'result' | 'kill'): void {
    const volume = this.settings.sound;
    const frequencies = { select: 540, skill: 240, ultimate: 110, hurt: 95, upgrade: 660, result: 440, kill: 320 };
    this.tone(frequencies[kind], kind === 'ultimate' ? .7 : .16, volume * (kind === 'kill' ? .3 : 1), kind === 'hurt' ? 'triangle' : 'sine', kind === 'hurt' ? .45 : 1.8);
  }
  startMusic(): void {
    if (this.timer || !this.context) return;
    const notes = [130.81, 164.81, 196, 164.81, 146.83, 174.61, 220, 196];
    this.timer = setInterval(() => { this.tone(notes[this.beat++ % notes.length], .65, this.settings.music * .5); }, 440);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer); this.timer = null;
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } }
  }
  destroy(): void { this.stop(); void this.context?.close(); this.context = null; }
}
