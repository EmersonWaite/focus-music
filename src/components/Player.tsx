// ---------------------------------------------------------------------------
// Player — the main component that wires engines together and owns state.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { AppStatus, PlaybackOptions } from '../types';
import { MusicEngine } from '../engine/MusicEngine';
import { GenerationEngine } from '../engine/GenerationEngine';
import { Scheduler } from '../engine/Scheduler';
import { getPreset } from '../engine/presets';
import { StatusIndicator } from './StatusIndicator';
import { Controls } from './Controls';
import { Visualizer } from './Visualizer';

const DEFAULT_OPTIONS: PlaybackOptions = {
  preset: 'calm-keys',
  tempo: 76,
  energy: 0.45,
  complexity: 0.4,
  volume: 0.75,
};

export function Player() {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  // True only while the initial async start() is in flight — controls button disabled state
  // independently of status transitions so the button never flickers.
  const [isStarting, setIsStarting] = useState(false);
  const [options, setOptions] = useState<PlaybackOptions>(DEFAULT_OPTIONS);
  const [genSource, setGenSource] = useState<string>('algorithmic');
  const [magentaMsg, setMagentaMsg] = useState<string>('');

  // Stable refs for engine instances (created once)
  const musicEngineRef = useRef<MusicEngine | null>(null);
  const genEngineRef = useRef<GenerationEngine | null>(null);
  const schedulerRef = useRef<Scheduler | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Initialise engines once on mount
  useEffect(() => {
    const music = new MusicEngine();
    const gen = new GenerationEngine();
    const scheduler = new Scheduler(music, gen, (s) => {
      setStatus(s);
    });

    musicEngineRef.current = music;
    genEngineRef.current = gen;
    schedulerRef.current = scheduler;

    // Start loading Magenta in the background immediately
    gen.loadMagenta((msg) => {
      setMagentaMsg(msg);
      if (msg === 'Magenta ready') {
        setGenSource('magenta');
      }
    });

    return () => {
      scheduler.stop();
      music.dispose();
    };
  }, []);

  // Keep gen source in sync
  useEffect(() => {
    const interval = setInterval(() => {
      if (genEngineRef.current?.isMagentaReady) {
        setGenSource(genEngineRef.current.source);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // -------------------------------------------------------------------------
  // Play / Pause
  // -------------------------------------------------------------------------
  const handlePlay = useCallback(async () => {
    const music = musicEngineRef.current;
    const scheduler = schedulerRef.current;
    if (!music || !scheduler) return;

    setIsStarting(true);
    try {
      if (!music.isInitialized) {
        await music.initialize();
      }
      const preset = getPreset(optionsRef.current.preset);
      await scheduler.start(preset, optionsRef.current);
      setIsPlaying(true);
    } finally {
      setIsStarting(false);
    }
  }, []);

  const handlePause = useCallback(() => {
    schedulerRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const handleResume = useCallback(() => {
    schedulerRef.current?.resume();
    setIsPlaying(true);
  }, []);

  const handleToggle = useCallback(async () => {
    if (!isPlaying && status === 'idle') {
      await handlePlay();
    } else if (isPlaying) {
      handlePause();
    } else if (status === 'paused') {
      handleResume();
    }
  }, [isPlaying, status, handlePlay, handlePause, handleResume]);

  // -------------------------------------------------------------------------
  // Options changes
  // -------------------------------------------------------------------------
  const handleOptionsChange = useCallback((newOpts: PlaybackOptions) => {
    const prevOpts = optionsRef.current;
    setOptions(newOpts);

    if (!schedulerRef.current) return;

    // Preset change while playing: restart
    if (newOpts.preset !== prevOpts.preset && isPlaying) {
      schedulerRef.current.stop();
      setIsPlaying(false);
      setStatus('idle');
      // Auto-restart with new preset
      setTimeout(async () => {
        const music = musicEngineRef.current;
        const scheduler = schedulerRef.current;
        if (!music || !scheduler) return;
        const preset = getPreset(newOpts.preset);
        await scheduler.start(preset, newOpts);
        setIsPlaying(true);
      }, 100);
      return;
    }

    // Live-update tempo + volume
    schedulerRef.current.updateOptions(newOpts);
  }, [isPlaying]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  // Button is only locked while the initial start() call is in flight.
  // Routine buffer refills and status transitions don't affect interactivity.
  const isLoading = isStarting;
  const preset = getPreset(options.preset);

  return (
    <div className="player-wrap">
      <div className="player-card">
        {/* Header */}
        <div className="player-header">
          <StatusIndicator status={status} source={genSource} />
          {magentaMsg && status !== 'playing' && (
            <span className="magenta-msg">{magentaMsg}</span>
          )}
        </div>

        {/* Visualizer */}
        <Visualizer
          engine={musicEngineRef.current}
          isPlaying={isPlaying && status === 'playing'}
        />

        {/* Play button */}
        <button
          className={`play-btn${isLoading ? ' loading' : ''}`}
          onClick={handleToggle}
          disabled={isLoading}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause size={28} strokeWidth={1.5} />
          ) : (
            <Play size={28} strokeWidth={1.5} />
          )}
        </button>

        {/* Preset description */}
        <p className="preset-description">{preset.description}</p>

        {/* Controls */}
        <Controls
          options={options}
          onChange={handleOptionsChange}
          disabled={isLoading}
        />

        {/* Footer note */}
        <p className="gen-note">
          Generated live in your browser
          {genSource === 'magenta' ? ' with Magenta.js' : ''}
        </p>
      </div>
    </div>
  );
}
