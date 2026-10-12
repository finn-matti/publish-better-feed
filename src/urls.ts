/** `+` for spaces, everything else URI-encoded, one path segment at a time: Publish's page URLs. */
const pageSegment = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');

/**
 * A page loaded directly is matched against the permalink exactly as written, but the browser
 * percent-encodes its path. So a permalink only works as a link if it survives that unchanged.
 */
const directlyLoadable = (permalink: string) =>
	permalink.split('/').every((segment) => encodeURIComponent(segment) === segment);

/**
 * Public URL of a published note's page: its `permalink` if it has a usable one (the site
 * rewrites the path URL to it), otherwise the path URL, which always works.
 */
export function pageUrl(siteUrl: string, path: string, permalink?: string): string {
	const base = siteUrl.replace(/\/+$/, '');
	const wanted = permalink?.replace(/^\/+/, '');
	if (wanted && directlyLoadable(wanted)) return `${base}/${wanted}`;
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
