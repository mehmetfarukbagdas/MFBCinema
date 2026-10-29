export const tmdbToken = import.meta.env.VITE_TMDB_ACCESS_TOKEN;
export const omdbKey = import.meta.env.VITE_OMDB_API_KEY;
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export const tmdbHeaders = {
  Authorization: `Bearer ${tmdbToken ?? ""}`,
  accept: "application/json",
};
