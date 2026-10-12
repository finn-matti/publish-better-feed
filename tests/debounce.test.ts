import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebouncer as create, type Timers } from '../src/debounce';

const timers: Timers = {
	set: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
	clear: (id) => globalThis.clearTimeout(id),
};
const createDebouncer = (fn: () => void, delay: () => number) => create(fn, delay, timers);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createDebouncer', () => {
	it('fires once after the last schedule', () => {
		const fn = vi.fn();
		const d = createDebouncer(fn, () => 1000);
		d.schedule();
		vi.advanceTimersByTime(900);
		d.schedule();
		vi.advanceTimersByTime(900);
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('can fire again after it has fired', () => {
		const fn = vi.fn();
		const d = createDebouncer(fn, () => 10);
		d.schedule();
		vi.advanceTimersByTime(10);
		d.schedule();
		vi.advanceTimersByTime(10);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('cancel prevents the pending call', () => {
		const fn = vi.fn();
		const d = createDebouncer(fn, () => 10);
		d.schedule();
		d.cancel();
		vi.advanceTimersByTime(100);
		expect(fn).not.toHaveBeenCalled();
	});

	it('reads the delay when scheduling', () => {
		const fn = vi.fn();
		let delay = 1000;
		const d = createDebouncer(fn, () => delay);
		delay = 50;
		d.schedule();
		vi.advanceTimersByTime(50);
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
