// ---------------------------------------------------------------------------
// GenerationEngine — orchestrates phrase generation.
//
// Strategy:
//   1. The AlgorithmicGenerator is always ready immediately.
//   2. The MagentaGenerator loads asynchronously in the background.
//   3. Once Magenta is ready, it takes over phrase generation.
//   4. If Magenta fails or is slow, we fall through to the algorithmic gen.
//
// This gives instant start-up with progressively better generation quality.
// ---------------------------------------------------------------------------

import type { MusicPhrase, PlaybackOptions, Preset } from '../types';
import { AlgorithmicGenerator } from './algorithmicGenerator';
import { MagentaGenerator } from './magentaGenerator';

export type GenerationSource = 'algorithmic' | 'magenta';

export class GenerationEngine {
  private algorithmic: AlgorithmicGenerator;
  private magenta: MagentaGenerator;
  private phraseIndex = 0;

  /** Which generator produced the most recent phrase. */
  source: GenerationSource = 'algorithmic';

  constructor(seed?: number) {
    this.algorithmic = new AlgorithmicGenerator(seed);
    this.magenta = new MagentaGenerator();
  }

  get isMagentaReady(): boolean {
    return this.magenta.isReady;
  }

  get magentaError(): string | null {
    return this.magenta.initError;
  }

  /**
   * Start loading the Magenta model in the background.
   * The caller receives optional progress messages.
   */
  loadMagenta(onProgress?: (msg: string) => void): void {
    void this.magenta.initialize(onProgress);
  }

  /**
   * Generate the next musical phrase.
   *
   * Tries Magenta first once it's ready; falls back to algorithmic on any
   * failure or if Magenta hasn't loaded yet.
   */
  async generateNext(
    preset: Preset,
    options: PlaybackOptions,
    prevPhrase: MusicPhrase | null,
  ): Promise<MusicPhrase> {
    const idx = this.phraseIndex++;

    // Attempt Magenta generation if the model is loaded and we have a prev
    if (this.magenta.isReady && prevPhrase) {
      const result = await this.magenta.generate(prevPhrase, preset, options);
      if (result) {
        this.source = 'magenta';
        return result;
      }
    }

    // Algorithmic fallback (always succeeds)
    this.source = 'algorithmic';
    return this.algorithmic.generate(preset, options, prevPhrase, idx);
  }

  /** Reset phrase counter (e.g. when the user changes preset). */
  reset(): void {
    this.phraseIndex = 0;
  }
}
