import { useState } from 'react';
import { useApp } from '../store';

export default function SourcesPanel() {
  const sources = useApp((s) => s.sources);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async (id?: string) => {
    setBusy(true);
    try {
      // A manual refresh always bypasses adapter caches for live ADP.
      await window.api.refreshSource(id, true);
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.api.importCsv();
      if (result) {
        setMessage(`Imported "${result.label}" — matched ${result.matched} of ${result.total} rows.`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sources-panel">
      <ul className="source-list">
        {sources.length === 0 && <li className="muted">No sources yet — refresh or import below.</li>}
        {sources.map((source) => (
          <li key={source.id}>
            <div>
              <strong>{source.label}</strong>{' '}
              <span className="muted small">
                {Object.keys(source.entries).length} players
                {source.updatedAt > 0 && ` · ${new Date(source.updatedAt).toLocaleString()}`}
              </span>
              {source.error && <div className="error small">{source.error}</div>}
            </div>
            <div className="row-buttons">
              {source.kind !== 'csv' && (
                <button disabled={busy} onClick={() => void refresh(source.id)}>
                  Refresh
                </button>
              )}
              {source.kind === 'csv' && (
                <button disabled={busy} onClick={() => void window.api.removeSource(source.id)}>
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="row-buttons">
        <button disabled={busy} onClick={() => void refresh()}>
          Refresh all sources
        </button>
        <button disabled={busy} onClick={() => void importCsv()}>
          Import CSV…
        </button>
      </div>
      {message && <p className="muted small">{message}</p>}
      <p className="muted small">
        CSV import covers Yahoo exports, FantasyPros ECR, or any sheet with a player-name
        column. Data stays on this machine and is never committed to the repo.
      </p>
    </div>
  );
}
