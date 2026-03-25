// ---------------------------------------------------------------------------
// MusicEngine — Tone.js synthesis and playback layer.
//
// Responsibilities:
//   - Create and configure the audio graph (synth → filter → reverb → limiter)
//   - Translate MusicPhrase notes into Tone.Transport-scheduled events
//   - Expose setPreset() so callers can swap instrument configs
//   - Handle browser audio context unlock (requires user gesture)
//
// The MusicEngine is intentionally dumb about what to play and when to
// generate — that's the Scheduler's job. We just play what we're told.
// ---------------------------------------------------------------------------

import * as Tone from 'tone';
import type { InstrumentConfig, MusicNote, MusicPhrase } from '../types';

// IDs of all scheduled Tone.Transport events, so we can cancel them on stop.
const scheduledEventIds: number[] = [];

function trackEvent(id: number): number {
  scheduledEventIds.push(id);
  return id;
}

function clearTrackedEvents(): void {
  for (const id of scheduledEventIds) {
    Tone.getTransport().clear(id);
  }
  scheduledEventIds.length = 0;
}

// ---------------------------------------------------------------------------
// Frequency helper
// ---------------------------------------------------------------------------
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// MusicEngine
// ---------------------------------------------------------------------------
export class MusicEngine {
  private synth: Tone.PolySynth | null = null;
  private filter: Tone.Filter | null = null;
  private reverb: Tone.Reverb | null = null;
  private limiter: Tone.Limiter | null = null;
  private analyser: Tone.Analyser | null = null;
  private _isInitialized = false;
  private currentConfig: InstrumentConfig | null = null;

  get isInitialized(): boolean { return this._isInitialized; }

  /**
   * Build the audio graph. Must be called from a user-gesture handler
   * (click / keydown) so the browser allows audio context to start.
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    await Tone.start();

    // Build signal chain: PolySynth → Filter → Reverb → Limiter → Analyser → Destination
    this.limiter = new Tone.Limiter(-3).toDestination();
    this.analyser = new Tone.Analyser('waveform', 128);
    this.analyser.connect(this.limiter);

    this.reverb = new Tone.Reverb({ decay: 3.5, wet: 0.35 });
    await this.reverb.ready;
    this.reverb.connect(this.analyser);

    this.filter = new Tone.Filter({ type: 'lowpass', frequency: 3000, Q: 0.7 });
    this.filter.connect(this.reverb);

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.05, decay: 0.4, sustain: 0.3, release: 1.2 },
    });
    this.synth.connect(this.filter);

    this._isInitialized = true;
  }

  /** Reconfigure the synth + effects for the given instrument config. */
  applyConfig(config: InstrumentConfig): void {
    if (!this._isInitialized) return;
    this.currentConfig = config;

    this.synth!.set({
      oscillator: { type: config.oscillatorType as OscillatorType },
      envelope: {
        attack: config.attack,
        decay: config.decay,
        sustain: config.sustain,
        release: config.release,
      },
      detune: config.detuneAmount,
    });

    this.filter!.set({ frequency: config.filterFreq, Q: config.filterQ });
    this.reverb!.set({ wet: config.reverbWet });
  }

  /**
   * Schedule a MusicPhrase to start playing at `transportStartSeconds`
   * on the Tone.Transport timeline.
   *
   * Harmonic layers from the preset config (harmonics array) are also
   * scheduled, one octave / fifth / etc. above each root note.
   */
  schedulePhrase(phrase: MusicPhrase, transportStartSeconds: number): void {
    if (!this._isInitialized || !this.synth) return;
    const harmonics = this.currentConfig?.harmonics ?? [];

    for (const note of phrase.notes) {
      this.scheduleNote(note, transportStartSeconds, harmonics);
    }
  }

  private scheduleNote(
    note: MusicNote,
    transportStart: number,
    harmonics: number[],
  ): void {
    const noteStart = transportStart + note.startTime;
    const noteDuration = note.endTime - note.startTime;
    const velocity = note.velocity / 127;
    const freqs = [
      midiToFreq(note.pitch),
      ...harmonics.map((h) => midiToFreq(note.pitch + h)),
    ];

    const id = Tone.getTransport().schedule((time) => {
      if (!this.synth) return;
      for (const freq of freqs) {
        this.synth.triggerAttackRelease(freq, noteDuration, time, velocity);
      }
    }, noteStart);

    trackEvent(id);
  }

  /** Get waveform data for the visualizer (returns Float32Array of -1..1). */
  getWaveform(): Float32Array {
    if (!this.analyser) return new Float32Array(128);
    return this.analyser.getValue() as Float32Array;
  }

  /** Cancel all pending scheduled events (does NOT stop transport). */
  cancelScheduled(): void {
    clearTrackedEvents();
  }

  /** Set master volume, 0–1. */
  setVolume(vol: number): void {
    Tone.getDestination().volume.value = Tone.gainToDb(Math.max(0.001, vol));
  }

  dispose(): void {
    clearTrackedEvents();
    this.synth?.dispose();
    this.filter?.dispose();
    this.reverb?.dispose();
    this.limiter?.dispose();
    this.analyser?.dispose();
    this._isInitialized = false;
  }
}
