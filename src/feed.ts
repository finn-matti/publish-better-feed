import type { FeedEntry } from './entries';

export interface FeedMeta {
	title: string;
	siteUrl: string;
	feedUrl: string;
	author: string;
}

const escapeXml = (s: string) =>
	s
		// eslint-disable-next-line no-control-regex -- strip characters that are invalid in XML 1.0
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

/** Deterministic for equal input, so an unchanged feed produces no commit. */
export function buildAtom(meta: FeedMeta, entries: FeedEntry[]): string {
	const updated = entries.reduce(
		(max, e) => (e.updated > max ? e.updated : max),
		new Date(0),
	);
	const lines = [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<feed xmlns="http://www.w3.org/2005/Atom">',
		`  <id>${escapeXml(meta.feedUrl)}</id>`,
		`  <title>${escapeXml(meta.title)}</title>`,
		`  <updated>${updated.toISOString()}</updated>`,
		`  <author><name>${escapeXml(meta.author)}</name></author>`,
		`  <link rel="self" type="application/atom+xml" href="${escapeXml(meta.feedUrl)}"/>`,
		`  <link rel="alternate" type="text/html" href="${escapeXml(meta.siteUrl)}"/>`,
	];
	for (const e of entries) {
		lines.push(
			'  <entry>',
			`    <id>${escapeXml(e.id)}</id>`,
			`    <title>${escapeXml(e.title)}</title>`,
			`    <link rel="alternate" type="text/html" href="${escapeXml(e.url)}"/>`,
			`    <published>${e.published.toISOString()}</published>`,
			`    <updated>${e.updated.toISOString()}</updated>`,
		);
		if (e.summary) {
			lines.push(
				`    <summary type="text">${escapeXml(e.summary)}</summary>`,
			);
		}
		if (e.content) {
			lines.push(`    <content type="html">${escapeXml(e.content)}</content>`);
		}
		lines.push('  </entry>');
	}
	lines.push('</feed>', '');
	return lines.join('\n');
}
