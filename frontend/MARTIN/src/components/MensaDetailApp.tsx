import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { getMenu } from '../lib/api';
import { crowdNow } from '../lib/crowd';
import { campusById, formatDistance, haversineM } from '../lib/geo';
import { useAsync, useCrowd, useMensas, useNow, useRefPoint } from '../lib/hooks';
import {
  announce,
  favouriteMensaIds,
  hiddenMensaIds,
  myMensaRatings,
  priceCategory,
  toggleFavourite,
  toggleHidden,
} from '../lib/store';
import { WEEKDAYS, WEEKDAY_LABEL, dayStatus, defaultService, hoursLine, isoDate, weekdayOf } from '../lib/time';
import type { Service } from '../lib/types';
import { EmptyState, ErrorState, Section, StatusPills } from './Bits';
import { CrowdChart } from './CrowdChart';
import { MensaRatingForm } from './Forms';
import { Gate } from './Gate';
import { Icon } from './Icon';
import { MealCard } from './MealCard';
import { Sheet } from './Sheet';
import { DetailSkeleton } from './Skeletons';
import { RatingSummaryBlock, Stars } from './Stars';

function MensaDetail({ mensaId }: { mensaId: string }) {
  const now = useNow();
  const mensas = useMensas();
  const mensa = mensas.data?.find((m) => m.id === mensaId);
  const crowd = useCrowd(mensaId);
  const ref = useRefPoint(mensas.data);
  const price = useStore(priceCategory);
  const favs = useStore(favouriteMensaIds);
  const hidden = useStore(hiddenMensaIds);
  const mine = useStore(myMensaRatings)[mensaId];

  const [picked, setPicked] = useState<Service | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const service = picked ?? defaultService(now);

  const iso = isoDate(now);
  const menu = useAsync(() => getMenu(mensaId, iso), [mensaId, iso]);

  if (mensas.status === 'error' && !mensas.data) {
    return <div className="page-pad"><ErrorState error={mensas.error} onRetry={mensas.reload} /></div>;
  }
  if (!mensas.data) return <DetailSkeleton />;
  if (!mensa) {
    return (
      <div className="page-pad">
        <EmptyState title="We don't know this mensa" action={<a className="btn btn--primary" href="/mensas">All mensas</a>}>
          The link may be out of date.
        </EmptyState>
      </div>
    );
  }

  const isFav = favs.includes(mensa.id);
  const isHidden = hidden.includes(mensa.id);
  const today = weekdayOf(now);
  const meals = (menu.data ?? []).filter((m) => m.service === service);
  const hasService = mensa.hours[today].some((h) => h.service === service);
  const distance = haversineM(ref.point, mensa.coordinates);

  return (
    <div className="page-pad">
      <a className="backlink" href="/mensas">
        <Icon name="arrow-left" size={18} /> Mensas
      </a>

      <header className="pagehead pagehead--detail">
        <p className="kicker">{campusById(mensa.campusId)?.name}</p>
        <h1 className="h1">{mensa.name}</h1>
        {mensa.blurb && <p className="lede">{mensa.blurb}</p>}
        <ul className="facts-list">
          <li>
            <Icon name="pin" size={16} />
            <span>
              {mensa.address} · <span className="num">{formatDistance(distance)}</span>
            </span>
          </li>
          <li>
            <Icon name="clock" size={16} />
            <span className="num">{hoursLine(mensa, today)}</span>
          </li>
        </ul>
        <StatusPills open={dayStatus(mensa, now)} crowd={crowdNow(crowd.data, mensa, now)} />
        <div className="actions">
          <button
            type="button"
            className={`btn ${isFav ? 'btn--done' : 'btn--outline'}`}
            aria-pressed={isFav}
            onClick={() => {
              toggleFavourite(mensa.id);
              announce(isFav ? `${mensa.name} removed from favourites.` : `${mensa.name} added to favourites.`);
            }}
          >
            <Icon name="star" size={18} filled={isFav} /> {isFav ? 'Favourite' : 'Add to favourites'}
          </button>
          <button
            type="button"
            className="btn btn--outline"
            aria-pressed={isHidden}
            onClick={() => {
              toggleHidden(mensa.id);
              announce(isHidden ? `${mensa.name} restored.` : `${mensa.name} hidden from the app.`);
            }}
          >
            <Icon name={isHidden ? 'eye-off' : 'eye'} size={18} /> {isHidden ? 'Restore' : 'Hide'}
          </button>
        </div>
        {isHidden && <p className="muted">This mensa is hidden, so it doesn't show on Today or in recommendations.</p>}
      </header>

      <Section title="Popular times">
        {crowd.status === 'error' && !crowd.data ? (
          <ErrorState error={crowd.error} onRetry={crowd.reload} />
        ) : crowd.data ? (
          <CrowdChart mensa={mensa} info={crowd.data} now={now} />
        ) : (
          <div className="skel skel--chart" role="status" aria-label="Loading crowd chart" />
        )}
      </Section>

      <Section title="On the menu today">
        <div className="tabs" role="tablist" aria-label="Meal service">
          {(['lunch', 'dinner'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              type="button"
              id={`tab-${s}`}
              aria-selected={service === s}
              aria-controls="menu-panel"
              className={`tab${service === s ? ' is-on' : ''}`}
              onClick={() => setPicked(s)}
            >
              {s === 'lunch' ? 'Lunch' : 'Dinner'}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="menu-panel" aria-labelledby={`tab-${service}`}>
          {menu.status === 'error' && !menu.data ? (
            <ErrorState error={menu.error} onRetry={menu.reload} />
          ) : !menu.data ? (
            <div className="skel skel--hero" role="status" aria-label="Loading menu" />
          ) : !hasService ? (
            <EmptyState icon="clock" title={`No ${service} today`}>
              {mensa.name} doesn't serve {service} on {WEEKDAY_LABEL[today]}. Hours: <span className="num">{hoursLine(mensa, today)}</span>.
            </EmptyState>
          ) : meals.length === 0 ? (
            <EmptyState title="Menu not published yet">The kitchen hasn't posted today's {service} menu.</EmptyState>
          ) : (
            meals.map((m, i) => <MealCard key={m.id} meal={m} price={price} index={i} />)
          )}
        </div>
      </Section>

      <Section title="Ratings">
        <RatingSummaryBlock rating={mensa.rating} aspects />
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={() => setRateOpen(true)}>
            <Icon name="star" size={18} /> {mine ? 'Change your rating' : 'Rate this mensa'}
          </button>
          {mine && (
            <span className="muted yourrating">
              You gave <Stars value={mine.stars} size={13} /> <span className="num">{mine.stars}</span>
            </span>
          )}
        </div>
      </Section>

      <Section title="Opening hours">
        <table className="hours">
          <tbody>
            {WEEKDAYS.map((d) => (
              <tr key={d} className={d === today ? 'is-today' : ''}>
                <th scope="row">{WEEKDAY_LABEL[d]}</th>
                <td className="num">{hoursLine(mensa, d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Sheet open={rateOpen} onClose={() => setRateOpen(false)} kicker="Rate" title={mensa.name}>
        <MensaRatingForm mensa={mensa} onDone={() => setRateOpen(false)} />
      </Sheet>
    </div>
  );
}

export default function MensaDetailApp({ mensaId }: { mensaId: string }) {
  return (
    <Gate fallback={<DetailSkeleton />}>
      <MensaDetail mensaId={mensaId} />
    </Gate>
  );
}
