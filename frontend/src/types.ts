export type Film = {
  id: number;
  title: string;
  year: number;
  genre: string;
  genres?: string[];
  image: string;
  desc: string;
  runtime: string;
  rating?: number;
  kind?: "Film" | "Dizi";
};
export type UserReview = { rating: number; comment: string; updatedAt: string };
export type CastMember = {
  name: string;
  role: string;
  bio: string;
  personId?: number;
  photo?: string;
  filmography?: Array<{
    id: number;
    title: string;
    year: number;
    image: string;
    role: string;
    kind: "Film" | "Dizi";
  }>;
};
