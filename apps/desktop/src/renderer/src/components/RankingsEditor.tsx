import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { autoTierStarts, customTiers, type Player } from '@draft-overlay/shared';
import { useMemo } from 'react';
import { useApp, usePlayersById } from '../store';
import { tierColor, tierLetter } from '../lib/derived';

function SortableRow({
  id,
  index,
  player,
  tier,
  isTierStart,
  onToggleBreak,
  onRemove,
}: {
  id: string;
  index: number;
  player: Player;
  tier: number;
  isTierStart: boolean;
  onToggleBreak: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isTierStart && index > 0 ? 'tier-start' : ''}
    >
      <span className="drag-handle" {...attributes} {...listeners}>
        ⠿
      </span>
      <span className="rank-num">{index + 1}</span>
      <span className="tier-dot" style={{ background: tierColor(tier) }} />
      <span className="player-name">
        {player.name} <span className="muted small">{player.position} {player.team ?? ''}</span>
      </span>
      <button
        className={`mini tier-toggle ${isTierStart && index > 0 ? 'on' : ''}`}
        title={
          isTierStart && index > 0
            ? `Starts ${tierLetter(tier)} tier — click to merge into the tier above`
            : `In ${tierLetter(tier)} tier — click to start a new tier here`
        }
        onClick={onToggleBreak}
      >
        {tierLetter(tier)}
      </button>
      <button className="mini" title="Remove from my rankings" onClick={onRemove}>
        ✕
      </button>
    </li>
  );
}

export default function RankingsEditor() {
  const custom = useApp((s) => s.custom);
  const sources = useApp((s) => s.sources);
  const saveCustom = useApp((s) => s.saveCustom);
  const byId = usePlayersById();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Mirror the overlay: manual breaks when the user has drawn any, otherwise
  // the same ADP-gap tiers the board shows, so both screens agree.
  const tiers = useMemo(() => {
    if (custom.tierStarts.length > 0) return customTiers(custom);
    const adpFor = (id: string) => {
      for (const source of sources) {
        const adp = source.entries[id]?.adp;
        if (adp != null) return adp;
      }
      return undefined;
    };
    const tierable = custom.order
      .filter((id) => byId.has(id))
      .map((id, i) => ({ id, value: adpFor(id) ?? i + 1 }));
    const starts = new Set(autoTierStarts(tierable));
    const out = new Map<string, number>();
    let tier = 1;
    for (const { id } of tierable) {
      if (starts.has(id)) tier++;
      out.set(id, tier);
    }
    return out;
  }, [custom, sources, byId]);

  const autoTiered = custom.tierStarts.length === 0;

  const cloneFrom = (sourceId: string) => {
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return;
    const ordered = Object.entries(source.entries).sort((a, b) => a[1].rank - b[1].rank);
    const order = ordered.map(([id]) => id).filter((id) => byId.has(id));
    // Preserve tier boundaries when the source has them (e.g. FantasyPros CSVs).
    const tierStarts: string[] = [];
    let prevTier: number | undefined;
    for (const [id, entry] of ordered) {
      if (!byId.has(id)) continue;
      if (entry.tier != null && entry.tier !== prevTier) {
        tierStarts.push(id);
        prevTier = entry.tier;
      }
    }
    void saveCustom({ order, tierStarts });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = custom.order.indexOf(String(active.id));
    const to = custom.order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    void saveCustom({ ...custom, order: arrayMove(custom.order, from, to) });
  };

  const toggleBreak = (id: string) => {
    // The first player already begins tier 1; a break there would be recorded
    // but never render, which reads as a dead button.
    if (custom.order[0] === id) return;
    const tierStarts = custom.tierStarts.includes(id)
      ? custom.tierStarts.filter((t) => t !== id)
      : [...custom.tierStarts, id];
    void saveCustom({ ...custom, tierStarts });
  };

  const remove = (id: string) => {
    void saveCustom({
      order: custom.order.filter((o) => o !== id),
      tierStarts: custom.tierStarts.filter((t) => t !== id),
    });
  };

  const exportCsv = () => {
    const lines = ['Rank,Tier,Player,Team,Pos'];
    custom.order.forEach((id, i) => {
      const p = byId.get(id);
      if (!p) return;
      const name = p.name.includes(',') ? `"${p.name}"` : p.name;
      lines.push(`${i + 1},${tiers.get(id) ?? 1},${name},${p.team ?? ''},${p.position}`);
    });
    void window.api.exportCustomCsv(lines.join('\n'));
  };

  if (custom.order.length === 0) {
    return (
      <div>
        <p className="muted">
          No custom rankings yet. Clone a provider list as a starting point, then drag to
          reorder and add tier breaks.
        </p>
        <div className="row-buttons">
          {sources.map((s) => (
            <button key={s.id} onClick={() => cloneFrom(s.id)}>
              Clone {s.label}
            </button>
          ))}
        </div>
        {sources.length === 0 && (
          <p className="muted small">Refresh or import a source first (Ranking sources panel).</p>
        )}
      </div>
    );
  }

  return (
    <div className="rankings-editor">
      <div className="row-buttons">
        <button onClick={exportCsv}>Export CSV</button>
        <button onClick={() => void saveCustom({ order: [], tierStarts: [] })}>Clear</button>
        {!autoTiered && (
          <button
            title="Discard your tier breaks and go back to automatic ADP-gap tiers"
            onClick={() => void saveCustom({ ...custom, tierStarts: [] })}
          >
            Reset tiers to auto
          </button>
        )}
      </div>
      <p className="muted small">
        {autoTiered
          ? 'Tiers are set automatically from gaps in ADP. Click a tier letter to draw your own break.'
          : 'Using your manual tier breaks. Click a highlighted letter to merge it back up.'}
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={custom.order} strategy={verticalListSortingStrategy}>
          <ul className="editor-list">
            {custom.order.map((id, index) => {
              const player = byId.get(id);
              if (!player) return null;
              return (
                <SortableRow
                  key={id}
                  id={id}
                  index={index}
                  player={player}
                  tier={tiers.get(id) ?? 1}
                  isTierStart={custom.tierStarts.includes(id)}
                  onToggleBreak={() => toggleBreak(id)}
                  onRemove={() => remove(id)}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
