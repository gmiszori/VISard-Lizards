import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { PRICE_LABEL } from '../lib/format';
import {
  KCAL_MIN,
  KCAL_OFF,
  PROTEIN_MAX,
  dietFilter,
  maxKcal,
  minProtein,
  priceCategory,
  resetFilters,
  sortMode,
  type DietFilter,
  type SortMode,
} from '../lib/store';
import type { PriceCategory } from '../lib/types';
import { Icon } from './Icon';

const DIETS: Array<{ id: DietFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'meat', label: 'Meat' },
];

const SORTS: Array<{ id: SortMode; label: string }> = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'protein', label: 'Protein' },
  { id: 'price', label: 'Price' },
  { id: 'rating', label: 'Rating' },
  { id: 'distance', label: 'Distance' },
];

export const proteinLabel = (g: number) => (g > 0 ? `≥ ${g} g protein` : 'Any protein');
export const kcalLabel = (k: number) => (k < KCAL_OFF ? `≤ ${k} kcal` : 'Any energy');

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string; mark?: boolean }>;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`seg ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`seg__btn${value === o.id ? ' is-on' : ''}`}
          aria-label={o.mark ? `${o.label}, today` : undefined}
          onClick={() => onChange(o.id)}
        >
          {o.label}
          {o.mark && <span className="seg__mark" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

/** Sliders for protein and kcal. Reused in the Profile "nutrition targets". */
export function NutritionSliders() {
  const protein = useStore(minProtein);
  const kcal = useStore(maxKcal);
  return (
    <div className="sliders">
      <div className="slider">
        <div className="slider__top">
          <label htmlFor="protein-range">Protein minimum</label>
          <output className="num" htmlFor="protein-range">{proteinLabel(protein)}</output>
        </div>
        <input
          id="protein-range"
          type="range"
          min={0}
          max={PROTEIN_MAX}
          step={5}
          value={protein}
          aria-valuetext={proteinLabel(protein)}
          onChange={(e) => minProtein.set(Number(e.target.value))}
        />
      </div>
      <div className="slider">
        <div className="slider__top">
          <label htmlFor="kcal-range">Energy maximum</label>
          <output className="num" htmlFor="kcal-range">{kcalLabel(kcal)}</output>
        </div>
        <input
          id="kcal-range"
          type="range"
          min={KCAL_MIN}
          max={KCAL_OFF}
          step={50}
          value={kcal}
          aria-valuetext={kcalLabel(kcal)}
          onChange={(e) => maxKcal.set(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

export function PricePicker() {
  const price = useStore(priceCategory);
  return (
    <Segmented<PriceCategory>
      label="Price category"
      value={price}
      onChange={(v) => priceCategory.set(v)}
      options={(['student', 'staff', 'external'] as const).map((id) => ({ id, label: PRICE_LABEL[id] }))}
    />
  );
}

interface Props {
  shown: number;
  hiddenNoNutrition: number;
  loading?: boolean;
}

/** Sticky filter bar: diet chips always visible, everything else in an expandable panel. */
export function FilterBar({ shown, hiddenNoNutrition, loading }: Props) {
  const diet = useStore(dietFilter);
  const protein = useStore(minProtein);
  const kcal = useStore(maxKcal);
  const sort = useStore(sortMode);
  const [open, setOpen] = useState(false);

  const nutritionOn = protein > 0 || kcal < KCAL_OFF;
  const activeCount = (diet !== 'all' ? 1 : 0) + (protein > 0 ? 1 : 0) + (kcal < KCAL_OFF ? 1 : 0);
  const summary = [protein > 0 ? proteinLabel(protein) : null, kcal < KCAL_OFF ? kcalLabel(kcal) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="filterbar">
      <div className="filterbar__row">
        <Segmented<DietFilter> label="Diet" value={diet} options={DIETS} onChange={(v) => dietFilter.set(v)} className="seg--grow" />
        <button
          type="button"
          className={`iconbtn iconbtn--filter${open || activeCount > 0 ? ' is-on' : ''}`}
          aria-expanded={open}
          aria-controls="filter-panel"
          aria-label={`Filters${activeCount ? `, ${activeCount} active` : ''}`}
          onClick={() => setOpen(!open)}
        >
          <Icon name="filter" />
          {activeCount > 0 && <span className="badge num">{activeCount}</span>}
        </button>
      </div>

      {open && (
        <div className="filterbar__panel" id="filter-panel">
          <NutritionSliders />
          <div className="field">
            <span className="field__label" id="price-label">Price shown</span>
            <PricePicker />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sort-select">Sort by</label>
            <select id="sort-select" className="select" value={sort} onChange={(e) => sortMode.set(e.target.value as SortMode)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filterbar__panelfoot">
            <button type="button" className="btn btn--ghost btn--sm" onClick={resetFilters} disabled={activeCount === 0}>
              <Icon name="reset" size={16} /> Reset filters
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setOpen(false)}>
              Show {shown} {shown === 1 ? 'dish' : 'dishes'}
            </button>
          </div>
        </div>
      )}

      {(summary || (nutritionOn && hiddenNoNutrition > 0)) && !loading && (
        <p className="filterbar__note" aria-live="polite">
          {summary && <span className="num">{summary}</span>}
          {nutritionOn && hiddenNoNutrition > 0 && (
            <span className="filterbar__hidden">
              {summary ? ' · ' : ''}
              <span className="num">{hiddenNoNutrition}</span> hidden – no nutrition data
            </span>
          )}
        </p>
      )}
    </div>
  );
}
