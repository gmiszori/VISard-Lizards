import { useState } from 'react';
import { CROWD_LABEL, CROWD_USUALLY, levelFromPct, liveLevel, pctFromLevel } from '../lib/crowd';
import { WEEKDAYS, WEEKDAY_LABEL, pad, weekdayOf } from '../lib/time';
import type { CrowdInfo, Mensa, Weekday } from '../lib/types';
import { EmptyState } from './Bits';
import { requestCheckIn } from '../lib/store';
import { Segmented } from './FilterBar';

const FIRST_HOUR = 7;
const LAST_HOUR = 21;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);

const DAY_NAME: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

interface Props {
  mensa: Mensa;
  info: CrowdInfo;
  now: Date;
}

/** "Popular times": typical crowd per hour, current hour in the accent colour, live marker from reports. */
export function CrowdChart({ mensa, info, now }: Props) {
  const today = weekdayOf(now);
  const [day, setDay] = useState<Weekday>(today);
  const { histogram } = info;

  if (!histogram.sufficient || !histogram.byWeekday) {
    return (
      <EmptyState
        icon="people"
        title="Not enough reports yet"
        action={
          <button type="button" className="btn btn--primary" onClick={() => requestCheckIn(mensa.id, true)}>
            Report how full it is
          </button>
        }
      >
        Typical crowd times appear after about 20 reports. So far there {histogram.sampleSize === 1 ? 'is' : 'are'}{' '}
        <span className="num">{histogram.sampleSize}</span>. Standing in the queue? Tell us, it takes two seconds.
      </EmptyState>
    );
  }

  const values = histogram.byWeekday[day];
  const isToday = day === today;
  const hourNow = now.getHours();
  const live = isToday ? liveLevel(info, now) : null;
  const liveCount = info.live.length;

  const open = mensa.hours[day].length > 0;
  const nowPct = values[hourNow] ?? 0;
  const peak = HOURS.reduce((best, h) => ((values[h] ?? 0) > (values[best] ?? 0) ? h : best), FIRST_HOUR);

  let sentence: string;
  if (!open) sentence = `Closed on ${DAY_NAME[day]}s`;
  else if (isToday) {
    sentence = nowPct > 0 ? `${CROWD_USUALLY[levelFromPct(nowPct)]} at this time` : 'Closed at this time';
  } else {
    sentence = `Usually busiest around ${pad(peak)}:00`;
  }

  const summary = open
    ? `${DAY_NAME[day]}: busiest around ${pad(peak)}:00. ${HOURS.filter((h) => (values[h] ?? 0) > 0)
        .map((h) => `${pad(h)}:00 ${CROWD_LABEL[levelFromPct(values[h] ?? 0)]}`)
        .join(', ')}.`
    : `${DAY_NAME[day]}: closed.`;

  return (
    <div className="crowd">
      <Segmented<Weekday>
        label="Weekday"
        value={day}
        onChange={setDay}
        options={WEEKDAYS.map((d) => ({ id: d, label: WEEKDAY_LABEL[d], mark: d === today }))}
        className="seg--days"
      />

      <p className="crowd__sentence" aria-live="polite">
        {sentence}
      </p>
      {live && (
        <p className="crowd__live">
          <span className="livedot" aria-hidden="true" />
          <strong>Live: {CROWD_LABEL[live]}</strong>
          <span className="muted">
            {' '}
            · <span className="num">{liveCount}</span> report{liveCount === 1 ? '' : 's'} in the last 30 min
          </span>
        </p>
      )}

      <div className="chart" key={day} role="img" aria-label={summary}>
        <div className="chart__grid" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="chart__bars" aria-hidden="true">
          {HOURS.map((h, i) => {
            const v = values[h] ?? 0;
            const isNow = isToday && h === hourNow;
            return (
              <div className={`bar${isNow ? ' is-now' : ''}${v === 0 ? ' is-closed' : ''}`} key={h} style={{ ['--i' as string]: i }}>
                <div className="bar__fill" style={{ height: `${Math.max(v, v === 0 ? 3 : 6)}%` }} />
                {isNow && live && <div className="bar__live" style={{ bottom: `${pctFromLevel(live)}%` }} />}
              </div>
            );
          })}
        </div>
        <div className="chart__axis" aria-hidden="true">
          {HOURS.map((h) => (
            <span key={h} className="num">
              {(h - FIRST_HOUR) % 2 === 0 ? pad(h) : ''}
            </span>
          ))}
        </div>
      </div>

      <div className="crowd__foot">
        <span className="crowd__legend">
          <span className="swatch swatch--now" aria-hidden="true" /> This hour
        </span>
        {live && (
          <span className="crowd__legend">
            <span className="swatch swatch--live" aria-hidden="true" /> Live level
          </span>
        )}
        <button type="button" className="btn btn--ghost btn--sm crowd__report" onClick={() => requestCheckIn(mensa.id, true)}>
          Report crowd now
        </button>
      </div>
    </div>
  );
}
