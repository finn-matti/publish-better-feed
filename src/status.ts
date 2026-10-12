import type { Status } from './runner';

const clock = (d: Date) =>
	`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** The status bar text and its tooltip. Empty text before anything has happened. */
export function statusText(s: Status): { text: string; tooltip: string } {
	if (s.state === 'waiting') {
		return { text: 'Feed: update pending…', tooltip: 'Updating shortly. Click to update now.' };
	}
	if (s.state === 'running') return { text: 'Feed: updating…', tooltip: 'Updating the feed.' };
	if (!s.last) return { text: '', tooltip: '' };
	const when = clock(s.last.at);
	return s.last.ok
		? { text: `Feed: updated ${when}`, tooltip: `${s.last.message}. Click to update now.` }
		: { text: 'Feed: update failed', tooltip: `${s.last.message}. Click to try again.` };
}
