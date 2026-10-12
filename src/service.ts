import { updateFeed, type FeedDeps } from './pipeline';

export type { FeedDeps } from './pipeline';

export type ServiceDeps = FeedDeps & {
	notify: (message: string) => void;
	logError: (error: unknown) => void;
};

/** Runs updates one at a time. */
export class FeedService {
	private running = false;
	private rerun = false;

	constructor(private deps: ServiceDeps) {}

	/**
	 * Manual runs report their outcome. Automatic runs only report failures.
	 * A call during a run is queued and runs once more afterwards.
	 */
	async rebuild(manual: boolean): Promise<void> {
		if (this.running) {
			this.rerun = true;
			return;
		}
		this.running = true;
		try {
			const result = await updateFeed(this.deps, manual);
			if (manual) this.deps.notify(`Publish feed: ${result}`);
		} catch (e) {
			this.deps.logError(e);
			this.deps.notify(
				`Publish feed failed: ${e instanceof Error ? e.message : String(e)}`,
			);
		} finally {
			this.running = false;
			if (this.rerun) {
				this.rerun = false;
				void this.rebuild(false);
			}
		}
	}
}
