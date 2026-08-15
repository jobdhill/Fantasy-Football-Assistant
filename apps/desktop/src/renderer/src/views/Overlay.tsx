import { normalizeName, pickGoneProbability, POSITIONS, type Position } from '@draft-overlay/shared';
import { Fragment, useEffect, useMemo, useState } from 'react';
import Recommendations from '../components/Recommendations';
import RosterPanel from '../components/RosterPanel';
import {
  buildBoard,
  draftContext,
  headshotUrl,
  POSITION_COLORS,
  sourceShortLabel,
  tierLetter,
  tierSummary,
  type BoardRow,
} from '../lib/derived';
import { useApp, usePlayersById } from '../store';

type Sheet = 'rankings' | 'custom' | 'team';
type PosFilter = 'ALL' | Position;

const FAVS_KEY = 'draft-overlay-favorites';

function loadFavs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVS_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export default function Overlay() {
  const { players, sources, custom, session, settings, bridge, clickThrough } = useApp();
  const byId = usePlayersById();
  const [sheet, setSheet] = useState<Sheet>('rankings');
  const [pos, setPos] = useState<PosFilter>('ALL');
  const [search, setSearch] = useState('');
  const [alpha, setAlpha] = useState(0.95);
  const [collapsed, setCollapsed] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(loadFavs);

  // Default to the custom sheet once the user has built one.
  useEffect(() => {
    if (custom.order.length > 0) setSheet('custom');
  }, [custom.order.length > 0]);

  const rows = useMemo(
    () => buildBoard(players, sources, custom, session, bridge?.site),
    [players, sources, custom, session, bridge?.site],
  );
  const ctx = draftContext(session, settings);
  const activeSettings = session?.settings ?? settings;
  const starters =
    activeSettings.roster.QB + activeSettings.roster.RB + activeSettings.roster.WR +
    activeSettings.roster.TE + activeSettings.roster.FLEX + activeSettings.roster.DST +
    activeSettings.roster.K;
  const scoringLabel = { ppr: 'PPR', half: 'Half PPR', standard: 'Standard' }[activeSettings.scoring];

  const visible = useMemo(() => {
    const q = normalizeName(search);
    let list = rows.filter((r) => !r.picked);
    if (sheet === 'custom') {
      list = list
        .filter((r) => r.customRank != null)
        .sort((a, b) => a.customRank! - b.customRank!);
    } else {
      list = list
        .filter((r) => Number.isFinite(r.consensusRank))
        .sort((a, b) => a.consensusRank - b.consensusRank);
    }
    if (pos !== 'ALL') list = list.filter((r) => r.player.position === pos);
    if (q) list = list.filter((r) => normalizeName(r.player.name).includes(q));
    return list.slice(0, 175);
  }, [rows, sheet, pos, search]);

  const summary = useMemo(
    () => (sheet === 'custom' ? tierSummary(rows) : null),
    [rows, sheet],
  );

  const toggleFav = (id: string) => {
    const next = new Set(favs);
    next.has(id) ? next.delete(id) : next.add(id);
    setFavs(next);
    localStorage.setItem(FAVS_KEY, JSON.stringify([...next]));
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    void window.api.setCollapsed(next);
  };

  const gonePct = (row: BoardRow): number | null => {
    if (!session || ctx.complete || ctx.goneWindow <= 0) return null;
    const anchor =
      row.platformAdp ?? row.adp ?? (Number.isFinite(row.consensusRank) ? row.consensusRank : null);
    if (anchor == null) return null;
    const p = pickGoneProbability(anchor, ctx.currentOverall, ctx.goneWindow);
    return p >= 0.2 ? Math.min(99, Math.round(p * 100)) : null;
  };

  const showTierBreaks = sheet === 'custom';
  const showMyCol = sheet === 'rankings' && custom.order.length > 0;

  return (
    <div className="overlay-panel" style={{ ['--panel-alpha' as string]: alpha }}>
      <header className="overlay-header">
        <span className="brand">
          Draft Overlay
          <span className={`conn-dot ${bridge?.connected ? 'on' : ''}`} title={bridge?.connected ? 'Extension connected' : 'Extension not connected'} />
        </span>
        <span className="clock-note">
          {session
            ? ctx.complete
              ? 'Draft complete'
              : ctx.onClock
                ? 'ON THE CLOCK'
                : `Pick ${ctx.currentOverall} · ${ctx.picksUntilMyTurn} to you`
            : ''}
        </span>
        <button className="icon-btn" title="Refresh sources" onClick={() => void window.api.refreshSource()}>⟳</button>
        <input
          className="opacity-slider"
          type="range"
          min={0.35}
          max={1}
          step={0.01}
          value={alpha}
          title="Opacity"
          onChange={(e) => setAlpha(Number(e.target.value))}
        />
        <button className="icon-btn" title={collapsed ? 'Expand' : 'Collapse to bar'} onClick={toggleCollapsed}>
          {collapsed ? '＋' : '－'}
        </button>
        <button className="icon-btn" title="Hide overlay (⌘⇧O)" onClick={() => void window.api.toggleOverlay()}>✕</button>
      </header>

      {clickThrough && <div className="clickthrough-banner">Click-through on — ⌘⇧D to interact</div>}

      {!collapsed && (
        <>
          <nav className="sheet-tabs">
            <button className={sheet === 'rankings' ? 'active' : ''} onClick={() => setSheet('rankings')}>
              Rankings
            </button>
            <button className={sheet === 'custom' ? 'active' : ''} onClick={() => setSheet('custom')}>
              Custom Sheet
            </button>
            <button className={sheet === 'team' ? 'active' : ''} onClick={() => setSheet('team')}>
              Team
            </button>
          </nav>

          <div className="sheet-line">
            <span className="sheet-label">Draft Sheet</span>
            {activeSettings.teams}-Team · {scoringLabel} · Start {starters}
          </div>

          {sheet === 'team' ? (
            <RosterPanel />
          ) : (
            <>
              <input
                className="search"
                placeholder="Search players…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <nav className="pos-pills">
                {(['ALL', ...POSITIONS] as PosFilter[]).map((p) => (
                  <button key={p} className={pos === p ? 'active' : ''} onClick={() => setPos(p)}>
                    {p}
                  </button>
                ))}
              </nav>

              {summary && (
                <div className="tier-card">
                  <span className="tier-badge">{tierLetter(summary.tier)}</span>
                  <div className="tier-card-body">
                    <span className="tier-card-title">Highest tier available</span>
                    <span className="tier-card-sub">
                      Players still left in {tierLetter(summary.tier)} tier
                    </span>
                    <div className="tier-pills">
                      {POSITIONS.filter((p) => p === 'QB' || p === 'RB' || p === 'WR' || p === 'TE' || (summary.counts[p] ?? 0) > 0).map((p) => (
                        <span key={p} className="tier-pill" style={{ ['--pos-color' as string]: POSITION_COLORS[p] }}>
                          {p} <strong>{summary.counts[p] ?? 0}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {session && !ctx.complete && (
                <Recommendations rows={rows} session={session} settings={activeSettings} byId={byId} />
              )}

              <div className="board-head">
                <span className="bh-rank">#</span>
                <span className="bh-player">Player</span>
                {showMyCol && <span className="bh-src my">My</span>}
                {sources.map((s) => (
                  <span key={s.id} className="bh-src" title={s.label}>
                    {sourceShortLabel(s)}
                  </span>
                ))}
              </div>

              <ol className="board">
                {visible.map((row, i) => {
                  const prev = visible[i - 1];
                  const breakHere =
                    showTierBreaks && row.tier != null && (!prev || prev.tier !== row.tier);
                  const pct = gonePct(row);
                  const displayRank = sheet === 'custom' ? row.customRank! : Math.round(row.consensusRank);
                  return (
                    <Fragment key={row.player.id}>
                      {breakHere && (
                        <li className="tier-sep" aria-hidden>
                          <span className="tier-badge small">{tierLetter(row.tier!)}</span>
                          <span className="tier-sep-line" />
                        </li>
                      )}
                      <li className="player-row">
                        <button
                          className={`star ${favs.has(row.player.id) ? 'on' : ''}`}
                          title="Favorite"
                          onClick={() => toggleFav(row.player.id)}
                        >
                          {favs.has(row.player.id) ? '★' : '☆'}
                        </button>
                        <span className="rank-num">{displayRank}.</span>
                        <img
                          className="headshot"
                          src={headshotUrl(row.player)}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.visibility = 'hidden';
                          }}
                        />
                        <span className="player-cell">
                          <span className="player-name">{row.player.name}</span>
                          <span className="player-sub">
                            <span className="pos-tag" style={{ color: POSITION_COLORS[row.player.position] }}>
                              {row.player.position}
                            </span>
                            <span className="team-tag">{row.player.team ?? ''}</span>
                            {pct != null && <span className="gone-chip">{pct}% gets taken</span>}
                          </span>
                        </span>
                        {showMyCol && <span className="my-rank">{row.customRank ?? '–'}</span>}
                        {row.sourceRanks.map((r, j) => (
                          <span key={j} className="src-rank">{r ?? '–'}</span>
                        ))}
                      </li>
                    </Fragment>
                  );
                })}
              </ol>
            </>
          )}

          <footer className="overlay-footer">
            <button className="icon-btn" title="Undo last pick" onClick={() => void window.api.undo()}>
              ↩ Undo
            </button>
            <span className="muted small">
              {session ? `${session.picks.length} picked` : 'waiting for picks'}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
