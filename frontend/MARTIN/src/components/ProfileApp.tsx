import { useStore } from '@nanostores/react';
import { href } from '../lib/paths';
import { useState } from 'react';
import { CAMPUSES, geoStatus, requestPosition } from '../lib/geo';
import { TAG_LABEL, timeAgo } from '../lib/format';
import { useMensas, useNow } from '../lib/hooks';
import {
  announce,
  bumpData,
  campus,
  dev,
  hiddenMensaIds,
  lastCheckInPromptAt,
  lastEaten,
  myCrowdReports,
  myMealRatings,
  myMensaRatings,
  requestCheckIn,
  resetAllLocalData,
  setLastEaten,
  toggleHidden,
} from '../lib/store';
import { formatDateLong, pad } from '../lib/time';
import type { CampusId } from '../lib/types';
import { EmptyState } from './Bits';
import { NutritionSliders, PricePicker } from './FilterBar';
import { Gate } from './Gate';
import { Icon } from './Icon';
import { ListSkeleton } from './Skeletons';
import { Stars } from './Stars';

function Block({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="block" id={id}>
      <h2 className="h2">{title}</h2>
      {children}
    </section>
  );
}

function DevPanel() {
  const mensas = useMensas();
  const state = useStore(dev);
  const eaten = useStore(lastEaten);
  const reports = useStore(myCrowdReports);
  const now = useNow();
  const [target, setTarget] = useState(state.simMensaId ?? 'polyterrasse');
  const list = mensas.data ?? [];
  const name = (id: string | null) => list.find((m) => m.id === id)?.name ?? id ?? '';

  function setTime1215() {
    const d = new Date();
    d.setHours(12, 15, 0, 0);
    // Weekend: jump to Monday so mensas are actually serving.
    const dow = d.getDay();
    if (dow === 6) d.setDate(d.getDate() + 2);
    if (dow === 0) d.setDate(d.getDate() + 1);
    dev.set({ ...dev.get(), simNow: d.toISOString() });
    announce(`Clock set to ${formatDateLong(d)} 12:15.`);
  }

  function sampleEaten() {
    setLastEaten({ mealId: 'polyterrasse.mon.lunch.0', mensaId: 'polyterrasse', date: new Date().toISOString().slice(0, 10), title: 'Pollo frito' });
    announce('Last eaten set to Pollo frito.');
  }

  return (
    <Block title="Developer panel" id="dev">
      <p className="muted">Test every feature on a laptop. These switches are saved in this browser only.</p>

      <dl className="devstate">
        <div>
          <dt>Clock</dt>
          <dd className="num">
            {state.simNow ? 'Simulated · ' : 'Real · '}
            {formatDateLong(now)} {pad(now.getHours())}:{pad(now.getMinutes())}
          </dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{state.simMensaId ? `Pretending at ${name(state.simMensaId)}` : 'Device / campus'}</dd>
        </div>
        <div>
          <dt>Last eaten</dt>
          <dd>{eaten?.title ?? 'Nothing'}</dd>
        </div>
        <div>
          <dt>Crowd reports sent</dt>
          <dd className="num">{reports.length}</dd>
        </div>
      </dl>

      <div className="field">
        <label className="field__label" htmlFor="dev-mensa">Mensa for the actions below</label>
        <select id="dev-mensa" className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="devgrid">
        <button type="button" className="btn btn--outline" onClick={() => requestCheckIn(target)}>
          Simulate check-in popup
        </button>
        <button
          type="button"
          className="btn btn--outline"
          onClick={() => {
            dev.set({ ...dev.get(), simMensaId: target });
            lastCheckInPromptAt.set(0);
            announce(`Pretending you're at ${name(target)}.`);
          }}
        >
          Pretend I'm at {name(target) || '…'}
        </button>
        <button type="button" className="btn btn--outline" onClick={setTime1215}>
          Set time to 12:15
        </button>
        <button type="button" className="btn btn--outline" onClick={sampleEaten}>
          Set lastEaten to a sample dish
        </button>
        <button type="button" className="btn btn--outline" onClick={() => { setLastEaten(null); announce('Last eaten cleared.'); }}>
          Clear lastEaten
        </button>
        <button type="button" className="btn btn--outline" onClick={() => { lastCheckInPromptAt.set(0); announce('Check-in cooldown cleared.'); }}>
          Clear 45 min cooldown
        </button>
        <button
          type="button"
          className="btn btn--outline"
          disabled={!state.simMensaId && !state.simNow}
          onClick={() => { dev.set({ ...dev.get(), simMensaId: null, simNow: null }); announce('Real clock and location restored.'); }}
        >
          Back to real time and place
        </button>
        <button
          type="button"
          className={`btn ${state.apiFail ? 'btn--done' : 'btn--outline'}`}
          aria-pressed={state.apiFail}
          onClick={() => { dev.set({ ...dev.get(), apiFail: !state.apiFail }); bumpData(); }}
        >
          {state.apiFail ? 'API errors: ON' : 'Simulate API errors'}
        </button>
      </div>
    </Block>
  );
}

function Profile() {
  const mensas = useMensas();
  const now = useNow();
  const picked = useStore(campus);
  const geo = useStore(geoStatus);
  const hidden = useStore(hiddenMensaIds);
  const mealRatings = useStore(myMealRatings);
  const mensaRatings = useStore(myMensaRatings);
  const [confirmReset, setConfirmReset] = useState(false);

  const nameOf = (id: string) => mensas.data?.find((m) => m.id === id)?.name ?? id;
  const history = [
    ...Object.values(mealRatings).map((r) => ({ kind: 'meal' as const, at: r.timestamp, r })),
    ...Object.values(mensaRatings).map((r) => ({ kind: 'mensa' as const, at: r.timestamp, r })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="page-pad">
      <header className="pagehead">
        <p className="kicker">Stored on this device</p>
        <h1 className="h1">Profile</h1>
      </header>

      <Block title="Default campus">
        <div className="field">
          <label className="field__label" htmlFor="campus-select">Distances and recommendations start here</label>
          <select
            id="campus-select"
            className="select"
            value={picked ?? 'auto'}
            onChange={(e) => campus.set(e.target.value === 'auto' ? null : (e.target.value as CampusId))}
          >
            <option value="auto">Detect automatically</option>
            {CAMPUSES.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {picked === null && geo !== 'granted' && (
          <button type="button" className="btn btn--outline btn--sm" onClick={() => void requestPosition()} disabled={geo === 'asking'}>
            <Icon name="locate" size={16} /> {geo === 'denied' ? 'Location blocked, try again' : 'Use my location'}
          </button>
        )}
      </Block>

      <Block title="Price category">
        <PricePicker />
      </Block>

      <Block title="Nutrition targets">
        <p className="muted">Same limits as the filters on Today. Meals without nutrition data are left out while a limit is set.</p>
        <NutritionSliders />
      </Block>

      <Block title="Hidden mensas">
        {hidden.length === 0 ? (
          <p className="muted">You haven't hidden any mensa.</p>
        ) : (
          <ul className="list">
            {hidden.map((id) => (
              <li className="row" key={id}>
                <div className="row__main">
                  <h3 className="row__name">{nameOf(id)}</h3>
                </div>
                <button type="button" className="btn btn--outline btn--sm" onClick={() => { toggleHidden(id); announce(`${nameOf(id)} restored.`); }}>
                  <Icon name="eye" size={16} /> Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Your ratings">
        {history.length === 0 ? (
          <EmptyState icon="people" title="No ratings yet">
            Rate a dish or a mensa and it shows up here.
          </EmptyState>
        ) : (
          <ul className="reviews">
            {history.map((h) =>
              h.kind === 'meal' ? (
                <li className="review" key={`m-${h.r.mealId}`}>
                  <div className="review__top">
                    <Stars value={h.r.stars} size={12} />
                    <span className="muted review__who">{timeAgo(h.at, now)}</span>
                  </div>
                  <p>
                    <a className="textlink" href={href(`/meal/${h.r.mealId}`)}>{h.r.mealTitle ?? 'Meal'}</a>
                    <span className="muted"> · {nameOf(h.r.mensaId)}</span>
                  </p>
                  {h.r.tags.length > 0 && <p className="muted">{h.r.tags.map((t) => TAG_LABEL[t]).join(' · ')}</p>}
                </li>
              ) : (
                <li className="review" key={`s-${h.r.mensaId}`}>
                  <div className="review__top">
                    <Stars value={h.r.stars} size={12} />
                    <span className="muted review__who">{timeAgo(h.at, now)}</span>
                  </div>
                  <p>
                    <a className="textlink" href={href(`/mensa/${h.r.mensaId}`)}>{nameOf(h.r.mensaId)}</a>
                    <span className="muted"> · mensa</span>
                  </p>
                </li>
              ),
            )}
          </ul>
        )}
      </Block>

      <Block title="Your data">
        <p className="muted">Everything lives in this browser. Nothing is sent anywhere except ratings and crowd reports you submit.</p>
        {!confirmReset ? (
          <button type="button" className="btn btn--danger" onClick={() => setConfirmReset(true)}>
            Reset all local data
          </button>
        ) : (
          <div className="confirm" role="alertdialog" aria-label="Confirm reset">
            <p><strong>Erase favourites, filters, ratings and settings?</strong> This can't be undone.</p>
            <div className="form__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  resetAllLocalData();
                  setConfirmReset(false);
                  announce('All local data erased.');
                }}
              >
                Erase everything
              </button>
            </div>
          </div>
        )}
      </Block>

      <DevPanel />
    </div>
  );
}

export default function ProfileApp() {
  return (
    <Gate fallback={<ListSkeleton rows={4} />}>
      <Profile />
    </Gate>
  );
}
