// ---------------------------------------------------------------------------
// MagentaGenerator — wraps @magenta/music MusicRNN for AI-driven continuation.
//
// Loaded asynchronously; the GenerationEngine falls back to the algorithmic
// generator until this is ready. This file uses dynamic import so the
// TF.js/Magenta bundle is split into a separate chunk.
//
// Checkpoint: music_rnn/basic_rnn (~3.6 MB from Google's Magenta CDN).
// The basic_rnn is the smallest reliable checkpoint — good for MVP latency.
// ---------------------------------------------------------------------------

import type { MusicNote, MusicPhrase, PlaybackOptions, Preset } from '../types';

const CHECKPOINT_URL =
  'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn';

const STEPS_PER_QUARTER = 4; // 16th-note resolution

// Lazy-loaded Magenta module (split chunk)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MagentaModule = any;
let mm: MagentaModule = null;

// ---------------------------------------------------------------------------
// Conversions between our MusicNote format and Magenta's INoteSequence
// ---------------------------------------------------------------------------

function toNoteSequence(phrase: MusicPhrase, tempo: number) {
  return {
    notes: phrase.notes.map((n) => ({
      pitch: n.pitch,
      startTime: n.startTime,
      endTime: n.endTime,
      velocity: n.velocity,
    })),
    totalTime: phrase.duration,
    tempos: [{ qpm: tempo, time: 0 }],
  };
}

function fromNoteSequence(seq: { notes?: Array<{ pitch?: number; startTime?: number; endTime?: number; velocity?: number }>; totalTime?: number }, tempo: number): MusicPhrase {
  const notes: MusicNote[] = (seq.notes ?? []).map((n) => ({
    pitch: n.pitch ?? 60,
    startTime: n.startTime ?? 0,
    endTime: n.endTime ?? 0.5,
    velocity: n.velocity ?? 64,
  }));
  return {
    notes,
    duration: seq.totalTime ?? notes.at(-1)?.endTime ?? 4,
    tempo,
  };
}

// ---------------------------------------------------------------------------
// MagentaGenerator class
// ---------------------------------------------------------------------------
export class MagentaGenerator {
  private rnn: MagentaModule = null;
  private _isReady = false;
  private _initError: string | null = null;

  get isReady(): boolean { return this._isReady; }
  get initError(): string | null { return this._initError; }

  /**
   * Dynamically load @magenta/music and initialise the RNN checkpoint.
   * Resolves whether or not initialization succeeded (errors are soft).
   */
  async initialize(onProgress?: (msg: string) => void): Promise<void> {
    try {
      onProgress?.('Loading Magenta.js…');
      mm = await import('@magenta/music');
      onProgress?.('Downloading model checkpoint…');
      this.rnn = new mm.MusicRNN(CHECKPOINT_URL);
      await this.rnn.initialize();
      this._isReady = true;
      onProgress?.('Magenta ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._initError = msg;
      console.warn('[MagentaGenerator] Failed to initialize:', msg);
      // Non-fatal — caller falls back to algorithmic generator
    }
  }

  /**
   * Continue a musical phrase using MusicRNN.
   *
   * @param prevPhrase  - The last generated phrase (used as primer)
   * @param preset      - The active preset (for tempo context)
   * @param options     - Current playback options
   * @returns A new MusicPhrase, or null if generation failed
   */
  async generate(
    prevPhrase: MusicPhrase,
    _preset: Preset,
    options: PlaybackOptions,
  ): Promise<MusicPhrase | null> {
    if (!this._isReady || !this.rnn) return null;

    try {
      const tempo = options.tempo;
      // Temperature: 0.8 at low complexity, 1.2 at high (more variation)
      const temperature = 0.8 + options.complexity * 0.4;

      const primerSeq = toNoteSequence(prevPhrase, tempo);

      // Quantize the primer before passing to the RNN
      const quantized = mm.sequences.quantizeNoteSequence(
        primerSeq,
        STEPS_PER_QUARTER,
      );

      // 32 steps = 2 bars at 4 steps/quarter; scale with energy
      const stepsToGenerate = options.energy < 0.4 ? 16 : options.energy < 0.75 ? 32 : 48;

      const continuation = await this.rnn.continueSequence(
        quantized,
        stepsToGenerate,
        temperature,
      );

      if (!continuation?.notes?.length) return null;

      return fromNoteSequence(continuation, tempo);
    } catch (err) {
      console.warn('[MagentaGenerator] continueSequence failed:', err);
      return null;
    }
  }
}
