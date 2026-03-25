// ---------------------------------------------------------------------------
// Core domain types shared across all engine layers
// ---------------------------------------------------------------------------

/** A single scheduled note, independent of any library format. */
export interface MusicNote {
  pitch: number;     // MIDI pitch 0–127
  startTime: number; // seconds from phrase start
  endTime: number;   // seconds from phrase start
  velocity: number;  // 0–127
}

/** A contiguous block of music ready to be scheduled for playback. */
export interface MusicPhrase {
  notes: MusicNote[];
  duration: number; // total phrase duration in seconds
  tempo: number;    // BPM this phrase was generated for
}

/** Parameters that drive both generation and synthesis. */
export interface PlaybackOptions {
  tempo: number;       // BPM (40–160)
  energy: number;      // 0–1; controls velocity, note density, register
  complexity: number;  // 0–1; controls rhythmic and melodic variety
  volume: number;      // 0–1; master output level
  preset: PresetName;
}

export type PresetName = 'calm-keys' | 'lofi-pads';

/** Status shown in the UI status indicator. */
export type AppStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'generating'
  | 'playing'
  | 'buffering'
  | 'paused'
  | 'error';

/** Instrument voice configuration passed to the MusicEngine. */
export interface InstrumentConfig {
  oscillatorType: OscillatorType | 'custom';
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterFreq: number;     // Hz; low-pass cutoff
  filterQ: number;
  reverbWet: number;      // 0–1
  detuneAmount: number;   // cents; for pad-style detuning
  harmonics: number[];    // interval offsets in semitones to layer above root note
}

/** Full preset definition: instrument + seed musical material. */
export interface Preset {
  name: PresetName;
  label: string;
  description: string;
  instrument: InstrumentConfig;
  /** Root MIDI pitch (e.g. 60 = C4). */
  rootPitch: number;
  /** Scale intervals in semitones from root (e.g. [0,2,4,5,7,9,11] = major). */
  scale: number[];
  /** Octave offset for the register of generated notes. */
  octave: number;
  /** Seed phrase to bootstrap generation before any model is ready. */
  seedNotes: MusicNote[];
  /** Chord progression: array of scale-degree indices (0-based). */
  chordDegrees: number[];
  defaultTempo: number;
}
