/** Keep native range semantics and keyboard controls, with an explicit drag path
 * for mobile browsers. Capture belongs to the input throughout the gesture. */
export function mountBudgetSlider(slider: HTMLInputElement, onInput: (value: number) => void): void {
  let pointer: number | null = null;
  const move = (event: PointerEvent) => {
    const bounds = slider.getBoundingClientRect();
    const thumbRadius = 12;
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left - thumbRadius) / Math.max(1, bounds.width - thumbRadius * 2)));
    const min = Number(slider.min);
    const max = Number(slider.max);
    const step = Number(slider.step) || 0.5;
    const value = Math.min(max, Math.max(min, min + Math.round(fraction * (max - min) / step) * step));
    if (Number(slider.value) !== value) {
      slider.value = String(value);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  slider.addEventListener('input', () => onInput(Number(slider.value)));
  slider.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    pointer = event.pointerId;
    slider.setPointerCapture(pointer);
    slider.focus({ preventScroll: true });
    move(event);
  });
  slider.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    event.preventDefault();
    move(event);
  });
  const release = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    if (event.type === 'pointerup') move(event);
    pointer = null;
    if (slider.hasPointerCapture(event.pointerId)) slider.releasePointerCapture(event.pointerId);
  };
  slider.addEventListener('pointerup', release);
  slider.addEventListener('pointercancel', release);
  slider.addEventListener('lostpointercapture', () => { pointer = null; });
}
