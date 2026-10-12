import { describe, expect, it } from 'vitest';
import { statusText } from '../src/status';

const at = new Date(2026, 9, 12, 9, 5);

describe('statusText', () => {
	it('shows nothing before anything has happened', () => {
		expect(statusText({ state: 'idle' })).toEqual({ text: '', tooltip: '' });
	});

	it('shows pending and running, even if there is an older result', () => {
		const last = { at, ok: true, message: 'updated (3 entries)' };
		expect(statusText({ state: 'waiting', last }).text).toBe('Feed: update pending…');
		expect(statusText({ state: 'running', last }).text).toBe('Feed: updating…');
	});

	it('shows when the last update finished, with its message as tooltip', () => {
		const s = statusText({ state: 'idle', last: { at, ok: true, message: 'updated (3 entries)' } });
		expect(s.text).toBe('Feed: updated 09:05');
		expect(s.tooltip).toContain('updated (3 entries)');
	});

	it('shows a failure and offers to try again', () => {
		const s = statusText({ state: 'idle', last: { at, ok: false, message: 'GitHub PUT failed (401)' } });
		expect(s.text).toBe('Feed: update failed');
		expect(s.tooltip).toContain('GitHub PUT failed (401)');
		expect(s.tooltip).toContain('try again');
	});
});
