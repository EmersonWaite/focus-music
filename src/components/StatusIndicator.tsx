import type { AppStatus } from '../types';

interface Props {
  status: AppStatus;
  source?: string;
}

const STATUS_CONFIG: Record<AppStatus, { label: string; color: string }> = {
  idle:         { label: 'Ready',        color: 'var(--color-muted)' },
  initializing: { label: 'Starting…',   color: 'var(--color-accent)' },
  ready:        { label: 'Ready',        color: 'var(--color-success)' },
  generating:   { label: 'Generating',   color: 'var(--color-accent)' },
  playing:      { label: 'Playing',      color: 'var(--color-success)' },
  buffering:    { label: 'Buffering…',   color: 'var(--color-warn)' },
  paused:       { label: 'Paused',       color: 'var(--color-muted)' },
  error:        { label: 'Error',        color: 'var(--color-error)' },
};

export function StatusIndicator({ status, source }: Props) {
  const { label, color } = STATUS_CONFIG[status];
  const isPulsing = status === 'playing' || status === 'generating' || status === 'buffering';

  return (
    <div className="status-indicator">
      <span
        className={`status-dot${isPulsing ? ' pulsing' : ''}`}
        style={{ background: color }}
      />
      <span className="status-label" style={{ color }}>
        {label}
      </span>
      {source === 'magenta' && status === 'playing' && (
        <span className="status-badge">AI</span>
      )}
    </div>
  );
}
