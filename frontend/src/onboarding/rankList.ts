import type { Profile } from './profile.ts';
import { t } from './i18n';
export function renderRankList(root: HTMLElement, priorities: Profile['priority']): void {
  priorities.forEach((priority, index) => {
    const row = root.querySelector<HTMLElement>(`[data-priority="${priority}"]`)!;
    if (root.children[index] !== row) root.insertBefore(row, root.children[index] ?? null);
    row.querySelector<HTMLElement>('.ob-rank-number')!.textContent = String(index + 1);
    row.querySelector<HTMLButtonElement>('[data-rank-handle]')!.setAttribute('aria-label', `${t('reorder')}: ${t(priority)}`);
    row.querySelectorAll<HTMLButtonElement>('[data-rank-move]').forEach(button => {
      const up = button.dataset.rankMove === '-1';
      button.disabled = up ? index === 0 : index === priorities.length - 1;
      button.setAttribute('aria-label', `${t(up ? 'up' : 'down')}: ${t(priority)}`);
    });
  });
}
export function mountRankList(root: HTMLElement, get: () => Profile['priority'], change: (value: Profile['priority']) => void): void {
  const commit = (values: Profile['priority']) => {
    change(values);
    const status = root.parentElement?.querySelector<HTMLElement>('[data-rank-status]');
    if (status) status.textContent = `${t('rankOrder')}: ${values.map(value => t(value)).join(', ')}`;
  };
  const moveRow = (row: HTMLElement, direction: number) => {
    const values = [...get()];
    const i = values.indexOf(row.dataset.priority as Profile['priority'][number]);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= values.length) return;
    [values[i], values[j]] = [values[j]!, values[i]!];
    commit(values);
  };
  root.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-rank-move]');
    const row = button?.closest<HTMLElement>('[data-priority]');
    if (!button || !row || button.disabled) return;
    moveRow(row, Number(button.dataset.rankMove));
    const focus = button.disabled ? row.querySelector<HTMLButtonElement>('button:not(:disabled)') : button;
    focus?.focus();
  });

  type Drag = { pointer: number; row: HTMLElement; rows: HTMLElement[]; values: Profile['priority'];
    from: number; to: number; startY: number; centres: number[]; stride: number };
  let drag: Drag | null = null;
  const stop = (save: boolean) => {
    if (!drag) return;
    const current = drag;
    drag = null;
    for (const row of current.rows) { row.style.removeProperty('transform'); row.classList.remove('ob-rank-dragging'); }
    root.removeAttribute('data-dragging');
    if (root.hasPointerCapture(current.pointer)) root.releasePointerCapture(current.pointer);
    if (save && current.from !== current.to) {
      const values = [...current.values];
      const [value] = values.splice(current.from, 1);
      values.splice(current.to, 0, value!);
      commit(values);
    }
    current.row.querySelector<HTMLButtonElement>('[data-rank-handle]')?.focus({ preventScroll: true });
  };
  root.addEventListener('pointerdown', event => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('[data-priority]');
    if (!row || !event.isPrimary || event.button !== 0 || target.closest('[data-rank-move]')) return;
    event.preventDefault();
    const rows = [...root.querySelectorAll<HTMLElement>('[data-priority]')];
    const centres = rows.map(item => { const r = item.getBoundingClientRect(); return r.top + r.height / 2; });
    const from = rows.indexOf(row);
    drag = { pointer: event.pointerId, row, rows, values: [...get()], from, to: from,
      startY: event.clientY, centres, stride: (centres[1] ?? centres[0]!) - centres[0]! };
    root.setPointerCapture(event.pointerId);
    root.setAttribute('data-dragging', 'true');
    row.classList.add('ob-rank-dragging');
    row.querySelector<HTMLButtonElement>('[data-rank-handle]')?.focus({ preventScroll: true });
  });
  root.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    event.preventDefault();
    const d = drag;
    const centre = Math.max(d.centres[0]!, Math.min(d.centres[d.centres.length - 1]!, d.centres[d.from]! + event.clientY - d.startY));
    d.to = d.centres.reduce((nearest, y, i) => Math.abs(y - centre) < Math.abs(d.centres[nearest]! - centre) ? i : nearest, d.from);
    d.rows.forEach((row, i) => {
      const offset = i === d.from ? centre - d.centres[d.from]! :
        d.from < d.to && i > d.from && i <= d.to ? -d.stride :
          d.from > d.to && i >= d.to && i < d.from ? d.stride : 0;
      row.style.transform = `translateY(${offset}px)`;
    });
  });
  root.addEventListener('pointerup', event => { if (event.pointerId === drag?.pointer) stop(true); });
  root.addEventListener('pointercancel', event => { if (event.pointerId === drag?.pointer) stop(false); });
  root.addEventListener('lostpointercapture', () => stop(false));
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); stop(false); return; }
    const handle = (event.target as HTMLElement).closest('[data-rank-handle]');
    const row = handle?.closest<HTMLElement>('[data-priority]');
    if (row && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); moveRow(row, event.key === 'ArrowUp' ? -1 : 1);
    }
  });
}
