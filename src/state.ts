const unescapeXml = (s: string) =>
	s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&');

/**
 * When each entry last surfaced, read from the previous feed. The feed is our only state:
 * it is public, survives reinstalls and is the same for every device that publishes.
 */
export function parseFeedState(xml: string | null): Map<string, Date> {
	const state = new Map<string, Date>();
	for (const m of (xml ?? '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
		const id = /<id>([\s\S]*?)<\/id>/.exec(m[1] ?? '')?.[1];
		const updated = /<updated>([\s\S]*?)<\/updated>/.exec(m[1] ?? '')?.[1];
		const at = updated ? new Date(updated) : null;
		if (id && at && !Number.isNaN(at.getTime())) state.set(unescapeXml(id), at);
	}
	return state;
}

/**
 * When a note moves to the top of the feed. A publish within the cooldown of the last time
 * it surfaced changes the entry's text but not its position. `previous` is that last time.
 */
export function surfaceTime(
	publishedAt: Date,
	previous: Date | undefined,
	cooldownMs: number,
): Date {
	if (!previous || cooldownMs <= 0) return publishedAt;
	const gap = publishedAt.getTime() - previous.getTime();
	return gap >= cooldownMs || gap < 0 ? publishedAt : previous;
}
