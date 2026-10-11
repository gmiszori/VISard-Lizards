import { menuLink } from './menus';
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text='') {const el=document.createElement(tag);el.textContent=text;return el;}
let queue:Promise<void>=Promise.resolve();
export function mealFood(place:{name:string;cuisine?:string;venueType?:string;sourceUrl?:string;websiteUrl?:string},planId:string|undefined,index:number,key:()=>string) {
  const panel=node('section'),heading=node('h4',`Food at ${place.name}`),status=node('p'),sources=node('div'),retry=node('button','Retry food search');
  panel.className='meal-menu';panel.setAttribute('aria-label',`Food at ${place.name}`);status.setAttribute('role','status');retry.type='button';retry.hidden=true;
  status.textContent=place.cuisine ? `Food tags: ${place.cuisine.replaceAll(';',', ').replaceAll('_',' ')}. Select to research this venue.` : `Select this option to find the kind of food served here.`;
  panel.append(heading,status,sources,retry);let loaded=false,loading=false;
  function load() {
    if(loaded || loading || !planId) return;loading=true;retry.hidden=true;
    queue=queue.catch(()=>{}).then(async()=>{
      if(!panel.isConnected) {loading=false;return;}
      status.textContent='Searching the web for food types…';
      try {
        const query=new URLSearchParams({planId:planId!,optionIndex:String(index)});
        const response=await fetch(`/api/route-planner/food?${query}`,{method:'POST',headers:{'X-OpenAI-Key':key()},cache:'no-store',signal:AbortSignal.timeout(95_000)});
        const data=await response.json();if(!response.ok) throw new Error(data.detail||'Food search failed.');
        status.textContent=data.description||'Food types could not be verified.';sources.replaceChildren();
        for(const source of data.sources||[]) {
          const url=menuLink(source.url);if(!url) continue;
          const row=node('p'),link=node('a',source.title||'Food source');link.href=url;link.target='_blank';link.rel='noopener noreferrer';row.append(link);sources.append(row);
        }
        loaded=true;retry.hidden=data.status==='researched';
      } catch(error) {status.textContent=error instanceof Error ? error.message : 'Food search unavailable.';retry.hidden=false;}
      finally {loading=false;}
    });
  }
  retry.addEventListener('click',()=>{loaded=false;load();});return {panel,load};
}
