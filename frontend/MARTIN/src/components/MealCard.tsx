import { useStore } from '@nanostores/react';
import { announce, lastEaten, setLastEaten } from '../lib/store';
import type { Meal, PriceCategory } from '../lib/types';
import { DietTag, Price, stagger } from './Bits';
import { Icon } from './Icon';
import { MealImage } from './MealImage';
import { RatingLine } from './Stars';

interface Props {
  meal: Meal;
  price: PriceCategory;
  /** Index for the staggered fade-up. */
  index?: number;
  /** Shows the mensa name above the line (used outside mensa groups). */
  mensaName?: string;
  compact?: boolean;
}

export function Facts({ meal }: { meal: Meal }) {
  const n = meal.nutrition;
  const protein = n?.proteinG;
  const kcal = n?.kcal;
  if (protein === undefined && kcal === undefined) {
    return <p className="facts facts--none">No nutrition data</p>;
  }
  return (
    <p className="facts">
      {protein !== undefined && (
        <span>
          <span className="num facts__v">{protein}</span> g protein
        </span>
      )}
      {kcal !== undefined && (
        <span>
          <span className="num facts__v">{kcal}</span> kcal
        </span>
      )}
    </p>
  );
}

/** Tray-ticket meal card. The whole ticket links to the detail page; the button sits above the link. */
export function MealCard({ meal, price, index = 0, mensaName, compact = false }: Props) {
  const eaten = useStore(lastEaten);
  const isEating = eaten?.mealId === meal.id;

  function toggleEating() {
    if (isEating) {
      setLastEaten(null);
      announce(`Removed ${meal.title} from what you're eating.`);
    } else {
      setLastEaten({ mealId: meal.id, mensaId: meal.mensaId, date: meal.date, title: meal.title });
      announce(`Marked ${meal.title} as what you're eating. We'll ask how it was next time.`);
    }
  }

  return (
    <article className={`ticket fade-up${compact ? ' ticket--compact' : ''}`} style={stagger(index)}>
      <div className="ticket__main">
        <MealImage meal={meal} className="ticket__img" />
        <div className="ticket__body">
          <p className="ticket__line">
            {mensaName && <span className="ticket__mensa">{mensaName}</span>}
            <span className="ticket__lineName">{meal.line}</span>
            <DietTag tag={meal.dietTag} />
          </p>
          <h3 className="ticket__title">
            <a className="ticket__link" href={`/meal/${meal.id}`}>
              {meal.title}
            </a>
          </h3>
          {meal.sides.length > 0 && <p className="ticket__sides">{meal.sides.join(' · ')}</p>}
        </div>
      </div>
      <div className="ticket__perf" aria-hidden="true" />
      <div className="ticket__foot">
        <div className="ticket__row">
          <Price value={meal.price[price]} />
          <Facts meal={meal} />
        </div>
        <div className="ticket__row">
          <RatingLine rating={meal.rating} />
          <button
            type="button"
            className={`btn btn--sm ${isEating ? 'btn--done' : 'btn--primary'}`}
            aria-pressed={isEating}
            onClick={toggleEating}
          >
            {isEating ? (
              <>
                <Icon name="check" size={16} /> Eating this
              </>
            ) : (
              "I'm eating this"
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
