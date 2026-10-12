import { describe, expect, it } from 'vitest';
import { parseFeedState, surfaceTime } from '../src/state';

const T = (s: string) => new Date(s);

describe('parseFeedState', () => {
	it('reads id and updated per entry, unescaping the id', () => {
		const xml = `<feed><id>f</id><updated>2020-01-01T00:00:00.000Z</updated>
<entry><id>https://x.test/a&amp;b</id><title>A</title><updated>2026-10-12T10:00:00.000Z</updated></entry>
<entry>
  <id>https://x.test/c</id>
  <updated>2026-10-11T09:30:00.000Z</updated>
</entry></feed>`;
		const s = parseFeedState(xml);
		expect([...s.keys()]).toEqual(['https://x.test/a&b', 'https://x.test/c']);
		expect(s.get('https://x.test/c')).toEqual(T('2026-10-11T09:30:00.000Z'));
	});

	it('returns an empty state for a missing or broken feed', () => {
		expect(parseFeedState(null).size).toBe(0);
		expect(parseFeedState('not xml at all').size).toBe(0);
		expect(parseFeedState('<entry><id>x</id><updated>nope</updated></entry>').size).toBe(0);
	});
});

describe('surfaceTime', () => {
	const prev = T('2026-10-12T10:00:00Z');
	const H = 3_600_000;
	it('surfaces a note it has not seen before', () => {
		expect(surfaceTime(T('2026-10-12T11:00:00Z'), undefined, 24 * H)).toEqual(T('2026-10-12T11:00:00Z'));
	});
	it('keeps the previous time within the cooldown', () => {
		expect(surfaceTime(T('2026-10-12T10:05:00Z'), prev, 24 * H)).toBe(prev);
		expect(surfaceTime(T('2026-10-13T09:59:59Z'), prev, 24 * H)).toBe(prev);
	});
	it('surfaces again once the cooldown has passed, exactly at the boundary too', () => {
		expect(surfaceTime(T('2026-10-13T10:00:00Z'), prev, 24 * H)).toEqual(T('2026-10-13T10:00:00Z'));
	});
	it('surfaces when the previous time is in the future or the cooldown is off', () => {
		expect(surfaceTime(T('2026-10-12T09:00:00Z'), prev, 24 * H)).toEqual(T('2026-10-12T09:00:00Z'));
		expect(surfaceTime(T('2026-10-12T10:05:00Z'), prev, 0)).toEqual(T('2026-10-12T10:05:00Z'));
	});
});
