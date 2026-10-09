import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { getMeal } from '../lib/api';
import { PRICE_LABEL, timeAgo } from '../lib/format';
import { useAsync, useMensas, useNow } from '../lib/hooks';
import { announce, lastEaten, myMealRatings, priceCategory, setLastEaten } from '../lib/store';
import { parseISODate } from '../lib/time';
import type { MealDetail } from '../lib/types';
import { DietTag, EmptyState, ErrorState, Price, Section } from './Bits';
import { MealRatingForm } from './Forms';
import { Gate } from './Gate';
import { Icon } from './Icon';
import { MealImage } from './MealImage';
import { Sheet } from './Sheet';
import { DetailSkeleton } from './Skeletons';
import { RatingSummaryBlock, Stars } from './Stars';

function Nutrition({ meal }: { meal: MealDetail }) {
  const n = meal.nutrition;
  const rows: Array<[string, number | undefined, string]> = [
    ['Protein', n?.proteinG, 'g'],
    ['Energy', n?.kcal, 'kcal'],
    ['Carbohydrates', n?.carbsG, 'g'],
    ['Fat', n?.fatG, 'g'],
  ];
  if (rows.every(([, v]) => v === undefined)) {
    return <p className="muted">The kitchen hasn't published nutrition values for this dish.</p>;
  }
  return (
    <dl className="spec">
      {rows
        .filter(([, v]) => v !== undefined)
        .map(([label, v, unit]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <span className="num spec__v">{v}</span> {unit}
            </dd>
          </div>
        ))}
    </dl>
  );
}

function MealDetailView({ mealId }: { mealId: string }) {
  const now = useNow();
  const meal = useAsync(() => getMeal(mealId), [mealId]);
  const mensas = useMensas();
  const price = useStore(priceCategory);
  const eaten = useStore(lastEaten);
  const mine = useStore(myMealRatings)[mealId];
  const [rateOpen, setRateOpen] = useState(false);

  if (meal.status === 'error' && !meal.data) {
    return (
      <div className="page-pad">
        <a className="backlink" href="/"><Icon name="arrow-left" size={18} /> Today</a>
        <ErrorState error={meal.error} onRetry={meal.reload} />
      </div>
    );
  }
  if (!meal.data) return <DetailSkeleton />;

  const m = meal.data;
  const mensa = mensas.data?.find((x) => x.id === m.mensaId);
  const isEating = eaten?.mealId === m.id;
  const served = parseISODate(m.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  function toggleEating() {
    if (isEating) {
      setLastEaten(null);
      announce(`Removed ${m.title} from what you're eating.`);
    } else {
      setLastEaten({ mealId: m.id, mensaId: m.mensaId, date: m.date, title: m.title });
      announce(`Marked ${m.title} as what you're eating. We'll ask how it was next time.`);
    }
  }

  return (
    <div className="page-pad">
      <a className="backlink" href={mensa ? `/mensa/${mensa.id}` : '/'}>
        <Icon name="arrow-left" size={18} /> {mensa?.name ?? 'Today'}
      </a>

      <MealImage meal={m} className="hero" />

      <header className="pagehead pagehead--detail">
        <p className="kicker">
          {m.line} · {m.service === 'lunch' ? 'Lunch' : 'Dinner'} · {served}
        </p>
        <h1 className="h1">{m.title}</h1>
        {m.sides.length > 0 && <p className="lede">{m.sides.join(' · ')}</p>}
        <div className="meta-row">
          <DietTag tag={m.dietTag} />
          {mensa && (
            <a className="textlink" href={`/mensa/${mensa.id}`}>
              {mensa.name}
            </a>
          )}
        </div>
        {m.description && <p className="body-copy">{m.description}</p>}
        <div className="actions">
          <button type="button" className={`btn ${isEating ? 'btn--done' : 'btn--primary'}`} aria-pressed={isEating} onClick={toggleEating}>
            {isEating ? (
              <>
                <Icon name="check" size={18} /> Eating this
              </>
            ) : (
              "I'm eating this"
            )}
          </button>
        </div>
      </header>

      <Section title="Price">
        <div className="pricetable" role="table" aria-label="Prices by category">
          {(['student', 'staff', 'external'] as const).map((c) => (
            <div key={c} role="row" className={`pricetable__cell${c === price ? ' is-on' : ''}`}>
              <span role="rowheader" className="pricetable__label">{PRICE_LABEL[c]}</span>
              <span role="cell"><Price value={m.price[c]} size={c === price ? 'lg' : 'md'} /></span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Nutrition">
        <Nutrition meal={m} />
      </Section>

      <Section title="Allergens & origin">
        <dl className="spec spec--stack">
          <div>
            <dt>Allergens</dt>
            <dd>
              {m.allergens.length ? (
                <ul className="chips">
                  {m.allergens.map((a) => (
                    <li className="chip chip--static" key={a}>{a}</li>
                  ))}
                </ul>
              ) : (
                <span className="muted">None declared</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Origin</dt>
            <dd>{m.origin ?? <span className="muted">Not stated</span>}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Ratings">
        <RatingSummaryBlock rating={m.rating} />
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={() => setRateOpen(true)}>
            <Icon name="star" size={18} /> {mine ? 'Change your rating' : 'Rate this meal'}
          </button>
          {mine && (
            <span className="muted yourrating">
              You gave <Stars value={mine.stars} size={13} /> <span className="num">{mine.stars}</span>
            </span>
          )}
        </div>
      </Section>

      <Section title="Reviews">
        {m.reviews.length === 0 ? (
          <EmptyState icon="people" title="No written reviews yet">
            Ratings with a few words help others choose. Tap "Rate this meal" to add yours.
          </EmptyState>
        ) : (
          <ul className="reviews">
            {m.reviews.map((r) => (
              <li key={r.id} className="review">
                <div className="review__top">
                  <Stars value={r.stars} size={12} />
                  <span className="muted review__who">
                    {r.author} · {timeAgo(`${r.date}T12:00:00`, now)}
                  </span>
                </div>
                <p>{r.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Sheet open={rateOpen} onClose={() => setRateOpen(false)} kicker="Rate" title={m.title}>
        <MealRatingForm meal={m} onDone={() => setRateOpen(false)} />
      </Sheet>
    </div>
  );
}

export default function MealDetailApp({ mealId }: { mealId: string }) {
  return (
    <Gate fallback={<DetailSkeleton />}>
      <MealDetailView mealId={mealId} />
    </Gate>
  );
}
