# Flow — Endless Focus Music

> Instrumental focus music generated live in your browser. No streaming, no server, no gap in the audio.

**Live app:** https://focus-music.pages.dev

---

## Architecture overview

```
src/
  engine/
    presets.ts               Music config (scale, chord progression, instrument)
    algorithmicGenerator.ts  Instant music-theory-driven phrase builder (always ready)
    magentaGenerator.ts      Magenta.js MusicRNN wrapper (loads async, enhances quality)
    GenerationEngine.ts      Orchestrates between the two generators
    MusicEngine.ts           Tone.js synthesis + audio graph
    Scheduler.ts             The endless generation loop
  components/
    Player.tsx               Main component; owns state, wires engines
    Controls.tsx             Sliders, mode selector
    StatusIndicator.tsx      Status dot + label
    Visualizer.tsx           Canvas waveform animation
  App.tsx                    Layout shell
  main.tsx                   Entry point
  index.css                  Dark-mode styles
```

### Three-layer design

| Layer | File(s) | Responsibility |
|-------|---------|----------------|
| **Generation** | `GenerationEngine`, `algorithmicGenerator`, `magentaGenerator` | Produce `MusicPhrase` objects |
| **Synthesis** | `MusicEngine` | Turn `MusicPhrase` notes into scheduled audio via Tone.js |
| **Scheduling** | `Scheduler` | Drive the endless loop; manage the playback buffer |

---

## How endless generation works

The `Scheduler` maintains a **buffer window** — a lookahead of pre-generated music that's been scheduled on the Tone.js Transport but hasn't played yet.

```
Timeline (seconds from Transport start):

  0──────[playing]──────[scheduled / buffered]──────► future
                        ↑                      ↑
                   currentTime            bufferEndSeconds
```

Every **500 ms** (via `Transport.scheduleRepeat`), the scheduler checks:

```
remaining = bufferEndSeconds - currentTime

if remaining < LOOKAHEAD_SECONDS (10s) AND not already generating:
  1. GenerationEngine.generateNext(preset, options, lastPhrase)
  2. MusicEngine.schedulePhrase(result, bufferEndSeconds)
  3. bufferEndSeconds += result.duration
  4. lastPhrase = result  ← seed for next call
```

**Start-up:** Two phrases are pre-generated synchronously before the transport starts, so playback begins immediately on first click.

**Graceful degradation:** If generation fails, the last phrase is replayed at slightly lower velocity rather than going silent.

**Two generators:**
- `AlgorithmicGenerator` — always available, uses music-theory chord/arpeggio patterns; starts instantly.
- `MagentaGenerator` — loads the `basic_rnn` checkpoint (~3.6 MB from Google CDN) in the background; takes over once ready. The status badge shows "AI" when Magenta is driving.

---

## Local setup

```bash
git clone https://github.com/EmersonWaite/focus-music
cd focus-music
npm install
npm run dev        # opens http://localhost:5173
```

**Requirements:** Node 18+, a modern browser (Chrome desktop recommended).

---

## Deployment to Cloudflare Pages

### Manual deploy

```bash
npm run build                     # outputs to dist/
npx wrangler pages deploy dist --project-name focus-music
```

### Automatic deploy via GitHub

1. Push this repo to GitHub (already done).
2. In [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages** → **Create a project** → **Connect to Git**.
3. Select this repo.
4. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Save. Every push to `main` auto-deploys.

---

## How to swap or tune presets

Open `src/engine/presets.ts`. Each preset is a `Preset` object with:

```ts
{
  name, label, description,
  rootPitch,    // MIDI root (60 = C4, 57 = A3, etc.)
  scale,        // array of semitone intervals ([0,2,4,7,9] = pentatonic)
  chordDegrees, // chord progression as scale-degree indices
  defaultTempo,
  instrument: {
    oscillatorType,  // 'triangle' | 'sawtooth' | 'sine' | 'square'
    attack, decay, sustain, release,  // ADSR
    filterFreq,      // low-pass cutoff Hz
    reverbWet,       // 0–1
    detuneAmount,    // cents, >0 for pad-width effect
    harmonics,       // semitone offsets to layer (e.g. [12] = octave doubling)
  },
  seedNotes,    // starter phrase before generation kicks in
}
```

Add a new entry to the `PRESETS` record and it automatically appears in the UI.

**Tuning Magenta temperature:** In `magentaGenerator.ts`, the `temperature` is computed as `0.8 + complexity * 0.4`. Lower = more repetitive, higher = more adventurous. Range 0.5–1.5 is practical.

---

## Known limitations

- **Magenta quality:** `basic_rnn` generates monophonic melodies. The harmonic richness comes from Tone.js layering (octave/fifth harmonics), not the model itself. The generated melody may occasionally step outside the preset's scale.
- **First-load latency:** Magenta checkpoint download (~3.6 MB) takes 2–5 seconds on first load. The algorithmic generator covers this gap.
- **Mobile:** Not optimised. Web Audio context on iOS requires specific unlock handling; works but may have volume quirks.
- **Polyphony:** Tone.js `PolySynth` defaults to 32 voices. Dense passages at high energy/complexity may cause voice stealing.
- **No persistence:** Settings reset on refresh. No user accounts or saved presets yet.
- **Tempo changes mid-phrase:** Only affect the transport BPM; already-scheduled notes play at their original timing until the next phrase.

---

## Next upgrades

1. **User accounts** — Supabase or Cloudflare D1 + Workers for auth. Keep auth behind a `VITE_ENABLE_AUTH` env flag so the app remains fully usable without it.

2. **Stripe subscription** — `$2/month` tier unlocks: premium presets, session length history, saved settings. Use Cloudflare Workers as the Stripe webhook handler.

3. **Saving favourite presets** — Store custom slider values + preset name in localStorage short-term, synced to user account when auth is added.

4. **Longer-form musical memory / coherence** — Switch from `basic_rnn` to `music_vae/mel_4bar_med_lokl` (MusicVAE) to encode the last 4 bars into a latent vector and interpolate toward a target phrase. This gives smoother long-range structure. Alternatively, maintain a key/chord context object in the Scheduler and bias the algorithmic generator toward the current chord more strongly.

5. **Mobile optimisation** — Add a `<meta name="apple-mobile-web-app-capable">` manifest, handle iOS AudioContext unlock via a splash-screen tap, reduce polyphony count, and add a PWA manifest so the app can be installed to home screen.

6. **Analytics** — Cloudflare Analytics Engine (zero-cost, privacy-friendly) to track session length, preset popularity, and Magenta vs. algorithmic usage ratio.
