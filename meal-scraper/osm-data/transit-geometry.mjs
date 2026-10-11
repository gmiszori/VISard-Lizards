// Display geometry only: timetables and journey selection remain authoritative.
const distance = (a,b) => Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*111320*Math.cos(a[0]*Math.PI/180));
const same = (a,b) => distance(a,b)<2;
export function transitReference(journey) {
  const category=String(journey.category||'').toUpperCase(), number=String(journey.number||'').trim();
  if(!/^[0-9]{1,4}[A-Z]?$/.test(number)) return null;
  if(['S','IC','IR','RE','R','EC'].includes(category)) return {mode:'train',ref:category+number};
  if(['T','TRAM'].includes(category)) return {mode:'tram',ref:number};
  if(['B','BUS','NFB','BN'].includes(category)) return {mode:'bus',ref:number};
  return null;
}
export function relationChains(relation) {
  const ways=(relation.members||[]).filter(member=>member.type==='way' && !/platform|stop/.test(member.role||''))
    .map(member=>(member.geometry||[]).map(p=>[p.lat,p.lon])).filter(path=>path.length>1 && path.every(p=>p.every(Number.isFinite)));
  const chains=[];let chain=[];
  for(let i=0;i<ways.length;i++) {
    let path=ways[i];
    if(chain.length) {
      if(same(chain.at(-1),path.at(-1))) path=[...path].reverse();
      if(!same(chain.at(-1),path[0])) {chains.push(chain);chain=[];}
    }
    if(!chain.length && ways[i+1]) {
      const next=ways[i+1];
      if(same(path[0],next[0])||same(path[0],next.at(-1))) path=[...path].reverse();
    }
    chain.push(...(chain.length ? path.slice(1) : path));
  }
  if(chain.length) chains.push(chain);return chains;
}
function project(stop,path) {
  let best={distance:Infinity};
  const scale=Math.cos(stop[0]*Math.PI/180);
  for(let i=0;i<path.length-1;i++) {
    const a=path[i],b=path[i+1],dx=(b[1]-a[1])*scale,dy=b[0]-a[0];
    const t=Math.max(0,Math.min(1,((stop[1]-a[1])*scale*dx+(stop[0]-a[0])*dy)/(dx*dx+dy*dy||1)));
    const point=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],gap=distance(stop,point);
    if(gap<best.distance) best={distance:gap,position:i+t,point};
  }
  return best;
}
export function matchTransitGeometry(relations,stops,mode,preferShortest=false) {
  if(stops.length<2) return null;
  // Consecutive identical board/alight entries are common in passList.
  stops=stops.filter((p,i)=>i===0 || !same(p,stops[i-1]));
  if(stops.length<2) return null;
  let best;
  for(const relation of relations || []) for(const chain of relationChains(relation)) {
    const matches=stops.map(stop=>project(stop,chain));
    if(matches.some(hit=>hit.distance>(mode==='train' ? 500 : 180))) continue;
    const direction=matches.at(-1).position>=matches[0].position ? 1 : -1;
    if(matches.some((hit,i)=>i>0 && direction*(hit.position-matches[i-1].position)<-.001)) continue;
    const first=direction===1 ? matches[0] : matches.at(-1),last=direction===1 ? matches.at(-1) : matches[0];
    let path=[first.point,...chain.slice(Math.floor(first.position)+1,Math.ceil(last.position)),last.point];
    if(direction<0) path.reverse();
    const length=path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);
    const straight=distance(stops[0],stops.at(-1));
    if(length>Math.max(straight*4,straight+5000)) continue;
    const score=matches.reduce((sum,hit)=>sum+hit.distance,0)/matches.length;
    const rank=score+(preferShortest ? length/100 : 0);
    if(!best || rank<best.rank) best={path,score,rank,relationId:relation.id};
  }
  return best || null;
}

export function transitGeometryQuery(journey,stops) {
  const category=String(journey.category||'').toUpperCase();
  const number=String(journey.number||'').trim();
  const train=['S','IC','IR','RE','R','EC'].includes(category);
  if(train && /^[0-9]{1,6}$/.test(number) && (number.length>2 || category==='EC') && category!=='S') {
    // Train numbers are not OSM line references. Match a rail corridor through published stations.
    const bounds=p=>[p[0]-.008,p[1]-.012,p[0]+.008,p[1]+.012].map(n=>n.toFixed(5)).join(',');
    if(stops.length<2 || !stops.every(p=>p.length===2 && p.every(Number.isFinite))) return null;
    const from=bounds(stops[0]),to=bounds(stops.at(-1));
    return {mode:'train',kind:'osm_rail_corridor',key:`rail:${from}:${to}`,
      query:`[out:json][timeout:7];relation[type=route][route=train](${from})->.board;relation.board(${to});out geom;`};
  }
  const service=transitReference(journey);if(!service) return null;
  const ref=service.ref.replace(/([A-Z]+)(\d)/,'$1 ?$2');
  return {...service,kind:'osm_transit_path',key:`${service.mode}:${service.ref}`,
    query:`[out:json][timeout:7];relation[type=route][route=${service.mode}][ref~"^${ref}$"](47.1,8.2,47.7,8.9);out geom;`};
}
