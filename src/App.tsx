import { Player } from './components/Player';

export default function App() {
  return (
    <div className="app">
      {/* Hero */}
      <header className="hero">
        <div className="hero-logo">
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#6366f1" fillOpacity="0.15" />
            <path d="M10 22 L10 12 L22 10 L22 20" stroke="#6366f1" strokeWidth="2" fill="none" strokeLinecap="round"/>
            <circle cx="8" cy="22" r="3" fill="#6366f1"/>
            <circle cx="20" cy="20" r="3" fill="#6366f1"/>
          </svg>
          <span className="logo-text">Flow</span>
        </div>
        <h1 className="hero-title">Endless focus music</h1>
        <p className="hero-sub">
          Instrumental music generated live in your browser.
          No streaming. No ads. Just flow.
        </p>
      </header>

      {/* Player */}
      <main>
        <Player />
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>Powered by Magenta.js + Tone.js · Runs entirely client-side</p>
      </footer>
    </div>
  );
}
