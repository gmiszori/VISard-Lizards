import { useState } from 'react';
import { submitCrowdReport, submitMealRating, submitMensaRating } from '../lib/api';
import { CROWD_LABEL } from '../lib/crowd';
import { MEAL_TAGS, TAG_LABEL } from '../lib/format';
import { announce, bumpData, recordCrowdReport, recordMealRating, recordMensaRating } from '../lib/store';
import type { CrowdLevel, MealTag, MensaAspect } from '../lib/types';
import { StarInput } from './Stars';

type Stars = 1 | 2 | 3 | 4 | 5;

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong';
}

// ───────── crowd ─────────

const LEVELS: CrowdLevel[] = [1, 2, 3, 4, 5];

/** Five tappable bars of rising height: Empty … Packed. */
export function CrowdScale({ value, onChange }: { value: CrowdLevel | null; onChange: (l: CrowdLevel) => void }) {
  return (
    <div className="scale" role="radiogroup" aria-label="How full is it right now?">
      {LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          className={`scale__item${value === l ? ' is-on' : ''}`}
          onClick={() => onChange(l)}
        >
          <span className="scale__bar" style={{ height: `${18 + l * 14}px` }} aria-hidden="true" />
          <span className="scale__label">{CROWD_LABEL[l]}</span>
        </button>
      ))}
    </div>
  );
}

export function CrowdForm({
  mensaId,
  mensaName,
  onDone,
  onSkip,
  primaryLabel = 'Send report',
}: {
  mensaId: string;
  mensaName: string;
  onDone: () => void;
  onSkip?: () => void;
  primaryLabel?: string;
}) {
  const [level, setLevel] = useState<CrowdLevel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!level) return;
    setBusy(true);
    setError(null);
    try {
      const report = await submitCrowdReport(mensaId, level);
      recordCrowdReport(report);
      bumpData();
      announce(`Thanks. Reported ${CROWD_LABEL[level].toLowerCase()} at ${mensaName}.`);
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <CrowdScale value={level} onChange={setLevel} />
      {error && (
        <p className="form__error" role="alert">
          Couldn't send the report. {error}
        </p>
      )}
      <div className="form__actions">
        {onSkip && (
          <button type="button" className="btn btn--ghost" onClick={onSkip} disabled={busy}>
            Skip
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={send} disabled={!level || busy}>
          {busy ? 'Sending…' : primaryLabel}
        </button>
      </div>
    </div>
  );
}

// ───────── meal rating ─────────

export function TagPicker({ value, onChange }: { value: MealTag[]; onChange: (t: MealTag[]) => void }) {
  return (
    <div className="tags" role="group" aria-label="Quick tags">
      {MEAL_TAGS.map((t) => {
        const on = value.includes(t);
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            className={`chip${on ? ' is-on' : ''}`}
            onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}
          >
            {TAG_LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}

export function MealRatingForm({
  meal,
  onDone,
  onSkip,
  primaryLabel = 'Send rating',
}: {
  meal: { id: string; mensaId: string; title: string };
  onDone: () => void;
  onSkip?: () => void;
  primaryLabel?: string;
}) {
  const [stars, setStars] = useState<0 | Stars>(0);
  const [tags, setTags] = useState<MealTag[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!stars) return;
    setBusy(true);
    setError(null);
    try {
      const r = await submitMealRating({ mealId: meal.id, mensaId: meal.mensaId, stars, tags, mealTitle: meal.title });
      recordMealRating(r);
      bumpData();
      announce(`Thanks. You rated ${meal.title} ${stars} out of 5.`);
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <StarInput value={stars} onChange={setStars} label={`Your rating for ${meal.title}`} />
      <p className="form__label">What stood out? <span className="muted">Optional</span></p>
      <TagPicker value={tags} onChange={setTags} />
      {error && (
        <p className="form__error" role="alert">
          Couldn't send the rating. {error}
        </p>
      )}
      <div className="form__actions">
        {onSkip && (
          <button type="button" className="btn btn--ghost" onClick={onSkip} disabled={busy}>
            Skip
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={send} disabled={!stars || busy}>
          {busy ? 'Sending…' : primaryLabel}
        </button>
      </div>
    </div>
  );
}

// ───────── mensa rating ─────────

const ASPECTS: Array<{ key: MensaAspect; label: string }> = [
  { key: 'food', label: 'Food' },
  { key: 'queue', label: 'Queue' },
  { key: 'seating', label: 'Seating' },
  { key: 'value', label: 'Value' },
];

function AspectRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="aspect" role="radiogroup" aria-label={`${label} (optional)`}>
      <span className="aspect__label">{label}</span>
      <span className="aspect__scale">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${label}: ${n} of 5`}
            className={`aspect__dot num${value === n ? ' is-on' : ''}`}
            onClick={() => onChange(value === n ? 0 : n)}
          >
            {n}
          </button>
        ))}
      </span>
    </div>
  );
}

export function MensaRatingForm({
  mensa,
  onDone,
}: {
  mensa: { id: string; name: string };
  onDone: () => void;
}) {
  const [stars, setStars] = useState<0 | Stars>(0);
  const [aspects, setAspects] = useState<Partial<Record<MensaAspect, number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!stars) return;
    setBusy(true);
    setError(null);
    try {
      const clean = Object.fromEntries(Object.entries(aspects).filter(([, v]) => v && v > 0)) as Partial<Record<MensaAspect, number>>;
      const r = await submitMensaRating({ mensaId: mensa.id, stars, aspects: clean });
      recordMensaRating(r);
      bumpData();
      announce(`Thanks. You rated ${mensa.name} ${stars} out of 5.`);
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <StarInput value={stars} onChange={setStars} label={`Your rating for ${mensa.name}`} />
      <p className="form__label">Rate the details <span className="muted">Optional</span></p>
      <div className="aspects-input">
        {ASPECTS.map((a) => (
          <AspectRow key={a.key} label={a.label} value={aspects[a.key] ?? 0} onChange={(v) => setAspects({ ...aspects, [a.key]: v })} />
        ))}
      </div>
      {error && (
        <p className="form__error" role="alert">
          Couldn't send the rating. {error}
        </p>
      )}
      <div className="form__actions">
        <button type="button" className="btn btn--primary" onClick={send} disabled={!stars || busy}>
          {busy ? 'Sending…' : 'Send rating'}
        </button>
      </div>
    </div>
  );
}
