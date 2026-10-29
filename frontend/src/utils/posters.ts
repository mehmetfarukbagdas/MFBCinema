export function managedPosterPath(imageUrl: string) {
  const marker = "/storage/v1/object/public/posters/";
  const index = imageUrl.indexOf(marker);
  if (index < 0) return null;
  try {
    return decodeURIComponent(imageUrl.slice(index + marker.length));
  } catch {
    return imageUrl.slice(index + marker.length);
  }
}

const RETRY_DELAYS_MS = [700, 1800, 4000];

/**
 * onError handler for remote (TMDB CDN) images. A single failed request is usually a
 * transient network problem, so retry a few times with backoff before switching to the
 * bundled fallback. `onGiveUp` runs when the fallback fails too.
 */
export function handleRemoteImageError(
  img: HTMLImageElement,
  fallbackSrc: string,
  onGiveUp: (img: HTMLImageElement) => void = (el) => {
    el.style.display = "none";
  },
) {
  if (img.dataset.fallback === "true") {
    onGiveUp(img);
    return;
  }
  const original = img.dataset.origSrc || img.src;
  img.dataset.origSrc = original;
  const attempt = Number(img.dataset.retry || "0");
  if (attempt < RETRY_DELAYS_MS.length) {
    img.dataset.retry = String(attempt + 1);
    window.setTimeout(() => {
      if (img.isConnected && img.dataset.fallback !== "true") img.src = original;
    }, RETRY_DELAYS_MS[attempt]);
    return;
  }
  img.dataset.fallback = "true";
  img.src = fallbackSrc;
}
