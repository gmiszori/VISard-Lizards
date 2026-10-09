import type { CSSProperties, ReactNode } from 'react';
import { CROWD_LABEL, type CrowdNow } from '../lib/crowd';
import { splitPrice } from '../lib/format';
import { openStateLabel, type OpenState } from '../lib/time';
import type { DietTag as Diet } from '../lib/types';
import { Icon } from './Icon';

const DIET_TEXT: Record<Diet, string> = { vegan: 'Vegan', vegetarian: 'Vegetarian', meat: 'Meat', fish: 'Fish' };

/** Diet marker: a colour square plus the word, never colour alone. */
export function DietTag({ tag }: { tag: Diet }) {
  return (
    <span className={`diet diet--${tag}`}>
      <span className="diet__dot" aria-hidden="true" />
      {DIET_TEXT[tag]}
    </span>
  );
}

/** Menu-board price: tiny CHF, big number, small cents. */
export function Price({ value, size = 'md' }: { value: number; size?: 'md' | 'lg' | 'sm' }) {
  const { whole, cents } = splitPrice(value);
  return (
    <span className={`price price--${size}`} aria-label={`${whole}.${cents} Swiss francs`}>
      <span className="price__cur" aria-hidden="true">CHF</span>
      <span className="price__whole num" aria-hidden="true">{whole}</span>
      <span className="price__cents num" aria-hidden="true">.{cents}</span>
    </span>
  );
}

/** Five tiny bars: the first `level` are filled. */
export function CrowdBars({ level, size = 14 }: { level: number; size?: number }) {
  return (
    <span className="crowdbars" style={{ height: size }} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= level ? 'is-on' : ''} style={{ height: `${30 + i * 14}%` }} />
      ))}
    </span>
  );
}

/** Open/closed + live crowd, shown in group headers and mensa rows. */
export function StatusPills({ open, crowd }: { open: OpenState; crowd: CrowdNow | null }) {
  const isOpen = open.kind === 'open';
  return (
    <div className="pills">
      <span className={`pill ${isOpen ? 'pill--open' : 'pill--closed'}`}>
        <Icon name="clock" size={13} />
        {openStateLabel(open)}
      </span>
      {isOpen && <CrowdPill crowd={crowd} />}
    </div>
  );
}

export function CrowdPill({ crowd }: { crowd: CrowdNow | null }) {
  if (!crowd) return <span className="pill pill--muted">No crowd data</span>;
  const label = CROWD_LABEL[crowd.level];
  const live = crowd.source === 'live';
  return (
    <span className={`pill pill--crowd${crowd.level >= 4 ? ' is-hot' : ''}${live ? ' is-live' : ''}`}>
      <CrowdBars level={crowd.level} size={13} />
      {live ? `${label} now` : `Usually ${label.toLowerCase()}`}
    </span>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="block">
      <header className="block__head">
        <h2 className="h2">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon = 'plate',
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: 'plate' | 'eye-off' | 'clock' | 'people' | 'filter';
}) {
  return (
    <div className="empty" role="status">
      <Icon name={icon} size={30} />
      <h3 className="empty__title">{title}</h3>
      {children && <p className="empty__text">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error?: Error; onRetry: () => void }) {
  return (
    <div className="empty empty--error" role="alert">
      <h3 className="empty__title">Couldn't load the menu</h3>
      <p className="empty__text">
        The server didn't answer. Your favourites and filters are safe.
        {error?.message ? <span className="empty__detail num"> {error.message}</span> : null}
      </p>
      <button type="button" className="btn btn--primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** Wraps a staggered fade-up. `i` is the child index (capped). */
export function stagger(i: number): CSSProperties {
  return { ['--i' as string]: Math.min(i, 9) } as CSSProperties;
}
