// ---------------------------------------------------------------------------
// Scheduler — the endless generation loop.
//
// How the endless loop works
// --------------------------
// The Scheduler maintains a "buffer window": a lookahead of pre-generated
// musical content that's been scheduled on the Tone.Transport but hasn't
// played yet.
//
//  Timeline (seconds from Transport start):
//
//    0──────[playing]──────[scheduled / buffered]──────► future
//                         ↑                      ↑
//                    currentTime            bufferEndSeconds
//
// Every POLL_INTERVAL seconds (via Transport.scheduleRepeat), the loop checks:
//
//   remaining = bufferEndSeconds - currentTime
//
//   if remaining < LOOKAHEAD_SECONDS AND we're not already generating:
//     1. Call GenerationEngine.generateNext(preset, options, lastPhrase)
//     2. Call MusicEngine.schedulePhrase(result, bufferEndSeconds)
//     3. bufferEndSeconds += result.duration
//     4. lastPhrase = result
//
// This ensures there's always several seconds of music ready to play.
// If generation is slow, the buffer drains. If it drains to zero the
// transport keeps ticking but the synth is silent — we call this "buffering".
// The status indicator surfaces this so the user knows what's happening.
// ---------------------------------------------------------------------------

import * as Tone from 'tone';
import type { AppStatus, MusicPhrase, PlaybackOptions, Preset } from '../types';
import type { GenerationEngine } from './GenerationEngine';
import type { MusicEngine } from './MusicEngine';

/** Seconds of audio to keep buffered ahead of playback. */
const LOOKAHEAD_SECONDS = 10;

/** How often (seconds of transport time) to check the buffer. */
const POLL_INTERVAL = 0.5;

/** Number of phrases to pre-generate before playback starts. */
const INITIAL_PHRASES = 2;

export type StatusCallback = (status: AppStatus) => void;

export class Scheduler {
  private musicEngine: MusicEngine;
  private generationEngine: GenerationEngine;

  // Transport seconds at which the last buffered phrase ends
  private bufferEndSeconds = 0;

  // The most recently generated phrase (seed for the next generation)
  private lastPhrase: MusicPhrase | null = null;

  // Whether a generation call is currently in flight
  private isGenerating = false;

  // Tone.js event ID for the buffer-check loop
  private pollEventId: number | null = null;

  private onStatusChange: StatusCallback;
  private _status: AppStatus = 'idle';

  constructor(
    musicEngine: MusicEngine,
    generationEngine: GenerationEngine,
    onStatusChange: StatusCallback,
  ) {
    this.musicEngine = musicEngine;
    this.generationEngine = generationEngine;
    this.onStatusChange = onStatusChange;
  }

  private setStatus(s: AppStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.onStatusChange(s);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start endless playback.
   *
   * 1. Pre-generates INITIAL_PHRASES phrases so playback begins immediately.
   * 2. Starts the Tone.Transport.
   * 3. Starts the buffer-check polling loop.
   */
  async start(preset: Preset, options: PlaybackOptions): Promise<void> {
    this.setStatus('initializing');

    // Reset state
    this.bufferEndSeconds = 0;
    this.lastPhrase = null;
    this.isGenerating = false;
    this.generationEngine.reset();
    this.musicEngine.cancelScheduled();
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;

    // Apply instrument config from preset
    this.musicEngine.applyConfig(preset.instrument);
    this.musicEngine.setVolume(options.volume);

    // Pre-generate initial phrases so transport starts with music ready
    this.setStatus('generating');
    for (let i = 0; i < INITIAL_PHRASES; i++) {
      await this.generateAndScheduleNext(preset, options);
    }

    // Start transport and begin polling
    Tone.getTransport().bpm.value = options.tempo;
    Tone.getTransport().start();
    this.startPollLoop(preset, options);
    this.setStatus('playing');
  }

  /** Pause playback (preserves buffer). */
  pause(): void {
    Tone.getTransport().pause();
    this.setStatus('paused');
  }

  /** Resume from pause. */
  resume(): void {
    Tone.getTransport().start();
    this.setStatus('playing');
  }

  /** Stop completely and reset. */
  stop(): void {
    this.stopPollLoop();
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
    this.musicEngine.cancelScheduled();
    this.bufferEndSeconds = 0;
    this.lastPhrase = null;
    this.isGenerating = false;
    this.setStatus('idle');
  }

  /**
   * Update playback options while playing.
   * Tempo changes are applied to the transport immediately.
   * Volume changes are applied immediately.
   * Preset changes require a full restart (caller must call stop() + start()).
   */
  updateOptions(options: PlaybackOptions): void {
    Tone.getTransport().bpm.value = options.tempo;
    this.musicEngine.setVolume(options.volume);
  }

  // -------------------------------------------------------------------------
  // Internal loop
  // -------------------------------------------------------------------------

  private startPollLoop(preset: Preset, options: PlaybackOptions): void {
    this.stopPollLoop();

    this.pollEventId = Tone.getTransport().scheduleRepeat((_time) => {
      void this.checkBuffer(preset, options);
    }, POLL_INTERVAL);
  }

  private stopPollLoop(): void {
    if (this.pollEventId !== null) {
      Tone.getTransport().clear(this.pollEventId);
      this.pollEventId = null;
    }
  }

  /**
   * Buffer-check tick.
   * Runs every POLL_INTERVAL seconds (in transport time).
   */
  private async checkBuffer(preset: Preset, options: PlaybackOptions): Promise<void> {
    const currentSeconds = Tone.getTransport().seconds;
    const remaining = this.bufferEndSeconds - currentSeconds;

    if (remaining <= 0 && this.bufferEndSeconds > 0) {
      // Buffer ran out entirely — flag as buffering so UI shows it
      this.setStatus('buffering');
    }

    if (remaining < LOOKAHEAD_SECONDS && !this.isGenerating) {
      await this.generateAndScheduleNext(preset, options);
    }
  }

  private async generateAndScheduleNext(
    preset: Preset,
    options: PlaybackOptions,
  ): Promise<void> {
    if (this.isGenerating) return;
    this.isGenerating = true;

    const wasBuffering = this._status === 'buffering';
    if (!wasBuffering) this.setStatus('generating');

    try {
      const phrase = await this.generationEngine.generateNext(
        preset,
        options,
        this.lastPhrase,
      );

      // If transport was reset/stopped while we were generating, discard
      if (this._status === 'idle') return;

      this.musicEngine.schedulePhrase(phrase, this.bufferEndSeconds);
      this.bufferEndSeconds += phrase.duration;
      this.lastPhrase = phrase;

      if (wasBuffering || this._status === 'generating') {
        this.setStatus('playing');
      }
    } catch (err) {
      console.error('[Scheduler] Generation error:', err);
      // Fallback: replay the last phrase (or seed) to avoid silence
      if (this.lastPhrase) {
        const fallback: MusicPhrase = {
          ...this.lastPhrase,
          notes: this.lastPhrase.notes.map((n) => ({
            ...n,
            velocity: Math.round(n.velocity * 0.85),
          })),
        };
        this.musicEngine.schedulePhrase(fallback, this.bufferEndSeconds);
        this.bufferEndSeconds += fallback.duration;
      }
    } finally {
      this.isGenerating = false;
    }
  }
}
