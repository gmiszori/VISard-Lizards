import { useStore } from '@nanostores/react';
import { useMemo, useState } from 'react';
import { getCrowd } from '../lib/api';
import { crowdNow } from '../lib/crowd';
import { CAMPUSES, formatDistance, haversineM } from '../lib/geo';
import { useAsync, useMensas, useNow, useRefPoint } from '../lib/hooks';
import { announce, favouriteMensaIds, hiddenMensaIds, toggleFavourite, toggleHidden } from '../lib/store';
import { dayStatus } from '../lib/time';
import type { CrowdInfo, Mensa } from '../lib/types';
import { EmptyState, ErrorState, StatusPills, stagger } from './Bits';
import { Gate } from './Gate';
import { Icon } from './Icon';
import { ListSkeleton } from './Skeletons';
import { RatingLine } from './Stars';

interface RowProps {
  mensa: Mensa;
  distanceM: number;
  crowd: CrowdInfo | undefined;
  index: number;
}

function MensaRow({ mensa, distanceM, crowd, index }: RowProps) {
  const now = useNow();
  const favs = useStore(favouriteMensaIds);
  const hidden = useStore(hiddenMensaIds);
  const isFav = favs.includes(mensa.id);
  const isHidden = hidden.includes(mensa.id);

  return (
    <li className="row fade-up" style={stagger(index)}>
      <div className="row__main">
        <h3 className="row__name">
          <a href={`/mensa/${mensa.id}`}>{mensa.name}</a>
        </h3>
        <p className="row__meta">
          <span className="num">{formatDistance(distanceM)}</span>
          <span aria-hidden="true">·</span>
          <RatingLine rating={mensa.rating} size={12} />
        </p>
        {!isHidden && <StatusPills open={dayStatus(mensa, now)} crowd={crowdNow(crowd, mensa, now)} />}
      </div>
      <div className="row__actions">
        {!isHidden && (
          <button
            type="button"
            className={`iconbtn${isFav ? ' is-on' : ''}`}
            aria-pressed={isFav}
            aria-label={isFav ? `Remove ${mensa.name} from favourites` : `Add ${mensa.name} to favourites`}
            onClick={() => {
              toggleFavourite(mensa.id);
              announce(isFav ? `${mensa.name} removed from favourites.` : `${mensa.name} added to favourites.`);
            }}
          >
            <Icon name="star" filled={isFav} />
          </button>
        )}
        <button
          type="button"
          className={`iconbtn${isHidden ? ' is-on' : ''}`}
          aria-pressed={isHidden}
          aria-label={isHidden ? `Restore ${mensa.name}` : `Hide ${mensa.name}`}
          onClick={() => {
            toggleHidden(mensa.id);
            announce(isHidden ? `${mensa.name} restored.` : `${mensa.name} hidden. Restore it under Hidden at the bottom.`);
          }}
        >
          <Icon name={isHidden ? 'eye-off' : 'eye'} />
        </button>
      </div>
    </li>
  );
}

function Mensas() {
  const mensas = useMensas();
  const ref = useRefPoint(mensas.data);
  const hidden = useStore(hiddenMensaIds);
  const favs = useStore(favouriteMensaIds);
  const [showHidden, setShowHidden] = useState(false);

  const ids = mensas.data?.map((m) => m.id).join(',') ?? '';
  const crowds = useAsync(async () => {
    const list = mensas.data ?? [];
    const entries = await Promise.all(list.map(async (m) => [m.id, await getCrowd(m.id)] as const));
    return Object.fromEntries(entries) as Record<string, CrowdInfo>;
  }, [ids]);

  const sections = useMemo(() => {
    const all = mensas.data ?? [];
    const dist = (m: Mensa) => haversineM(ref.point, m.coordinates);
    const visible = all.filter((m) => !hidden.includes(m.id));
    return {
      groups: CAMPUSES.map((c) => ({
        campus: c,
        items: visible
          .filter((m) => m.campusId === c.id)
          .sort((a, b) => Number(favs.includes(b.id)) - Number(favs.includes(a.id)) || dist(a) - dist(b)),
      })).filter((g) => g.items.length > 0),
      hidden: all.filter((m) => hidden.includes(m.id)),
      dist,
    };
  }, [mensas.data, hidden, favs, ref.point]);

  if (mensas.status === 'error' && !mensas.data) return <div className="page-pad"><ErrorState error={mensas.error} onRetry={mensas.reload} /></div>;
  if (!mensas.data) return <ListSkeleton />;

  let n = 0;
  return (
    <div className="page-pad">
      <header className="pagehead">
        <p className="kicker">ETH · UZH</p>
        <h1 className="h1">Mensas</h1>
        <p className="muted">
          Star the places you eat at. Hide the ones you never will. Distances are measured from <strong>{ref.label}</strong>.
        </p>
      </header>

      {sections.groups.length === 0 && (
        <EmptyState icon="eye-off" title="No visible mensas">
          You've hidden all of them. Open "Hidden" below and restore at least one.
        </EmptyState>
      )}

      {sections.groups.map((g) => (
        <section className="campus" key={g.campus.id} aria-labelledby={`c-${g.campus.id}`}>
          <h2 className="h2 campus__title" id={`c-${g.campus.id}`}>
            {g.campus.name}
            <span className="num campus__count">{g.items.length}</span>
          </h2>
          <ul className="list">
            {g.items.map((m) => (
              <MensaRow key={m.id} mensa={m} distanceM={sections.dist(m)} crowd={crowds.data?.[m.id]} index={n++} />
            ))}
          </ul>
        </section>
      ))}

      {sections.hidden.length > 0 && (
        <section className="campus campus--hidden">
          <h2 className="h2">
            <button
              type="button"
              className="disclosure"
              aria-expanded={showHidden}
              aria-controls="hidden-list"
              onClick={() => setShowHidden(!showHidden)}
            >
              Hidden (<span className="num">{sections.hidden.length}</span>)
              <Icon name="chevron-down" className={showHidden ? 'is-flipped' : ''} />
            </button>
          </h2>
          {showHidden && (
            <ul className="list" id="hidden-list">
              {sections.hidden.map((m) => (
                <MensaRow key={m.id} mensa={m} distanceM={sections.dist(m)} crowd={undefined} index={0} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default function MensasApp() {
  return (
    <Gate fallback={<ListSkeleton />}>
      <Mensas />
    </Gate>
  );
}
