import type { Film } from "../types";

export const filmGenres = (film: Film) => film.genres ?? [film.genre];

export const genreSlugs: Record<string, string> = {
  All: "tum-kategoriler",
  Action: "aksiyon",
  Adventure: "macera",
  Animation: "animasyon",
  Comedy: "komedi",
  Crime: "suc",
  Documentary: "belgesel",
  Drama: "dram",
  Fantasy: "fantastik",
  Horror: "korku",
  Mystery: "gizem",
  Romance: "romantik",
  "Sci-Fi": "bilim-kurgu",
  Thriller: "gerilim",
};
export const genreLabels: Record<string, string> = {
  All: "All Genres",
  Action: "Action",
  Adventure: "Adventure",
  Animation: "Animation",
  Comedy: "Comedy",
  Crime: "Crime",
  Documentary: "Documentary",
  Drama: "Drama",
  Fantasy: "Fantasy",
  Horror: "Horror",
  Mystery: "Mystery",
  Romance: "Romance",
  "Sci-Fi": "Sci-Fi",
  Thriller: "Thriller",
};
export function genreFromPath(path: string) {
  const slug = path.match(/^\/turler\/([^/]+)/)?.[1];
  if (!slug) return null;
  return Object.keys(genreSlugs).find((g) => genreSlugs[g] === slug) || null;
}
