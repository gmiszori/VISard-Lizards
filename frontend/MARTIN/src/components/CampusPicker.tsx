import { useStore } from '@nanostores/react';
import { CAMPUSES, geoStatus, requestPosition } from '../lib/geo';
import { campus } from '../lib/store';
import type { CampusId } from '../lib/types';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const STATUS_TEXT: Record<string, string> = {
  idle: 'Your position never leaves this device.',
  asking: 'Waiting for your browser…',
  granted: 'Location found. Distances use where you are.',
  denied: "Location is blocked. Pick a campus instead, or allow location in your browser's site settings.",
  unavailable: "This browser can't share a location. Pick a campus instead.",
};

export function CampusPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const picked = useStore(campus);
  const geo = useStore(geoStatus);

  async function detect() {
    campus.set(null);
    await requestPosition();
  }

  function pick(id: CampusId) {
    campus.set(id);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Where are you eating?">
      <div className="options" role="radiogroup" aria-label="Campus">
        <button type="button" role="radio" aria-checked={picked === null} className={`option${picked === null ? ' is-on' : ''}`} onClick={detect}>
          <Icon name="locate" />
          <span>
            <strong>Detect automatically</strong>
            <small>{STATUS_TEXT[geo]}</small>
          </span>
          {picked === null && <Icon name="check" />}
        </button>
        {CAMPUSES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={picked === c.id}
            className={`option${picked === c.id ? ' is-on' : ''}`}
            onClick={() => pick(c.id)}
          >
            <Icon name="pin" />
            <span>
              <strong>{c.name}</strong>
              <small>{c.institution}</small>
            </span>
            {picked === c.id && <Icon name="check" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
