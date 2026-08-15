import type { RosterSlots, ScoringFormat } from '@draft-overlay/shared';
import { useApp } from '../store';

const SLOT_KEYS: Array<keyof RosterSlots> = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BENCH'];

export default function SettingsForm() {
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);
  const session = useApp((s) => s.session);

  const update = (patch: Partial<typeof settings>) => void saveSettings({ ...settings, ...patch });

  return (
    <div className="settings-form">
      {session && (
        <p className="muted small">A draft is active — changes apply to the next draft you start.</p>
      )}
      <label>
        Teams
        <input
          type="number"
          min={4}
          max={20}
          value={settings.teams}
          onChange={(e) => update({ teams: Math.max(2, Number(e.target.value) || 12) })}
        />
      </label>
      <label>
        My slot
        <input
          type="number"
          min={1}
          max={settings.teams}
          value={settings.mySlot}
          onChange={(e) =>
            update({ mySlot: Math.min(settings.teams, Math.max(1, Number(e.target.value) || 1)) })
          }
        />
      </label>
      <label>
        Scoring
        <select
          value={settings.scoring}
          onChange={(e) => update({ scoring: e.target.value as ScoringFormat })}
        >
          <option value="ppr">PPR</option>
          <option value="half">Half PPR</option>
          <option value="standard">Standard</option>
        </select>
      </label>
      <div className="roster-slots">
        {SLOT_KEYS.map((key) => (
          <label key={key}>
            {key}
            <input
              type="number"
              min={0}
              max={12}
              value={settings.roster[key]}
              onChange={(e) =>
                update({
                  roster: { ...settings.roster, [key]: Math.max(0, Number(e.target.value) || 0) },
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}
