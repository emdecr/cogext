// ============================================================================
// YOUTUBE URL HELPERS
// ============================================================================
//
// Pure helpers for detecting a YouTube URL and extracting its video id, shared
// by the record detail view (to embed a player) and anywhere else that needs
// to recognize a YouTube link. No network, no DOM — safe on client and server.
//
// Handles the common shapes:
//   https://www.youtube.com/watch?v=ID
//   https://youtu.be/ID
//   https://www.youtube.com/shorts/ID
//   https://www.youtube.com/embed/ID
//   https://m.youtube.com/watch?v=ID   (and the youtube-nocookie.com host)
// ============================================================================

// A YouTube video id is exactly 11 chars from this alphabet. Anchoring to the
// length keeps us from mistaking a trailing path/query segment for the id.
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

/**
 * Returns the 11-char video id for a YouTube URL, or null if the string isn't
 * a recognizable YouTube video link.
 */
export function getYouTubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return VIDEO_ID.test(id) ? id : null;
  }

  // /watch?v=<id>
  const vParam = parsed.searchParams.get("v");
  if (vParam && VIDEO_ID.test(vParam)) return vParam;

  // /shorts/<id>, /embed/<id>, /v/<id>, /live/<id>
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (
    segments.length >= 2 &&
    ["shorts", "embed", "v", "live"].includes(segments[0]) &&
    VIDEO_ID.test(segments[1])
  ) {
    return segments[1];
  }

  return null;
}

/**
 * Privacy-enhanced embed URL for a video id (youtube-nocookie.com).
 */
export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
