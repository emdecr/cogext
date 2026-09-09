// ============================================================================
// URL METADATA PARSING (pure)
// ============================================================================
//
// The network-free half of the URL metadata lookup: given a chunk of HTML,
// pull out the best available title and description. Kept separate from the
// server action (src/lib/actions/url-metadata.ts) because that file is
// "use server" and may only export async functions — and because pure parsing
// is worth unit-testing on its own.
// ============================================================================

export type UrlMetadata = {
  title: string | null;
  description: string | null;
};

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// Pull the value of a <meta property="og:title" content="..."> style tag,
// tolerant of attribute order and single/double quotes.
function extractMeta(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*\\scontent=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const value = decodeEntities(m[1]);
      if (value) return value;
    }
  }
  return null;
}

export function parseHtmlMetadata(html: string): UrlMetadata {
  const ogTitle = extractMeta(html, "og:title");
  const twitterTitle = extractMeta(html, "twitter:title");
  let title = ogTitle ?? twitterTitle;
  if (!title) {
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (m?.[1]) title = decodeEntities(m[1]);
  }

  const description =
    extractMeta(html, "og:description") ??
    extractMeta(html, "twitter:description") ??
    extractMeta(html, "description");

  return {
    title: title || null,
    description: description || null,
  };
}
