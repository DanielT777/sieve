import type { Disposable } from './disposable';

/** Returns a debounced wrapper that coalesces rapid calls into a single delayed invocation. */
export function debounce(fn: () => void, delayMs: number): { call: () => void; flush: () => void } & Disposable {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  return {
    call() {
      if (disposed) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; fn(); }, delayMs);
    },
    /** Runs a pending invocation now instead of waiting for the delay. */
    flush() {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      fn();
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
