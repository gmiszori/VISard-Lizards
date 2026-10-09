import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { initPositionIfGranted, haversineM } from '../lib/geo';
import { useMensas, useNow, usePosition } from '../lib/hooks';
import {
  announcement,
  checkInRequest,
  dev,
  hiddenMensaIds,
  lastCheckInPromptAt,
  lastEaten,
  myMealRatings,
} from '../lib/store';
import { openNow } from '../lib/time';
import type { Mensa } from '../lib/types';
import { CrowdForm, MealRatingForm } from './Forms';
import { Sheet } from './Sheet';

/** How close counts as "at the mensa". */
const NEAR_METRES = 250;
const COOLDOWN_MS = 45 * 60 * 1000;

type Step = 'crowd' | 'meal';

/**
 * Check-in popup. Appears on app open when the user stands near a mensa that
 * is serving, at most once per 45 minutes, and never on every navigation.
 * The developer panel can also open it directly.
 */
function CheckInSheet() {
  const mensas = useMensas();
  const pos = usePosition(mensas.data);
  const now = useNow();
  const hidden = useStore(hiddenMensaIds);
  const request = useStore(checkInRequest);
  const eaten = useStore(lastEaten);
  const rated = useStore(myMealRatings);

  const [target, setTarget] = useState<Mensa | null>(null);
  const [onlyCrowd, setOnlyCrowd] = useState(false);
  const [step, setStep] = useState<Step>('crowd');
  const evaluated = useRef("");
  const simNow = useStore(dev).simNow;
  const handled = useRef(0);

  const needsMealStep = !onlyCrowd && !!eaten && !rated[eaten.mealId];

  // Automatic trigger: once per position/time, only when near an open mensa and the cooldown has passed.
  useEffect(() => {
    if (!mensas.data || !pos) return;
    const key = `${pos.lat},${pos.lng}|${simNow ?? ""}`;
    if (evaluated.current === key) return;
    const candidates = mensas.data
      .filter((m) => !hidden.includes(m.id))
      .map((m) => ({ m, d: haversineM(pos, m.coordinates) }))
      .filter(({ m, d }) => d <= NEAR_METRES && openNow(m, now))
      .sort((a, b) => a.d - b.d);
    const best = candidates[0];
    evaluated.current = key;
    if (!best) return;
    if (Date.now() - lastCheckInPromptAt.get() < COOLDOWN_MS) return;
    lastCheckInPromptAt.set(Date.now());
    setOnlyCrowd(false);
    setStep('crowd');
    setTarget(best.m);
  }, [mensas.data, pos, now, hidden, simNow]);

  // Manual trigger (developer panel, "report crowd" buttons). Ignores the cooldown.
  useEffect(() => {
    if (!request || request.nonce === handled.current || !mensas.data) return;
    const m = mensas.data.find((x) => x.id === request.mensaId);
    if (!m) return;
    handled.current = request.nonce;
    lastCheckInPromptAt.set(Date.now());
    setOnlyCrowd(request.onlyCrowd);
    setStep('crowd');
    setTarget(m);
  }, [request, mensas.data]);

  const close = () => setTarget(null);
  const afterCrowd = () => (needsMealStep ? setStep('meal') : close());

  if (!target) return null;

  if (step === 'meal' && eaten) {
    return (
      <Sheet key="meal" open onClose={close} kicker="Check-in · 2 of 2" title={`How was ${eaten.title ?? 'your last meal'} last time?`}>
        <MealRatingForm
          meal={{ id: eaten.mealId, mensaId: eaten.mensaId, title: eaten.title ?? 'your last meal' }}
          onDone={close}
          onSkip={close}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      key="crowd"
      open
      onClose={close}
      kicker={needsMealStep ? 'Check-in · 1 of 2' : 'Check-in'}
      title={`How full is ${target.name} right now?`}
    >
      <p className="muted sheet__hint">One tap helps everyone decide where to eat. Reports are anonymous.</p>
      <CrowdForm
        mensaId={target.id}
        mensaName={target.name}
        onDone={afterCrowd}
        onSkip={afterCrowd}
        primaryLabel={needsMealStep ? 'Send and continue' : 'Send report'}
      />
    </Sheet>
  );
}

/** Screen-reader live region plus a short visible toast for confirmations. */
function Announcer() {
  const a = useStore(announcement);
  const [visible, setVisible] = useState<string | null>(null);

  useEffect(() => {
    if (!a) return;
    setVisible(a.text);
    const t = setTimeout(() => setVisible(null), 3200);
    return () => clearTimeout(t);
  }, [a]);

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {a?.text}
      </div>
      {visible && (
        <div className="toast" aria-hidden="true">
          {visible}
        </div>
      )}
    </>
  );
}

export default function GlobalUI() {
  useEffect(() => {
    void initPositionIfGranted();
  }, []);
  return (
    <>
      <CheckInSheet />
      <Announcer />
    </>
  );
}
