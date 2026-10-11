import {XMLParser, XMLValidator} from 'fast-xml-parser';

const parser=new XMLParser({removeNSPrefix:true,ignoreAttributes:true,parseTagValue:false,
  isArray:name=>['TimedLeg','TrackSection','Position'].includes(name)});
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const normalized=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const line=value=>normalized(value).replace(/0+(?=\d)/g,'');
const array=value=>value===undefined ? [] : Array.isArray(value) ? value : [value];
const distance=(a,b)=>Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*111320*Math.cos(a[0]*Math.PI/180));
function stopXml(stop) {
  const id=String(stop?.station?.id||'');
  if(!/^\d{7}$|^ch:1:sloid:[\d:]+$/.test(id)) throw new Error('Missing OJP station reference.');
  return `<PlaceRef><siri:StopPointRef>${xml(id)}</siri:StopPointRef><Name><Text>${xml(stop.station.name)}</Text></Name></PlaceRef>`;
}
export function tripRequest(section,now=new Date()) {
  const departure=new Date(section.departure.departure);
  if(!Number.isFinite(departure.getTime())) throw new Error('Missing OJP departure time.');
  const timestamp=now.toISOString();
  return `<OJP xmlns="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri" version="2.0"><OJPRequest><siri:ServiceRequest><siri:RequestTimestamp>${timestamp}</siri:RequestTimestamp><siri:RequestorRef>UniEats</siri:RequestorRef><OJPTripRequest><siri:RequestTimestamp>${timestamp}</siri:RequestTimestamp><siri:MessageIdentifier>transit-shape</siri:MessageIdentifier><Origin>${stopXml(section.departure)}<DepArrTime>${departure.toISOString()}</DepArrTime></Origin><Destination>${stopXml(section.arrival)}</Destination><Params><NumberOfResults>3</NumberOfResults><IncludeTrackSections>true</IncludeTrackSections><IncludeLegProjection>true</IncludeLegProjection><IncludeIntermediateStops>false</IncludeIntermediateStops></Params></OJPTripRequest></siri:ServiceRequest></OJPRequest></OJP>`;
}
function* timedLegs(node) {
  if(!node || typeof node!=='object') return;
  for(const [key,value] of Object.entries(node)) {
    if(key==='TimedLeg') yield* array(value);
    else if(Array.isArray(value)) { for(const child of value) yield* timedLegs(child); }
    else yield* timedLegs(value);
  }
}
// Accept only geometry attached to the very same published service, stops and scheduled times.
// A parallel train departing at the same minute must never supply this journey's shape.
export function journeyProjection(response,section) {
  if(typeof response!=='string' || response.length>4_000_000 || /<!DOCTYPE|<!ENTITY/i.test(response)
    || XMLValidator.validate(response)!==true) throw new Error('Invalid OJP XML response.');
  const expected=line(`${section.journey.category}${section.journey.number||section.journey.name}`);
  const category=String(section.journey.category).toUpperCase();
  const localMode=['T','TRAM'].includes(category) ? 'tram' : ['B','BUS','NFB','BN'].includes(category) ? 'bus' : null;
  for(const leg of timedLegs(parser.parse(response))) {
    const service=leg.Service,board=leg.LegBoard,alight=leg.LegAlight;
    if(!service || !board || !alight || service.Cancelled==='true') continue;
    const codes=[service.PublicCode,service.PublishedServiceName?.Text,
      `${service.ProductCategory?.ShortName?.Text||service.Mode?.ShortName?.Text||''}${service.TrainNumber||''}`].map(line);
    const sameLocalService=localMode && service.Mode?.PtMode===localMode
      && [service.PublicCode,service.PublishedServiceName?.Text].map(line).includes(line(section.journey.number||section.journey.name));
    if(!(localMode ? sameLocalService : codes.includes(expected))
      || normalized(board.StopPointName?.Text)!==normalized(section.departure.station.name)
      || normalized(alight.StopPointName?.Text)!==normalized(section.arrival.station.name)
      || Date.parse(board.ServiceDeparture?.TimetabledTime)!==Date.parse(section.departure.departure)
      || Date.parse(alight.ServiceArrival?.TimetabledTime)!==Date.parse(section.arrival.arrival)) continue;
    const path=[];
    for(const track of array(leg.LegTrack?.TrackSection)) {
      for(const position of array(track.LinkProjection?.Position)) {
        const lat=Number(position.Latitude),lng=Number(position.Longitude);
        if(position.Latitude===undefined || position.Longitude===undefined || !Number.isFinite(lat)
          || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) return null;
        const point=[lat,lng],previous=path.at(-1);
        if(previous && distance(previous,point)>5000) return null;
        if(!previous || previous[0]!==lat || previous[1]!==lng) path.push(point);
      }
    }
    const stationPoint=stop=>[stop.station.coordinate.x,stop.station.coordinate.y];
    if(path.length<3 || path.length>50000 || distance(path[0],stationPoint(section.departure))>500
      || distance(path.at(-1),stationPoint(section.arrival))>500) continue;
    return {path,journeyRef:service.JourneyRef,operatingDay:service.OperatingDayRef};
  }
  return null;
}
