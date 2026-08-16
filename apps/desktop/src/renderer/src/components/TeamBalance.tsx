import { POSITIONS } from '@draft-overlay/shared';
import { useMemo } from 'react';
import { headshotUrl, POSITION_COLORS, teamBalanceView, type BoardRow } from '../lib/derived';
import { useApp, usePlayersById } from '../store';

export default function TeamBalance({ rows }: { rows: BoardRow[] }) {
  const session = useApp((s) => s.session);
  const settings = useApp((s) => s.settings);
  const byId = usePlayersById();

  const view = useMemo(
    () => teamBalanceView(rows, session, settings, byId),
    [rows, session, settings, byId],
  );

  return (
    <div className="balance-panel">
      <div className="balance-head">
        <span className="balance-title">Team Balance</span>
        <span className="muted small">Rd {view.round}/{view.rounds}</span>
      </div>

      {POSITIONS.map((pos) => {
        const b = view.balances.find((x) => x.position === pos)!;
        const mine = view.playersByPos[pos];
        const ratio = b.pct ?? 0;
        // The bar spans 0–200% of target; the marker at its midpoint is 100%.
        const fillPct = Math.min(2, ratio) / 2;
        const overPct = Math.max(0, Math.min(2, ratio) - 1) / 2;
        const pctText = b.pct != null ? `${Math.round(b.pct * 100)}%` : b.value > 0 ? '—' : '0%';
        return (
          <div key={pos} className="balance-row">
            <div className="balance-line">
              <span className="balance-pos" style={{ color: POSITION_COLORS[pos] }}>{pos}</span>
              <div className="balance-bar">
                <div
                  className="balance-fill"
                  style={{ width: `${fillPct * 100}%`, background: POSITION_COLORS[pos] }}
                />
                {overPct > 0 && (
                  <div className="balance-over" style={{ width: `${overPct * 100}%` }} />
                )}
                <div className="balance-marker" />
              </div>
              <span className="balance-pct">{pctText}</span>
              <span className={`balance-status s-${b.status.toLowerCase()}`}>
                {b.status === 'OK' ? '' : b.status}
              </span>
            </div>
            {mine.length > 0 && (
              <div className="balance-players">
                {mine.map((p) => (
                  <span key={p.id} className="balance-player">
                    <img
                      className="headshot tiny"
                      src={headshotUrl(p)}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                      }}
                    />
                    {p.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <p className="muted small balance-note">
        100% = a balanced team's investment by this round · player value from market cost (ADP)
      </p>
    </div>
  );
}
