import type { Profile } from './profile.ts';
import { t } from './i18n';
export function renderRankList(root: HTMLElement, priorities: Profile['priority']): void {
  priorities.forEach((priority, index) => {
    const row = root.querySelector<HTMLElement>(`[data-priority="${priority}"]`)!;
    if (root.children[index] !== row) root.insertBefore(row, root.children[index] ?? null);
    row.querySelector<HTMLElement>('.ob-rank-number')!.textContent = String(index + 1);
    row.querySelectorAll<HTMLButtonElement>('[data-rank-move]').forEach(button => {
      const up = button.dataset.rankMove === '-1';
      button.disabled = up ? index === 0 : index === priorities.length - 1;
      button.setAttribute('aria-label', `${t(up ? 'up' : 'down')}: ${t(priority)}`);
    });
  });
}
export function mountRankList(root: HTMLElement, get: () => Profile['priority'], change: (value: Profile['priority']) => void): void {
  root.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-rank-move]');
    const row = button?.closest<HTMLElement>('[data-priority]');
    if (!button || !row || button.disabled) return;
    const values = [...get()];
    const i = values.indexOf(row.dataset.priority as Profile['priority'][number]);
    const j = i + Number(button.dataset.rankMove);
    if (j < 0 || j >= values.length) return;
    [values[i], values[j]] = [values[j]!, values[i]!];
    change(values);
    const focus = button.disabled ? row.querySelector<HTMLButtonElement>('button:not(:disabled)') : button;
    focus?.focus();
  });
}
