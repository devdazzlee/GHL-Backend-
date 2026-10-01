import { useMemo } from 'react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
type Day = (typeof DAYS)[number];
type Hours = { opens: string; closes: string };
type Parsed = { mode: 'none' } | { mode: 'always' } | { mode: 'days'; days: Partial<Record<Day, Hours>> };

const DEFAULT_HOURS: Hours = { opens: '08:00', closes: '17:00' };

function parse(value: string | null | undefined): Parsed {
  if (!value) return { mode: 'none' };
  try {
    const v = JSON.parse(value);
    if (v?.open24x7) return { mode: 'always' };
    if (v?.days && typeof v.days === 'object') return { mode: 'days', days: v.days };
  } catch {
    // fall through
  }
  return { mode: 'none' };
}

function serialize(parsed: Parsed): string | null {
  if (parsed.mode === 'none') return null;
  if (parsed.mode === 'always') return JSON.stringify({ open24x7: true });
  return JSON.stringify({ days: parsed.days });
}

/**
 * Opening hours for the business schema (the hours Google can show for the business).
 * Value is the JSON the backend stores, or null when not set.
 */
export function OpeningHoursEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  const parsed = useMemo(() => parse(value), [value]);
  const set = (next: Parsed) => onChange(serialize(next));
  const days = parsed.mode === 'days' ? parsed.days : {};

  function setDay(day: Day, hours: Hours | null) {
    const next = { ...days };
    if (hours) next[day] = hours;
    else delete next[day];
    set({ mode: 'days', days: next });
  }

  const inputClass =
    'rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50';

  return (
    <div className="rounded-lg border border-slate-800 p-4">
      <p className="text-sm font-medium text-white">Opening hours</p>
      <p className="mt-1 text-xs text-slate-500">
        Shown to Google in the site's business details. Leave "Not set" if you don't know them; nothing is guessed.
      </p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
        {(
          [
            ['none', 'Not set'],
            ['always', 'Open 24/7'],
            ['days', 'Set days'],
          ] as const
        ).map(([mode, label]) => (
          <label key={mode} className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="opening-hours-mode"
              checked={parsed.mode === mode}
              disabled={disabled}
              onChange={() =>
                set(
                  mode === 'days'
                    ? { mode: 'days', days: Object.fromEntries(DAYS.slice(0, 5).map((d) => [d, DEFAULT_HOURS])) }
                    : ({ mode } as Parsed),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
      {parsed.mode === 'days' ? (
        <div className="mt-3 space-y-2">
          {DAYS.map((day) => {
            const hours = days[day];
            return (
              <div key={day} className="flex flex-wrap items-center gap-3 text-sm">
                <label className="inline-flex w-36 items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={Boolean(hours)}
                    disabled={disabled}
                    onChange={(e) => setDay(day, e.target.checked ? DEFAULT_HOURS : null)}
                  />
                  {day}
                </label>
                {hours ? (
                  <>
                    <input
                      type="time"
                      aria-label={`${day} opens`}
                      value={hours.opens}
                      disabled={disabled}
                      onChange={(e) => setDay(day, { ...hours, opens: e.target.value })}
                      className={inputClass}
                    />
                    <span className="text-slate-500">to</span>
                    <input
                      type="time"
                      aria-label={`${day} closes`}
                      value={hours.closes}
                      disabled={disabled}
                      onChange={(e) => setDay(day, { ...hours, closes: e.target.value })}
                      className={inputClass}
                    />
                  </>
                ) : (
                  <span className="text-slate-500">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
