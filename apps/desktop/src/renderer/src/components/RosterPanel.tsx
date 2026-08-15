import { POSITIONS } from '@draft-overlay/shared';
import { rosterForSlot } from '../lib/derived';
import { useApp, usePlayersById } from '../store';

export default function RosterPanel() {
  const session = useApp((s) => s.session);
  const settings = useApp((s) => s.settings);
  const byId = usePlayersById();

  const active = session?.settings ?? settings;
  const roster = rosterForSlot(session, active.mySlot, byId);

  const starters: Record<string, number> = {
    QB: active.roster.QB, RB: active.roster.RB, WR: active.roster.WR,
    TE: active.roster.TE, DST: active.roster.DST, K: active.roster.K,
  };

  return (
    <div className="roster-panel">
      {POSITIONS.map((pos) => {
        const mine = roster.filter((p) => p.position === pos);
        return (
          <div key={pos} className="roster-row">
            <span className="roster-pos">{pos}</span>
            <span className={mine.length < starters[pos] ? 'warn' : 'ok'}>
              {mine.length}/{starters[pos]}
              {pos !== 'DST' && pos !== 'K' && active.roster.FLEX > 0 && ' (+flex)'}
            </span>
            <span className="roster-names muted small">
              {mine.map((p) => p.name).join(', ') || '—'}
            </span>
          </div>
        );
      })}
      <p className="muted small">{roster.length} players drafted (slot {active.mySlot})</p>
    </div>
  );
}
