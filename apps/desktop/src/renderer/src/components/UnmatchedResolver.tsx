import { normalizeName } from '@draft-overlay/shared';
import { useState } from 'react';
import { useApp, usePlayersById } from '../store';

/**
 * Fixes picks whose raw draft-room name couldn't be identity-matched.
 * Shows the matcher's candidates first; falls back to a free search.
 */
export default function UnmatchedResolver() {
  const unmatched = useApp((s) => s.unmatched);
  const players = useApp((s) => s.players);
  const byId = usePlayersById();
  const [query, setQuery] = useState('');

  if (unmatched.length === 0) return null;
  const item = unmatched[0];

  const searchResults = query.length >= 2
    ? players
        .filter((p) => normalizeName(p.name).includes(normalizeName(query)))
        .slice(0, 8)
    : [];

  const candidates = item.candidateIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => p != null);

  const resolve = (playerId: string) => {
    setQuery('');
    void window.api.resolvePick(item.overall, playerId);
  };

  return (
    <div className="unmatched">
      <h3>
        Unrecognized pick #{item.overall}: “{item.raw.name}”
        {unmatched.length > 1 && <span className="muted"> (+{unmatched.length - 1} more)</span>}
      </h3>
      {candidates.length > 0 && (
        <div className="row-buttons">
          {candidates.map((p) => (
            <button key={p.id} onClick={() => resolve(p.id)}>
              {p.name} · {p.position} {p.team ?? ''}
            </button>
          ))}
        </div>
      )}
      <input
        placeholder="Search all players…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searchResults.map((p) => (
        <button key={p.id} className="link" onClick={() => resolve(p.id)}>
          {p.name} · {p.position} {p.team ?? ''}
        </button>
      ))}
    </div>
  );
}
