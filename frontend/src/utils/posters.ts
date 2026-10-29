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
