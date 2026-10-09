import { useStore } from '@nanostores/react';
import { useMemo, useState } from 'react';
import { useBoardData, useNow, useRefPoint, useVisibleMensas } from '../lib/hooks';
import { buildBoard, topRecommendations, type Prefs } from '../lib/rank';
import {
  dietFilter,
  favouriteMensaIds,
  hiddenMensaIds,
  maxKcal,
  minProtein,
  priceCategory,
  resetFilters,
  sortMode,
} from '../lib/store';
import { defaultService, formatDateLong, isoWeek } from '../lib/time';
import type { Service } from '../lib/types';
import { EmptyState, ErrorState } from './Bits';
import { CampusPicker } from './CampusPicker';
import { FilterBar, Segmented } from './FilterBar';
import { Gate } from './Gate';
import { Icon } from './Icon';
import { MealCard } from './MealCard';
import { MensaGroup } from './MensaGroup';
import { FeedSkeleton, TodaySkeleton } from './Skeletons';

const SERVICES: Array<{ id: Service; label: string }> = [
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
];

function Today() {
  const now = useNow();
  const [picked, setPicked] = useState<Service | null>(null);
  const [campusOpen, setCampusOpen] = useState(false);
  const service = picked ?? defaultService(now);

  const favourites = useStore(favouriteMensaIds);
  const hidden = useStore(hiddenMensaIds);
  const diet = useStore(dietFilter);
  const protein = useStore(minProtein);
  const kcal = useStore(maxKcal);
  const price = useStore(priceCategory);
  const sort = useStore(sortMode);

  const mensas = useVisibleMensas();
  const ref = useRefPoint(mensas.data);
  const data = useBoardData(mensas.visible, now);

  const prefs: Prefs = useMemo(
    () => ({ favourites, diet, minProtein: protein, maxKcal: kcal, price, sort }),
    [favourites, diet, protein, kcal, price, sort],
  );

  const board = useMemo(() => {
    if (!mensas.visible || !data.data) return null;
    return buildBoard({
      mensas: mensas.visible,
      menus: data.data.menus,
      crowds: data.data.crowds,
      ref: ref.point,
      now,
      service,
      prefs,
    });
  }, [mensas.visible, data.data, ref.point, now, service, prefs]);

  const recs = useMemo(() => (board ? topRecommendations(board.groups, prefs) : []), [board, prefs]);

  const error = mensas.status === 'error' ? mensas.error : data.status === 'error' && !data.data ? data.error : undefined;
  const allHidden = mensas.data !== undefined && mensas.visible?.length === 0;
  const loading = !error && !allHidden && !board;
  const other: Service = service === 'lunch' ? 'dinner' : 'lunch';

  const active = board?.groups.filter((g) => g.offered && g.views.length > 0) ?? [];
  const closed = board?.groups.filter((g) => !g.offered) ?? [];

  return (
    <>
      <header className="masthead">
        <div className="masthead__top">
          <p className="wordmark">Tablett</p>
          <button type="button" className="locbtn" onClick={() => setCampusOpen(true)} aria-label={`Campus: ${ref.label}. Change`}>
            <Icon name="pin" size={16} />
            <span>{ref.isDefault ? 'Set campus' : ref.located ? `Near ${ref.label}` : ref.label}</span>
            <Icon name="chevron-down" size={16} />
          </button>
        </div>
        <h1 className="masthead__date">{formatDateLong(now)}</h1>
        <p className="masthead__sub num">Week {isoWeek(now)}</p>
        <Segmented<Service> label="Meal service" value={service} options={SERVICES} onChange={setPicked} className="seg--big" />
      </header>

      <FilterBar shown={board?.shown ?? 0} hiddenNoNutrition={board?.hiddenNoNutrition ?? 0} loading={loading} />

      <div className="page-pad">
        {error && <ErrorState error={error} onRetry={() => { mensas.reload(); data.reload(); }} />}

        {allHidden && (
          <EmptyState
            icon="eye-off"
            title="You've hidden every mensa"
            action={
              <a className="btn btn--primary" href="/mensas">
                Manage mensas
              </a>
            }
          >
            Nothing to show on Today. Restore at least one mensa to see its menu.
          </EmptyState>
        )}

        {loading && <FeedSkeleton />}

        {board && (
          <>
            {recs.length > 0 && (
              <section className="recs" aria-labelledby="recs-title">
                <h2 className="h2" id="recs-title">Recommended for you</h2>
                <p className="muted recs__why">Based on your favourites, distance, crowd, ratings and filters.</p>
                <div className="recs__scroll" role="list">
                  {recs.map((v, i) => (
                    <div role="listitem" className="recs__item" key={v.meal.id}>
                      <MealCard meal={v.meal} price={price} index={i} mensaName={v.mensa.name} compact />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!board.anyOffered && (
              <EmptyState
                icon="clock"
                title={`All mensas are closed for ${service}`}
                action={
                  <button type="button" className="btn btn--primary" onClick={() => setPicked(other)}>
                    Show {other}
                  </button>
                }
              >
                Nothing is served for {service} today. Check {other} or come back on a weekday.
              </EmptyState>
            )}

            {board.anyOffered && board.shown === 0 && (
              <EmptyState
                icon="filter"
                title="No dishes match your filters"
                action={
                  <button type="button" className="btn btn--primary" onClick={resetFilters}>
                    <Icon name="reset" size={16} /> Reset filters
                  </button>
                }
              >
                {board.hiddenNoNutrition > 0
                  ? `${board.hiddenNoNutrition} dishes have no nutrition data, so they can't pass a nutrition filter.`
                  : 'Loosen the protein or energy limits, or pick another diet.'}
              </EmptyState>
            )}

            {active.map((g, i) => (
              <MensaGroup key={g.mensa.id} group={g} price={price} service={service} start={i * 3} />
            ))}

            {closed.length > 0 && board.anyOffered && (
              <div className="closedlist">
                <h2 className="h2 h2--small">Closed for {service} today</h2>
                {closed.map((g) => (
                  <MensaGroup key={g.mensa.id} group={g} price={price} service={service} start={0} />
                ))}
              </div>
            )}

            {hidden.length > 0 && (
              <p className="footnote">
                <span className="num">{hidden.length}</span> mensa{hidden.length === 1 ? '' : 's'} hidden. <a href="/mensas">Manage</a>
              </p>
            )}
          </>
        )}
      </div>

      <CampusPicker open={campusOpen} onClose={() => setCampusOpen(false)} />
    </>
  );
}

export default function TodayApp() {
  return (
    <Gate fallback={<TodaySkeleton />}>
      <Today />
    </Gate>
  );
}
