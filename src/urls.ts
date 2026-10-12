/** `+` for spaces, everything else URI-encoded, one path segment at a time: Publish's page URLs. */
const pageSegment = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');

/**
 * Public URL of a published note's page. The site replaces the path with the note's
 * `permalink` when it has one.
 */
export function pageUrl(siteUrl: string, path: string, permalink?: string): string {
	const base = siteUrl.replace(/\/+$/, '');
	if (permalink) {
		return `${base}/${permalink.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
	}
	return `${base}/${path.replace(/\.md$/i, '').split('/').map(pageSegment).join('/')}`;
}

/** Where Publish serves uploaded files: `https://<host>/access/<siteId>`. */
export function assetBase(host: string, siteId: string): string {
	return `https://${host}/access/${encodeURIComponent(siteId)}`;
}

/** URL of a published file (an image, a PDF) under `assetBase`. */
export function assetUrl(base: string, path: string): string {
	return `${base}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
