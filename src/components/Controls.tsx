import type { PlaybackOptions, PresetName } from '../types';
import { PRESETS } from '../engine/presets';

interface Props {
  options: PlaybackOptions;
  onChange: (opts: PlaybackOptions) => void;
  disabled?: boolean;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  format?: (v: number) => string;
}

function Slider({ label, value, min, max, step, onChange, disabled, format }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-row">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <div className="slider-track-wrap">
        <div className="slider-fill" style={{ width: `${pct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="slider-input"
          aria-label={label}
        />
      </div>
    </div>
  );
}

export function Controls({ options, onChange, disabled }: Props) {
  const set = (patch: Partial<PlaybackOptions>) => onChange({ ...options, ...patch });
  const presetList = Object.values(PRESETS);

  return (
    <div className="controls">
      {/* Mode selector */}
      <div className="mode-selector">
        {presetList.map((p) => (
          <button
            key={p.name}
            className={`mode-btn${options.preset === p.name ? ' active' : ''}`}
            onClick={() => set({ preset: p.name as PresetName, tempo: p.defaultTempo })}
            disabled={disabled}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Sliders */}
      <div className="sliders">
        <Slider
          label="Tempo"
          value={options.tempo}
          min={50}
          max={140}
          step={1}
          onChange={(v) => set({ tempo: v })}
          disabled={disabled}
          format={(v) => `${v} BPM`}
        />
        <Slider
          label="Energy"
          value={options.energy}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set({ energy: v })}
          disabled={disabled}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          label="Complexity"
          value={options.complexity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set({ complexity: v })}
          disabled={disabled}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          label="Volume"
          value={options.volume}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set({ volume: v })}
          disabled={disabled}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </div>
    </div>
  );
}
