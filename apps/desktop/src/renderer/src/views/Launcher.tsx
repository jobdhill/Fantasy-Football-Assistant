import { useState } from 'react';
import RankingsEditor from '../components/RankingsEditor';
import SettingsForm from '../components/SettingsForm';
import SourcesPanel from '../components/SourcesPanel';
import UnmatchedResolver from '../components/UnmatchedResolver';
import { useApp } from '../store';

type Tab = 'draft' | 'rankings';

function prettyCombo(accelerator: string | null): string {
  if (!accelerator) return 'unavailable (all combos taken by other apps)';
  return accelerator
    .replace('CommandOrControl', '⌘')
    .replace('Control', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replace(/\+/g, '');
}

export default function Launcher() {
  const [tab, setTab] = useState<Tab>('draft');
  const { session, unmatched, bridge, hotkeys } = useApp();

  return (
    <div className="launcher">
      <header className="launcher-header">
        <div>
          <h1>Draft Overlay</h1>
          <p className="muted">
            Unofficial tool — not affiliated with ESPN, Yahoo, or Sleeper.
          </p>
        </div>
        <button className="primary big" onClick={() => void window.api.toggleOverlay()}>
          Open / Hide Overlay
        </button>
      </header>

      <nav className="tabs">
        <button className={tab === 'draft' ? 'active' : ''} onClick={() => setTab('draft')}>
          Draft
        </button>
        <button className={tab === 'rankings' ? 'active' : ''} onClick={() => setTab('rankings')}>
          Rankings
        </button>
      </nav>

      {tab === 'draft' ? (
        <div className="launcher-grid">
          <section className="card">
            <h2>League settings</h2>
            <SettingsForm />
          </section>

          <section className="card">
            <h2>Draft session</h2>
            <p className="muted">
              {session
                ? `${session.picks.length} picks recorded`
                : 'No active draft — start one when your room opens.'}
            </p>
            <div className="row-buttons">
              <button className="primary" onClick={() => void window.api.startDraft()}>
                Start draft
              </button>
              <button onClick={() => void window.api.resetDraft()}>Reset</button>
            </div>
            {unmatched.length > 0 && <UnmatchedResolver />}
          </section>

          <section className="card">
            <h2>Extension pairing</h2>
            {bridge ? (
              <>
                <p>
                  Status:{' '}
                  <strong className={bridge.connected ? 'ok' : 'warn'}>
                    {bridge.connected ? 'Connected' : 'Waiting for extension'}
                  </strong>
                </p>
                <p>
                  Token: <code className="token">{bridge.token}</code> · Port{' '}
                  <code>{bridge.port}</code>
                </p>
                {bridge.error && <p className="error">{bridge.error}</p>}
                <p className="muted small">
                  Enter this token in the browser extension popup, then open your ESPN or
                  Yahoo draft room. Picks stream in automatically; manual clicks in the
                  overlay always work as a fallback.
                </p>
              </>
            ) : (
              <p className="muted">Bridge starting…</p>
            )}
          </section>

          <section className="card">
            <h2>Hotkeys</h2>
            <ul className="hotkeys">
              <li>
                <code>{prettyCombo(hotkeys.overlay)}</code> show / hide overlay
              </li>
              <li>
                <code>{prettyCombo(hotkeys.clickThrough)}</code> toggle click-through
              </li>
            </ul>
            <p className="muted small">
              Hotkeys work globally, even while the draft room has focus. If a combo was
              taken by another app, a fallback was registered and is shown above.
            </p>
          </section>
        </div>
      ) : (
        <div className="launcher-grid">
          <section className="card">
            <h2>Ranking sources</h2>
            <SourcesPanel />
          </section>
          <section className="card wide">
            <h2>My rankings</h2>
            <RankingsEditor />
          </section>
        </div>
      )}
    </div>
  );
}
