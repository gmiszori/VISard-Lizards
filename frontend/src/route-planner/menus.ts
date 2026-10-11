type Price={amount:number;currency?:string;customerGroup?:string};
export type MenuMeal={id?:string;name?:string;title?:string;description?:string;components?:string[];date?:string|null;
  sourceUrl?:string;section?:string;dietTag?:string;dietaryLabels?:string[];allergens?:string[];
  price?:Price|{student?:number;staff?:number;external?:number};prices?:Price[]};
export function uniqueMeals(meals:MenuMeal[]) {
  const seen=new Set<string>();return meals.filter(meal=>{
    const name=(meal.name||meal.title||'').trim();if(!name || name.toLowerCase()==='novalue') return false;
    const key=`${name.toLocaleLowerCase()}|${meal.description||meal.components?.join(' ')||''}|${meal.section||''}`;
    if(seen.has(key)) return false;seen.add(key);return true;
  });
}
export function menuLink(value:string|undefined) {
  try {const url=new URL(value||'');return ['https:','http:'].includes(url.protocol) ? url.href : null;} catch {return null;}
}
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='') {const el=document.createElement(tag);el.textContent=text;el.className=className;return el;}
function priceText(meal:MenuMeal) {
  let prices=meal.prices||[];
  if(!prices.length && meal.price) {
    if('amount' in meal.price) prices=[meal.price];
    else {const grouped=meal.price;prices=([['student','Students'],['staff','Staff'],['external','Guests']] as const).flatMap(([key,customerGroup])=>grouped[key]==null ? [] : [{amount:grouped[key]!,currency:'CHF',customerGroup}]);}
  }
  return prices.filter(price=>Number.isFinite(price.amount)).map(price=>`${price.customerGroup ? `${price.customerGroup}: ` : ''}${price.currency||'CHF'} ${price.amount.toFixed(2)}`).join(' · ');
}
function dishes(container:HTMLElement,meals:MenuMeal[]) {
  container.replaceChildren();
  for(const meal of uniqueMeals(meals)) {
    const row=node('article','','menu-dish');row.append(node('h5',meal.name||meal.title));
    const description=meal.description||meal.components?.filter(text=>!text.startsWith('Source: ')).join(' · ');
    if(description) row.append(node('p',description));
    const price=priceText(meal);if(price) row.append(node('p',price,'menu-price'));
    const labels=meal.dietaryLabels?.join(' · ') || (meal.dietTag && meal.dietTag!=='unknown' ? meal.dietTag : '');
    if(labels) row.append(node('p',labels,'menu-diet'));
    if(meal.allergens?.length) row.append(node('p',`Allergens: ${meal.allergens.join(', ')}`,'menu-allergens'));
    const source=menuLink(meal.sourceUrl || meal.components?.find(text=>text.startsWith('Source: '))?.slice(8));
    if(source) {const link=node('a','Menu source');link.href=source;link.target='_blank';link.rel='noopener noreferrer';row.append(link);}
    if(meal.section?.toLowerCase().includes('catering') || source?.toLowerCase().includes('catering')) row.append(node('p','Catering offer · Daily availability is not confirmed.','menu-note'));
    container.append(row);
  }
}
let queue:Promise<void>=Promise.resolve();
export function mealMenu(place:{name:string;meals:MenuMeal[]},planId:string|undefined,index:number) {
  const panel=node('section','','meal-menu'),heading=node('h4',`Menu at ${place.name}`),status=node('p','','menu-status'),list=node('div'),retry=node('button','Retry menu');
  panel.setAttribute('aria-label',`Menu at ${place.name}`);status.setAttribute('role','status');retry.type='button';retry.hidden=true;
  const cached=uniqueMeals(place.meals);dishes(list,cached);status.textContent=cached.length ? 'Menu from the app database.' : 'Select this option to load its website menu.';
  panel.append(heading,status,list,retry);let loading=false,loaded=false;
  function load() {
    if(loaded || loading || !planId) return;loading=true;retry.hidden=true;status.textContent='Loading website menu…';
    queue=queue.catch(()=>{}).then(async()=>{
      if(!panel.isConnected) {loading=false;return;}
      try {
        const query=new URLSearchParams({planId:planId!,optionIndex:String(index)});
        const response=await fetch(`/api/route-planner/menu?${query}`,{cache:'no-store',signal:AbortSignal.timeout(270_000)});
        const data=await response.json();if(!response.ok) throw new Error(data.detail || 'Menu lookup failed.');
        const meals=uniqueMeals(data.meals||[]);
        if(meals.length) {dishes(list,meals);status.textContent=`Website menu · ${meals.length} ${meals.length===1 ? 'dish' : 'dishes'}${data.generalMenu ? '.' : ` for ${String(data.mealDate).split('-').reverse().join('.')}.`}`;}
        else if(data.status==='closed') {list.replaceChildren();status.textContent=data.message;}
        else status.textContent=`${cached.length ? 'Showing database dishes. ' : ''}${data.message || 'No website dishes were found for this meal time.'}`;
        loaded=true;if(data.status==='unavailable') retry.hidden=false;
      } catch(error) {status.textContent=`${cached.length ? 'Showing database dishes. ' : ''}${error instanceof Error ? error.message : 'Website menu unavailable.'}`;retry.hidden=false;}
      finally {loading=false;}
    });
  }
  retry.addEventListener('click',()=>{loaded=false;load();});return {panel,load};
}
