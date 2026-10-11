export type JourneyTiming={totalSeconds:number;travelSeconds:number;mealSeconds:number;waitingSeconds:number;spareSeconds:number};
export function timingMinutes(timing:JourneyTiming) {
  const total=Math.ceil(timing.totalSeconds/60),meal=Math.floor(timing.mealSeconds/60),travel=Math.floor(timing.travelSeconds/60);
  return {total,meal,travel,waiting:Math.max(0,total-meal-travel),spare:Math.floor(timing.spareSeconds/60)};
}
const duration=(minutes:number)=>minutes>=60 ? `${Math.floor(minutes/60)} h ${minutes%60 ? `${minutes%60} min` : ''}`.trim() : `${minutes} min`;
export function journeyTiming(timing:JourneyTiming) {
  const values=timingMinutes(timing),panel=document.createElement('section');panel.className='journey-totals';panel.setAttribute('aria-label','Journey time');
  for(const [label,key] of [['Total journey','total'],['Travelling','travel'],['Meal','meal'],['Waiting','waiting'],['Before deadline','spare']] as const) {
    if(key==='meal' && !values.meal) continue;
    const item=document.createElement('div'),value=document.createElement('strong'),name=document.createElement('span');
    value.textContent=duration(values[key]);name.textContent=label;item.append(value,name);panel.append(item);
  }
  return panel;
}
