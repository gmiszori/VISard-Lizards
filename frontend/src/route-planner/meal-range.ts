export function clampMealRange(minimum:number,maximum:number,changed:'min'|'max') {
  minimum=Math.min(120,Math.max(5,minimum));maximum=Math.min(120,Math.max(5,maximum));
  if(minimum>maximum) {if(changed==='min') minimum=maximum;else maximum=minimum;}
  return {mealMinutes:minimum,mealMaxMinutes:maximum};
}
const duration=(minutes:number)=>minutes<60 ? `${minutes} min` : `${Math.floor(minutes/60)} ${minutes<120 ? 'hour' : 'hours'}${minutes%60 ? ` ${minutes%60} min` : ''}`;
export function attachMealRange() {
  const minimum=document.querySelector<HTMLInputElement>('#meal-minutes')!;
  const maximum=document.querySelector<HTMLInputElement>('#meal-max-minutes')!;
  const slider=document.querySelector<HTMLElement>('#meal-slider')!;
  const label=document.querySelector<HTMLOutputElement>('#meal-range-label')!;
  function update(changed:'min'|'max') {
    const range=clampMealRange(Number(minimum.value),Number(maximum.value),changed);
    minimum.value=String(range.mealMinutes);maximum.value=String(range.mealMaxMinutes);
    minimum.setAttribute('aria-valuemax',maximum.value);maximum.setAttribute('aria-valuemin',minimum.value);
    minimum.setAttribute('aria-valuetext',duration(range.mealMinutes));maximum.setAttribute('aria-valuetext',duration(range.mealMaxMinutes));
    slider.style.setProperty('--min',`${(range.mealMinutes-5)/115*100}%`);
    slider.style.setProperty('--max',`${(range.mealMaxMinutes-5)/115*100}%`);
    // At coincident handles either endpoint remains reachable from the relevant side.
    maximum.style.zIndex='2';minimum.style.zIndex=range.mealMinutes>=115 ? '3' : '1';
    label.value=range.mealMinutes===range.mealMaxMinutes ? duration(range.mealMinutes) : `${duration(range.mealMinutes)} – ${duration(range.mealMaxMinutes)}`;
  }
  minimum.addEventListener('input',()=>update('min'));maximum.addEventListener('input',()=>update('max'));update('min');
  return ()=>({mealMinutes:Number(minimum.value),mealMaxMinutes:Number(maximum.value)});
}
