import { campusById, formatDistance } from '../lib/geo';
import type { MensaGroup as Group } from '../lib/rank';
import type { PriceCategory, Service } from '../lib/types';
import { StatusPills, stagger } from './Bits';
import { Icon } from './Icon';
import { MealCard } from './MealCard';

interface Props {
  group: Group;
  price: PriceCategory;
  service: Service;
  /** Running index of the first card, for the staggered entrance. */
  start: number;
}

/** One mensa on the Today feed: header with live status, then its tickets. */
export function MensaGroup({ group, price, service, start }: Props) {
  const { mensa } = group;
  const campusName = campusById(mensa.campusId)?.name;
  return (
    <section className={`group fade-up${group.offered ? '' : ' group--closed'}`} style={stagger(start)} aria-label={mensa.name}>
      <header className="group__head">
        <div>
          <h2 className="group__name">
            <a href={`/mensa/${mensa.id}`}>{mensa.name}</a>
            {group.isFavourite && (
              <span className="group__fav" title="Favourite">
                <Icon name="star" size={16} filled />
                <span className="sr-only">Favourite</span>
              </span>
            )}
          </h2>
          <p className="group__meta">
            <Icon name="pin" size={14} />
            <span className="num">{formatDistance(group.distanceM)}</span>
            <span aria-hidden="true">·</span>
            <span>{campusName}</span>
          </p>
        </div>
        <StatusPills open={group.open} crowd={group.crowd} />
      </header>

      {!group.offered ? (
        <p className="group__closednote">
          No {service} today. {mensa.name} is closed for {service}.
        </p>
      ) : (
        group.views.map((v, i) => <MealCard key={v.meal.id} meal={v.meal} price={price} index={start + i + 1} />)
      )}
    </section>
  );
}
