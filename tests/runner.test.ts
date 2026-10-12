import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupError } from '../src/pipeline';
import { FeedRunner, QUIET_MS, type Debounced, type RunnerDeps } from '../src/runner';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Like Obsidian's `debounce(fn, ms, true)`: each call restarts the wait. */
const debounce = (fn: () => void, ms: number): Debounced => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const d = (() => {
		clearTimeout(timer);
		timer = setTimeout(fn, ms);
	}) as Debounced;
	d.cancel = () => clearTimeout(timer);
	return d;
};

function setup(update: RunnerDeps['update'] = () => Promise.resolve('updated (2 entries)')) {
	const events: string[] = [];
	const notify = vi.fn((m: string) => events.push(`notice: ${m}`));
	const logError = vi.fn();
	const updateSpy = vi.fn(update);
	const dirty: boolean[] = [];
	const runner = new FeedRunner({
		update: updateSpy,
		debounce,
		showProgress: (m) => {
			events.push(`progress: ${m}`);
			return () => events.push('progress hidden');
		},
		notify,
		logError,
		setDirty: (d) => dirty.push(d),
	});
	return { runner, update: updateSpy, notify, logError, events, dirty };
}

const seconds = (n: number) => vi.advanceTimersByTimeAsync(n * 1000);

describe('FeedRunner', () => {
	it('starts idle, waits after a publish, updates once it has been quiet, then is idle again', async () => {
		const { runner, update } = setup();
		expect(runner.state).toBe('idle');
		runner.requestUpdate();
		expect(runner.state).toBe('waiting');
		await seconds(QUIET_MS / 1000 - 1);
		expect(update).not.toHaveBeenCalled();
		await seconds(1);
		expect(update).toHaveBeenCalledWith(false);
		expect(runner.state).toBe('idle');
	});

	it('turns a burst of uploads into one update, ten seconds after the last', async () => {
		const { runner, update } = setup();
		runner.requestUpdate();
		await seconds(3);
		runner.requestUpdate();
		await seconds(3);
		runner.requestUpdate();
		await seconds(9);
		expect(update).not.toHaveBeenCalled();
		await seconds(1);
		expect(update).toHaveBeenCalledTimes(1);
	});

	it('shows running while updating', async () => {
		let finish!: () => void;
		const { runner } = setup(() => new Promise((resolve) => (finish = () => resolve('ok'))));
		runner.requestUpdate();
		await seconds(10);
		expect(runner.state).toBe('running');
		finish();
		await seconds(0);
		expect(runner.state).toBe('idle');
	});

	it('never overlaps updates: a publish during one waits for quiet, then runs afterwards', async () => {
		let running = 0;
		let maxRunning = 0;
		let finish!: () => void;
		const { runner, update } = setup(() => {
			running++;
			maxRunning = Math.max(maxRunning, running);
			return new Promise((resolve) => {
				finish = () => {
					running--;
					resolve('ok');
				};
			});
		});
		runner.requestUpdate();
		await seconds(10);
		expect(update).toHaveBeenCalledTimes(1);

		await seconds(1);
		runner.requestUpdate(); // a publish while the update is running
		await seconds(10); // its wait is over, but the update is still running
		expect(update).toHaveBeenCalledTimes(1);
		expect(runner.state).toBe('running');

		finish();
		await seconds(0);
		expect(runner.state).toBe('waiting'); // the wait was started again
		await seconds(10);
		expect(update).toHaveBeenCalledTimes(2);
		finish();
		await seconds(0);
		expect(maxRunning).toBe(1);
		expect(runner.state).toBe('idle');
	});

	it('updateNow runs at once and drops the pending wait', async () => {
		const { runner, update } = setup();
		runner.requestUpdate();
		await runner.updateNow();
		expect(update).toHaveBeenCalledWith(true);
		expect(runner.state).toBe('idle');
		await seconds(30);
		expect(update).toHaveBeenCalledTimes(1);
	});

	it('updateNow during an update does not start a second one', async () => {
		let finish!: () => void;
		const { runner, update, notify } = setup(
			() => new Promise((resolve) => (finish = () => resolve('ok'))),
		);
		const first = runner.updateNow();
		await runner.updateNow();
		expect(update).toHaveBeenCalledTimes(1);
		expect(notify).toHaveBeenCalledWith('Publish feed: already updating');
		finish();
		await first;
	});

	it('cancel stops a pending update', async () => {
		const { runner, update } = setup();
		runner.requestUpdate();
		runner.cancel();
		expect(runner.state).toBe('idle');
		await seconds(60);
		expect(update).not.toHaveBeenCalled();
	});
});

describe('FeedRunner notices', () => {
	it('shows a notice while updating, hides it, then reports the result, for automatic updates too', async () => {
		const { runner, events } = setup();
		runner.requestUpdate();
		await seconds(10);
		expect(events).toEqual([
			'progress: Publish feed: updating…',
			'progress hidden',
			'notice: Publish feed: updated (2 entries)',
		]);
	});

	it('hides the progress notice and reports the error when the update fails', async () => {
		const { runner, update, events, logError } = setup();
		update.mockRejectedValueOnce(new Error('GitHub PUT failed (401)'));
		await runner.updateNow();
		expect(events).toEqual([
			'progress: Publish feed: updating…',
			'progress hidden',
			'notice: Publish feed failed: GitHub PUT failed (401)',
		]);
		expect(logError).toHaveBeenCalledTimes(1);
		expect(runner.state).toBe('idle');
	});

	it('recovers after a failure', async () => {
		const { runner, update, notify } = setup();
		update.mockRejectedValueOnce(new Error('boom'));
		await runner.updateNow();
		await runner.updateNow();
		expect(notify).toHaveBeenLastCalledWith('Publish feed: updated (2 entries)');
	});
});

describe('FeedRunner owes an update until one succeeds', () => {
	it('is owed from the first publish and paid by a successful update', async () => {
		const { runner, dirty } = setup();
		runner.requestUpdate();
		expect(dirty).toEqual([true]);
		await seconds(10);
		expect(dirty).toEqual([true, false]);
	});

	it('stays owed after a failure, so the next start finishes it', async () => {
		const { runner, update, dirty } = setup();
		update.mockRejectedValueOnce(new Error('offline'));
		runner.requestUpdate();
		await seconds(10);
		expect(dirty).toEqual([true]);
	});

	it('is not owed when only the user can fix the problem', async () => {
		const { runner, update, dirty } = setup();
		update.mockRejectedValueOnce(new SetupError('No GitHub token configured'));
		runner.requestUpdate();
		await seconds(10);
		expect(dirty).toEqual([true, false]);
	});

	it('is still owed when another publish arrived during the update', async () => {
		let finish!: () => void;
		const { runner, dirty } = setup(
			() => new Promise((resolve) => (finish = () => resolve('ok'))),
		);
		runner.requestUpdate();
		await seconds(10);
		runner.requestUpdate();
		finish();
		await seconds(0);
		expect(dirty.at(-1)).toBe(true);
	});

	it('a manual update that succeeds pays it too', async () => {
		const { runner, dirty } = setup();
		runner.requestUpdate();
		await runner.updateNow();
		expect(dirty).toEqual([true, false]);
	});
});
