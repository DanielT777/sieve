import type { Disposable } from './disposable';

/** Returns a debounced wrapper that coalesces rapid calls into a single delayed invocation. */
export function debounce(fn: () => void, delayMs: number): { call: () => void } & Disposable {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    call() {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; fn(); }, delayMs);
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
