import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../../src/shared/debounce';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('debounce', () => {
  it('runs a pending call immediately on flush, once', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced.call();
    debounced.call();

    debounced.flush();
    vi.advanceTimersByTime(300);
    debounced.flush();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores calls after it is disposed', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced.dispose();

    debounced.call();
    vi.advanceTimersByTime(300);

    expect(fn).not.toHaveBeenCalled();
  });
});
