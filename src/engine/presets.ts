// ---------------------------------------------------------------------------
// Preset definitions — music config + instrument config for each mode.
// Add new presets here; the rest of the system picks them up automatically.
// ---------------------------------------------------------------------------

import type { Preset } from '../types';

// Pentatonic major scale (5 notes, very consonant, no avoid-notes)
const PENTATONIC_MAJOR = [0, 2, 4, 7, 9];

// Natural minor scale
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];

// ---------------------------------------------------------------------------
// Calm Keys — soft piano-like chords with a slow, breathing feel
// ---------------------------------------------------------------------------
const CALM_KEYS: Preset = {
  name: 'calm-keys',
  label: 'Calm Keys',
  description: 'Soft piano phrasing over open chords',
  rootPitch: 60, // C4
  scale: PENTATONIC_MAJOR,
  octave: 0,
  defaultTempo: 76,
  chordDegrees: [0, 2, 3, 1], // I - iii - IV - ii (pentatonic-ish cycle)
  instrument: {
    oscillatorType: 'triangle',
    attack: 0.04,
    decay: 0.6,
    sustain: 0.3,
    release: 1.4,
    filterFreq: 3200,
    filterQ: 0.5,
    reverbWet: 0.35,
    detuneAmount: 0,
    harmonics: [12], // double at the octave for warmth
  },
  seedNotes: [
    { pitch: 60, startTime: 0.0, endTime: 0.8, velocity: 70 },
    { pitch: 64, startTime: 0.8, endTime: 1.6, velocity: 65 },
    { pitch: 67, startTime: 1.6, endTime: 2.4, velocity: 68 },
    { pitch: 64, startTime: 2.4, endTime: 3.2, velocity: 62 },
    { pitch: 62, startTime: 3.2, endTime: 4.0, velocity: 66 },
    { pitch: 60, startTime: 4.0, endTime: 5.0, velocity: 70 },
  ],
};

// ---------------------------------------------------------------------------
// Lo-Fi Pads — detuned saw pads with slow attack, warm filter
// ---------------------------------------------------------------------------
const LOFI_PADS: Preset = {
  name: 'lofi-pads',
  label: 'Lo-Fi Pads',
  description: 'Warm detuned pads drifting through minor space',
  rootPitch: 57, // A3
  scale: NATURAL_MINOR,
  octave: 0,
  defaultTempo: 68,
  chordDegrees: [0, 3, 4, 6], // i - iv - v - VII (natural minor)
  instrument: {
    oscillatorType: 'sawtooth',
    attack: 0.6,
    decay: 0.8,
    sustain: 0.7,
    release: 2.0,
    filterFreq: 1200,
    filterQ: 1.2,
    reverbWet: 0.55,
    detuneAmount: 12, // slight detune for pad width
    harmonics: [7, 12], // 5th + octave layered
  },
  seedNotes: [
    { pitch: 57, startTime: 0.0, endTime: 2.0, velocity: 60 },
    { pitch: 60, startTime: 1.0, endTime: 3.0, velocity: 55 },
    { pitch: 64, startTime: 2.0, endTime: 4.0, velocity: 58 },
    { pitch: 62, startTime: 3.0, endTime: 5.0, velocity: 56 },
    { pitch: 60, startTime: 4.0, endTime: 6.0, velocity: 60 },
  ],
};

export const PRESETS: Record<string, Preset> = {
  'calm-keys': CALM_KEYS,
  'lofi-pads': LOFI_PADS,
};

export function getPreset(name: string): Preset {
  return PRESETS[name] ?? CALM_KEYS;
}
