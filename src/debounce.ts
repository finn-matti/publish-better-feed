export interface Timers {
	set: (fn: () => void, ms: number) => number;
	clear: (id: number) => void;
}

/** `window` timers keep working when the plugin runs in a popout window. */
const windowTimers: Timers = {
	set: (fn, ms) => window.setTimeout(fn, ms),
	clear: (id) => window.clearTimeout(id),
};

/** Runs `fn` once, `getDelayMs()` after the last `schedule()` call. */
export function createDebouncer(
	fn: () => void,
	getDelayMs: () => number,
	timers: Timers = windowTimers,
) {
	let timer: number | null = null;
	const cancel = () => {
		if (timer !== null) timers.clear(timer);
		timer = null;
	};
	return {
		schedule() {
			cancel();
			timer = timers.set(() => {
				timer = null;
				fn();
			}, getDelayMs());
		},
		cancel,
	};
}
