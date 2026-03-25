// ---------------------------------------------------------------------------
// AlgorithmicGenerator — instant, music-theory-driven phrase builder.
//
// This runs without any model loading and is always available as the primary
// generator or as a fallback when Magenta hasn't loaded yet.
//
// Design goals:
//   - Musically coherent: respects scale, follows chord degrees
//   - Continuously varying: uses seeded pseudo-random for repeatability
//   - Responds to energy + complexity parameters
//   - Smooth transitions: last note of previous phrase influences first note
// ---------------------------------------------------------------------------

import type { MusicNote, MusicPhrase, PlaybackOptions, Preset } from '../types';

// ---------------------------------------------------------------------------
// Simple seeded LCG pseudo-random (deterministic, no external dependency)
// ---------------------------------------------------------------------------
class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed >>> 0; }

  next(): number {
    // Numerical Recipes LCG
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0xffffffff;
  }

  /** Integer in [min, max) */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /** Pick a random element */
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length)]!;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build MIDI pitches for a chord rooted at the given scale degree. */
function buildChordPitches(
  rootPitch: number,
  scale: number[],
  degree: number,
  octave: number,
): number[] {
  const base = rootPitch + scale[degree % scale.length]! + octave * 12;
  // Triad: root, 3rd scale step, 5th scale step above degree
  const third = rootPitch + scale[(degree + 2) % scale.length]! + octave * 12;
  const fifth = rootPitch + scale[(degree + 4) % scale.length]! + octave * 12;
  // Keep third/fifth in same octave as base or next
  const adjustedThird = third < base ? third + 12 : third;
  const adjustedFifth = fifth < base ? fifth + 12 : fifth;
  return [base, adjustedThird, adjustedFifth];
}

/** Clamp MIDI pitch to playable range. */
function clampPitch(pitch: number): number {
  while (pitch < 36) pitch += 12;
  while (pitch > 96) pitch -= 12;
  return pitch;
}

// ---------------------------------------------------------------------------
// Rhythmic pattern templates
// The numbers represent beat-fraction positions in a 4-beat bar.
// Each sub-array is one bar of note-start offsets (in beats).
// ---------------------------------------------------------------------------
const SPARSE_RHYTHMS = [
  [0, 2],
  [0, 1.5, 3],
  [0, 2.5],
];

const FLOW_RHYTHMS = [
  [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],    // eighth notes
  [0, 0.75, 1.5, 2.25, 3],             // dotted-quarter feel
  [0, 0.5, 1.5, 2, 2.5, 3.5],          // syncopated eighths
];

const BUSY_RHYTHMS = [
  [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.25, 2.5, 3, 3.5], // 16th-note flavour
  [0, 0.5, 0.75, 1, 1.5, 2, 2.5, 2.75, 3, 3.5],
];

// ---------------------------------------------------------------------------
// Main generator class
// ---------------------------------------------------------------------------
export class AlgorithmicGenerator {
  private rngSeed: number;

  constructor(seed = Date.now()) {
    this.rngSeed = seed;
  }

  /**
   * Generate one phrase (2–4 bars) of notes.
   *
   * @param preset   - The active preset (scale, root, chord progression)
   * @param options  - Current playback options (tempo, energy, complexity)
   * @param prevPhrase - Last generated phrase (used for voice-leading context)
   * @param phraseIndex - How many phrases have been generated (drives variety)
   */
  generate(
    preset: Preset,
    options: PlaybackOptions,
    prevPhrase: MusicPhrase | null,
    phraseIndex: number,
  ): MusicPhrase {
    const rng = new SeededRandom(this.rngSeed + phraseIndex * 7919);
    const { tempo, energy, complexity } = options;
    const beatDuration = 60 / tempo; // seconds per beat

    // Phrase length: 2 bars at low energy, 4 bars at high
    const bars = energy < 0.4 ? 2 : energy < 0.75 ? 3 : 4;
    const totalBeats = bars * 4;
    const totalDuration = totalBeats * beatDuration;

    // Pick chord for this phrase from the preset's progression
    const chordIndex = phraseIndex % preset.chordDegrees.length;
    const degree = preset.chordDegrees[chordIndex]!;
    const chordPitches = buildChordPitches(
      preset.rootPitch,
      preset.scale,
      degree,
      preset.octave,
    );

    // Choose rhythm template based on energy/complexity
    let rhythmPool: number[][];
    if (energy < 0.3) {
      rhythmPool = SPARSE_RHYTHMS;
    } else if (energy < 0.65 || complexity < 0.4) {
      rhythmPool = FLOW_RHYTHMS;
    } else {
      rhythmPool = BUSY_RHYTHMS;
    }
    const barRhythm = rng.pick(rhythmPool);

    // Build notes bar by bar
    const notes: MusicNote[] = [];
    let lastPitch = prevPhrase?.notes.at(-1)?.pitch ?? chordPitches[0]!;

    for (let bar = 0; bar < bars; bar++) {
      const barStartTime = bar * 4 * beatDuration;

      for (const beatOffset of barRhythm) {
        const startTime = barStartTime + beatOffset * beatDuration;
        if (startTime >= totalDuration) break;

        // Pick next pitch: stay close to last pitch (voice leading)
        const candidate = rng.pick(chordPitches);
        // Optional: add a non-chord scale note for complexity
        let pitch = candidate;
        if (complexity > 0.5 && rng.next() < 0.25) {
          const scalePitch =
            preset.rootPitch +
            preset.scale[rng.int(0, preset.scale.length)]! +
            preset.octave * 12;
          pitch = scalePitch;
        }
        // Nudge octave to stay within one octave of lastPitch
        while (Math.abs(pitch - lastPitch) > 7) {
          pitch += pitch < lastPitch ? 12 : -12;
        }
        pitch = clampPitch(pitch);

        // Note duration: longer notes at low energy
        const rawDuration =
          energy < 0.3
            ? beatDuration * (1.5 + rng.next())
            : energy < 0.65
            ? beatDuration * (0.75 + rng.next() * 0.5)
            : beatDuration * (0.4 + rng.next() * 0.35);

        const noteDuration = Math.min(rawDuration, totalDuration - startTime);
        const endTime = startTime + noteDuration * 0.92; // slight gap between notes

        // Velocity: base + energy influence + slight humanization
        const baseVelocity = 50 + energy * 30;
        const velocity = Math.round(
          clamp(baseVelocity + (rng.next() - 0.5) * 14, 40, 100),
        );

        notes.push({ pitch, startTime, endTime, velocity });
        lastPitch = pitch;
      }
    }

    // Advance the RNG seed so next call with same phraseIndex+1 differs
    this.rngSeed = rng.int(1, 0xffffff);

    return { notes, duration: totalDuration, tempo };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
