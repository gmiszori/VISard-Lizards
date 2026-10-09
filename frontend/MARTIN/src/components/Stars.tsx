import { useState } from 'react';
import type { RatingSummary } from '../lib/types';
import { avg1 } from '../lib/format';
import { Icon } from './Icon';

const FIVE = [1, 2, 3, 4, 5];

/** Read-only star row with fractional fill. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="stars" style={{ width: size * 5 }} aria-hidden="true">
      <span className="stars__base">
        {FIVE.map((i) => (
          <Icon key={i} name="star" size={size} />
        ))}
      </span>
      <span className="stars__fill" style={{ width: `${Math.max(0, Math.min(5, value)) * 20}%` }}>
        {FIVE.map((i) => (
          <Icon key={i} name="star" size={size} filled />
        ))}
      </span>
    </span>
  );
}

/** Stars + "4.3 · 28" or "No ratings yet". */
export function RatingLine({ rating, size = 13 }: { rating: RatingSummary; size?: number }) {
  if (rating.count === 0) {
    return <span className="rating rating--none">No ratings yet</span>;
  }
  return (
    <span className="rating" aria-label={`Rated ${avg1(rating.average)} out of 5 by ${rating.count} people`}>
      <Stars value={rating.average} size={size} />
      <span className="num rating__avg">{avg1(rating.average)}</span>
      <span className="num rating__count">({rating.count})</span>
    </span>
  );
}

interface InputProps {
  value: number;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
  label: string;
  size?: number;
}

/** 1–5 star picker. Radio semantics: arrow keys move, buttons are 44 px. */
export function StarInput({ value, onChange, label, size = 30 }: InputProps) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="starinput" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
      {FIVE.map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          tabIndex={value === i || (value === 0 && i === 1) ? 0 : -1}
          className={`starinput__btn${shown >= i ? ' is-on' : ''}`}
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange(i as 1 | 2 | 3 | 4 | 5)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              onChange(Math.min(5, i + 1) as 1 | 2 | 3 | 4 | 5);
              (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(Math.max(1, i - 1) as 1 | 2 | 3 | 4 | 5);
              (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
            }
          }}
        >
          <Icon name="star" size={size} filled={shown >= i} />
        </button>
      ))}
    </div>
  );
}

/** Distribution bars, 5 → 1 star, for the rating summary. */
export function Distribution({ rating }: { rating: RatingSummary }) {
  const max = Math.max(1, ...rating.distribution);
  return (
    <div className="dist" role="list" aria-label="Rating distribution">
      {[5, 4, 3, 2, 1].map((s) => {
        const n = rating.distribution[s - 1] ?? 0;
        return (
          <div className="dist__row" role="listitem" key={s} aria-label={`${s} stars: ${n} ratings`}>
            <span className="num dist__label">{s}</span>
            <span className="dist__track">
              <span className="dist__bar" style={{ width: `${(n / max) * 100}%` }} />
            </span>
            <span className="num dist__n">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Big average number with stars, next to the distribution. */
export function RatingSummaryBlock({ rating, aspects }: { rating: RatingSummary; aspects?: boolean }) {
  if (rating.count === 0) {
    return <p className="muted">No ratings yet. Be the first to rate it.</p>;
  }
  return (
    <div className="ratingsum">
      <div className="ratingsum__score">
        <span className="num ratingsum__avg">{avg1(rating.average)}</span>
        <Stars value={rating.average} size={16} />
        <span className="num muted">{rating.count} ratings</span>
      </div>
      <Distribution rating={rating} />
      {aspects && rating.aspects && (
        <dl className="aspects">
          {(['food', 'queue', 'seating', 'value'] as const).map((a) => (
            <div key={a}>
              <dt>{a[0]?.toUpperCase()}{a.slice(1)}</dt>
              <dd className="num">{rating.aspects?.[a]?.toFixed(1) ?? '–'}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
