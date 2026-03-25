import { useEffect, useRef } from 'react';
import type { MusicEngine } from '../engine/MusicEngine';

interface Props {
  engine: MusicEngine | null;
  isPlaying: boolean;
}

const BAR_COUNT = 32;

export function Visualizer({ engine, isPlaying }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      let waveform: Float32Array;
      if (engine?.isInitialized && isPlaying) {
        waveform = engine.getWaveform();
      } else {
        // Idle flat line
        waveform = new Float32Array(128).fill(0);
      }

      // Down-sample waveform to BAR_COUNT bars
      const step = Math.floor(waveform.length / BAR_COUNT);
      const barW = width / BAR_COUNT;
      const centerY = height / 2;

      for (let i = 0; i < BAR_COUNT; i++) {
        const sample = waveform[i * step] ?? 0;
        const barH = Math.max(2, Math.abs(sample) * height * 0.9);

        const alpha = isPlaying ? 0.65 + Math.abs(sample) * 0.35 : 0.18;
        ctx.fillStyle = `rgba(99, 102, 241, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(
          i * barW + barW * 0.15,
          centerY - barH / 2,
          barW * 0.7,
          barH,
          2,
        );
        ctx.fill();
      }
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [engine, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      className="visualizer"
      width={400}
      height={60}
      aria-hidden="true"
    />
  );
}
