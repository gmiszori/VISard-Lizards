export interface ChipChange { name: string; values: string[] }

/** Delegation also supports rating rows cloned after mounting. */
export function mountChipSelect(root: HTMLElement, onChange: (change: ChipChange) => void): void {
  const choose = (button: HTMLButtonElement) => {
    const group = button.closest<HTMLElement>('[data-chip-group]')!;
    if (group.dataset.mode === 'single') {
      syncChipSelect(group, [button.dataset.value!]);
    } else {
      button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
    }
    onChange({ name: group.dataset.chipGroup!, values: [...group.querySelectorAll<HTMLButtonElement>('[data-value][aria-pressed="true"]')].map(b => b.dataset.value!) });
  };
  root.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-value]');
    if (button && root.contains(button) && !button.disabled) choose(button);
  });
  root.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-value]');
    const group = button?.closest<HTMLElement>('[data-chip-group]');
    if (!button || group?.dataset.mode !== 'single') return;
    event.preventDefault();
    const buttons = [...group.querySelectorAll<HTMLButtonElement>('button[data-value]:not(:disabled)')];
    const i = buttons.indexOf(button);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
      (i + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
    if (buttons[next]) choose(buttons[next]);
  });
}
export function syncChipSelect(group: HTMLElement, values: string[]): void {
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('button[data-value]')];
  for (const button of buttons) {
    const selected = values.includes(button.dataset.value!);
    button.setAttribute('aria-pressed', String(selected));
    if (group.dataset.mode === 'single') {
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected || (!values.length && button === buttons[0]) ? 0 : -1;
    }
  }
}
