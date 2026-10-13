/** Transient feedback is deliberately separate from saved learning progress. */
export function createFeedback(onChange, schedule = setTimeout, cancel = clearTimeout) {
  let timer, generation = 0;
  function clear() { generation++; cancel(timer); timer = undefined; onChange(null); }
  function wrong(pressed, target) {
    clear(); const current = generation;
    onChange({pressed, target});
    timer = schedule(() => { if (current === generation) clear(); }, 1800);
  }
  return { wrong, clear };
}
export function isControlActivation(event, element) {
  return (event.key === 'Enter' || event.key === ' ') &&
    Boolean(element?.closest?.('button,a,input,select,textarea,[contenteditable="true"]'));
}
