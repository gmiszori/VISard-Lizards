export function formatDate(date: Date): string {
  return `${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.${date.getFullYear()}`;
}
export function parseDateTime(value: string,time='00:00'): Date | null {
  const parts=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value),clock=/^(\d{2}):(\d{2})$/.exec(time);
  if(!parts || !clock) return null;
  const [,day,month,year]=parts.map(Number),[,hour,minute]=clock.map(Number);
  const date=new Date(year,month-1,day,hour,minute);
  return date.getFullYear()===year && date.getMonth()===month-1 && date.getDate()===day
    && date.getHours()===hour && date.getMinutes()===minute ? date : null;
}
export function attachCalendar(id: string,initial: Date) {
  const input=document.querySelector<HTMLInputElement>(`#${id}`)!;
  const time=document.querySelector<HTMLInputElement>(`#${id}-time`)!;
  const popup=document.querySelector<HTMLElement>(`#${id}-calendar`)!;
  const toggle=document.querySelector<HTMLButtonElement>(`#${id}-calendar-toggle`)!;
  input.value=formatDate(initial);
  time.value=`${String(initial.getHours()).padStart(2,'0')}:${String(initial.getMinutes()).padStart(2,'0')}`;
  let month=new Date(initial.getFullYear(),initial.getMonth(),1);
  function close() {popup.hidden=true;toggle.setAttribute('aria-expanded','false');}
  function validate() {
    input.setCustomValidity(parseDateTime(input.value) ? '' : 'Enter a valid date as DD.MM.YYYY.');
  }
  function button(label: string,action:()=>void,className='') {
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=className;
    button.addEventListener('click',action);return button;
  }
  function render() {
    popup.replaceChildren();
    const heading=document.createElement('div');heading.className='calendar-heading';
    const title=document.createElement('strong');title.textContent=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'}).format(month);
    title.setAttribute('aria-live','polite');
    const previous=button('‹',()=>{month.setMonth(month.getMonth()-1);render();},'calendar-nav');previous.setAttribute('aria-label','Previous month');
    const next=button('›',()=>{month.setMonth(month.getMonth()+1);render();},'calendar-nav');next.setAttribute('aria-label','Next month');
    heading.append(previous,title,next);popup.append(heading);
    const grid=document.createElement('div');grid.className='calendar-grid';
    for(const name of ['Mo','Tu','We','Th','Fr','Sa','Su']) {
      const weekday=document.createElement('span');weekday.className='calendar-weekday';weekday.textContent=name;grid.append(weekday);
    }
    const offset=(month.getDay()+6)%7,days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    for(let i=0;i<offset;i++) {const blank=document.createElement('span');blank.setAttribute('aria-hidden','true');grid.append(blank);}
    for(let day=1;day<=days;day++) {
      const date=new Date(month.getFullYear(),month.getMonth(),day),value=formatDate(date);
      const cell=button(String(day),()=>{input.value=value;validate();input.dispatchEvent(new Event('change'));close();input.focus();},'calendar-day');
      cell.setAttribute('aria-label',value);cell.setAttribute('aria-pressed',String(input.value===value));
      if(value===formatDate(new Date())) cell.setAttribute('aria-current','date');
      grid.append(cell);
    }
    popup.append(grid);
  }
  toggle.addEventListener('click',()=>{
    if(!popup.hidden) return close();
    const selected=parseDateTime(input.value)||initial;month=new Date(selected.getFullYear(),selected.getMonth(),1);
    render();popup.hidden=false;toggle.setAttribute('aria-expanded','true');
    popup.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  });
  document.addEventListener('click',event=>{if(!popup.contains(event.target as Node) && !toggle.contains(event.target as Node)) close();});
  popup.addEventListener('keydown',event=>{
    if(event.key==='Escape') {close();toggle.focus();return;}
    const offset=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Record<string,number>)[event.key];
    const day=parseDateTime((event.target as HTMLElement).getAttribute('aria-label')||'');
    if(offset && day) {
      event.preventDefault();day.setDate(day.getDate()+offset);
      if(day.getMonth()!==month.getMonth() || day.getFullYear()!==month.getFullYear()) {month=new Date(day.getFullYear(),day.getMonth(),1);render();}
      popup.querySelector<HTMLButtonElement>(`[aria-label="${formatDate(day)}"]`)?.focus();
    }
  });
  input.addEventListener('input',validate);validate();
  return ()=>parseDateTime(input.value,time.value);
}
