import { SetupError } from './pipeline';

/** After the last upload, wait this long before updating: one publish is many uploads. */
export const QUIET_MS = 10_000;

export type RunState = 'idle' | 'waiting' | 'running';

/** What Obsidian's `debounce` returns: call it to (re)start the wait. */
export interface Debounced {
	(): void;
	cancel(): void;
}

export interface RunnerDeps {
	/** One update, start to finish (`updateFeed`). Throws if it can't. */
	update: (manual: boolean) => Promise<string>;
	/** Obsidian's `debounce`, passed in so tests can use their own timer. */
	debounce: (fn: () => void, ms: number) => Debounced;
	/** Shows a notice that stays until the returned function is called. */
	showProgress: (message: string) => () => void;
	notify: (message: string) => void;
	logError: (error: unknown) => void;
	/**
	 * True from the moment a publish is seen until an update succeeds, so it can be saved and
	 * an update interrupted by closing Obsidian is finished at the next start.
	 */
	setDirty?: (dirty: boolean) => void;
}

/**
 * The lifecycle of an update, in one place:
 *
 *   idle --publish--> waiting (until 10 s pass without another upload) --> running --> idle
 *
 * A publish while an update is running just starts the wait again. The next update starts when
 * things have been quiet and the current one is done, so updates never overlap. While one runs, a
 * notice says so; when it ends, a notice says how it went.
 */
export class FeedRunner {
	private running = false;
	private waiting = false;
	private readonly soon: Debounced;

	constructor(private deps: RunnerDeps) {
		this.soon = deps.debounce(() => this.waitIsOver(), QUIET_MS);
	}

	get state(): RunState {
		return this.running ? 'running' : this.waiting ? 'waiting' : 'idle';
	}

	/** Something was published: update once it has been quiet for a while. */
	requestUpdate(): void {
		this.waiting = true;
		this.deps.setDirty?.(true);
		this.soon();
	}

	/** The user asked for an update right now. */
	async updateNow(): Promise<void> {
		if (this.running) {
			this.deps.notify('Publish feed: already updating');
			return;
		}
		this.soon.cancel();
		this.waiting = false;
		await this.run(true);
	}

	/** Stops a pending update, e.g. when the plugin is unloaded. */
	cancel(): void {
		this.soon.cancel();
		this.waiting = false;
	}

	private waitIsOver(): void {
		this.waiting = false;
		if (this.running) this.requestUpdate();
		else void this.run(false);
	}

	private async run(manual: boolean): Promise<void> {
		this.running = true;
		const hideProgress = this.deps.showProgress('Publish feed: updating…');
		let message: string;
		try {
			const result = await this.deps.update(manual);
			// A publish that arrived meanwhile still needs an update.
			if (!this.waiting) this.deps.setDirty?.(false);
			message = `Publish feed: ${result}`;
		} catch (e) {
			// A failure keeps the update owed, unless only the user can fix it.
			if (e instanceof SetupError && !this.waiting) this.deps.setDirty?.(false);
			this.deps.logError(e);
			message = `Publish feed failed: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			this.running = false;
			hideProgress();
		}
		this.deps.notify(message);
	}
}
