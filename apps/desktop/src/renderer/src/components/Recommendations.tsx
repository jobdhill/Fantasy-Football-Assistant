import type { DraftSession, LeagueSettings, Player } from '@draft-overlay/shared';
import { useMemo } from 'react';
import { headshotUrl, POSITION_COLORS, topRecommendations, type BoardRow } from '../lib/derived';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Recommendations({
  rows,
  session,
  settings,
  byId,
}: {
  rows: BoardRow[];
  session: DraftSession | null;
  settings: LeagueSettings;
  byId: Map<string, Player>;
}) {
  const recs = useMemo(
    () => topRecommendations(rows, session, settings, byId),
    [rows, session, settings, byId],
  );
  if (recs.length === 0) return null;

  return (
    <div className="recs3">
      {recs.map((rec, i) => {
        const b = rec.breakdown;
        const tooltip =
          `score ${rec.score}\n` +
          `board rank ${Math.round(rec.rank)} (base ${b.base.toFixed(2)})\n` +
          `ADP value ${b.value.toFixed(2)} · scarcity ${b.scarcity.toFixed(2)}\n` +
          `roster need ${b.need.toFixed(2)} · position run ${b.run.toFixed(2)}\n` +
          `${Math.round(rec.goneBeforeNextTurn * 100)}% gone before your next pick`;
        const [first, ...rest] = rec.player.name.split(' ');
        return (
          <div key={rec.player.id} className={`rec3 rec3-${i}`} title={tooltip}>
            <span className="rec3-medal">{MEDALS[i] ?? ''}</span>
            <img
              className="rec3-headshot"
              src={headshotUrl(rec.player)}
              alt=""
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
            <span className="rec3-name">
              <span className="rec3-first">{first}</span>
              <span className="rec3-last">{rest.join(' ') || ' '}</span>
            </span>
            <span className="rec3-sub">
              <span style={{ color: POSITION_COLORS[rec.player.position] }}>
                {rec.player.position}
              </span>
              <span className="muted"> {rec.player.team ?? ''}</span>
            </span>
            <span className="rec3-score">{rec.score}</span>
            {rec.tierAlert && <span className="rec3-tier">last in tier</span>}
          </div>
        );
      })}
    </div>
  );
}
