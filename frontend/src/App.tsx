import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Menu,
  X,
  Plus,
  Check,
  Play,
  ChevronRight,
  ChevronLeft,
  Bookmark,
  UserRound,
  Clapperboard,
  Heart,
  ArrowRight,
  LogIn,
  UserPlus,
  LogOut,
  ChevronDown,
  Clock,
  Settings,
  ShieldCheck,
  Mail,
} from "lucide-react";
import { supabase, supabaseConfigured } from "./supabase";
import { apiBaseUrl, omdbKey, tmdbHeaders, tmdbToken } from "./config";
import type { CastMember, Film, UserReview } from "./types";
import { films } from "./data/films";
import { castBy } from "./data/cast";
import { trailers } from "./data/trailers";
import { safeRead } from "./utils/storage";
import { filmGenres, genreFromPath, genreLabels, genreSlugs } from "./utils/genres";
import { managedPosterPath } from "./utils/posters";
import { Logo } from "./components/Logo";
import { PosterCarousel } from "./components/PosterCarousel";

/**
 * Keeps admin-table poster fallback state in React instead of mutating img.src
 * directly. Direct DOM mutations can be overwritten during a parent rerender,
 * which makes posters appear to disappear when the admin route is opened.
 */
function AdminCataloguePoster({
  film,
  onMissing,
}: {
  film: Film;
  onMissing: (id: number) => void;
}) {
  const seed = films.find(
    (item) =>
      item.title.trim().toLocaleLowerCase() === film.title.trim().toLocaleLowerCase() &&
      item.year === film.year,
  );
  const [source, setSource] = useState(film.image || "");
  const [fallbackStage, setFallbackStage] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSource(film.image || "");
    setFallbackStage(0);
    setFailed(false);
  }, [film.id, film.image]);

  const handleError = () => {
    if (fallbackStage === 0 && seed?.image && seed.image !== source) {
      setFallbackStage(1);
      setSource(seed.image);
      return;
    }
    if (fallbackStage < 2) {
      setFallbackStage(2);
      onMissing(film.id);
      setSource(`/posters/${film.id}.svg`);
      return;
    }
    setFailed(true);
  };

  return (
    <img
      className="admin-table-poster"
      src={source || `/posters/${film.id}.svg`}
      alt={`${film.title} poster`}
      loading="lazy"
      decoding="async"
      onError={handleError}
      style={failed ? { opacity: 0.2 } : undefined}
    />
  );
}

export function App() {
  const heroTouch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    localStorage.removeItem("mfb-account");
  }, []);
  const [language, setLanguage] = useState<"en" | "tr">(() =>
    localStorage.getItem("mfb-language") === "tr" ? "tr" : "en",
  );
  const tr = language === "tr";
  const [catalogue, setCatalogue] = useState<Film[]>(films);
  const [adminOpen, setAdminOpen] = useState(() => window.location.pathname === "/admin");
  const [editing, setEditing] = useState<number | null>(null);
  const [admin, setAdmin] = useState("");
  const [adminYear, setAdminYear] = useState(String(new Date().getFullYear()));
  const [adminGenre, setAdminGenre] = useState("Drama");
  const [adminRating, setAdminRating] = useState("8.0");
  const [adminImage, setAdminImage] = useState("");
  const [adminImageFile, setAdminImageFile] = useState<File | null>(null);
  const [adminImagePreview, setAdminImagePreview] = useState("");
  const [adminUploadStatus, setAdminUploadStatus] = useState("");
  const [adminDesc, setAdminDesc] = useState("");
  const [adminKind, setAdminKind] = useState<"Film" | "Dizi">("Film");
  const [adminError, setAdminError] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [missingPosterIds, setMissingPosterIds] = useState<number[]>([]);
  const [posterRepairBusy, setPosterRepairBusy] = useState(false);
  const [posterRepairMessage, setPosterRepairMessage] = useState("");
  const [adminCatalogueSearch, setAdminCatalogueSearch] = useState("");
  const [adminSection, setAdminSection] = useState<"catalogue" | "users">("catalogue");
  const [managedUsers, setManagedUsers] = useState<
    Array<{ id: string; email: string; created_at?: string; role: "admin" | "user" }>
  >([]);
  const [usersBusy, setUsersBusy] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userActionId, setUserActionId] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<number[]>(() =>
    safeRead<number[]>("mfb-watchlist", []),
  );
  const [favorites, setFavorites] = useState<number[]>(() =>
    safeRead<number[]>("mfb-favorites", []),
  );
  const [watchHistory, setWatchHistory] = useState<number[]>(() =>
    safeRead<number[]>("mfb-watch-history", []),
  );
  const [reviews, setReviews] = useState<Record<number, UserReview>>(() =>
    safeRead<Record<number, UserReview>>("mfb-reviews", {}),
  );
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [showTrailer, setShowTrailer] = useState(false);
  const [resolvedTrailer, setResolvedTrailer] = useState<string | null>(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerError, setTrailerError] = useState("");
  const [selectedActor, setSelectedActor] = useState<CastMember | null>(null);
  const [actorProfileLoading, setActorProfileLoading] = useState(false);
  const [remoteCast, setRemoteCast] = useState<CastMember[]>([]);
  const trailerFrameRef = useRef<HTMLDivElement | null>(null);
  const [imdbRatings, setImdbRatings] = useState<Record<string, string>>({});
  const [watchProviders, setWatchProviders] = useState<any | null>(null);
  const [providerRegion, setProviderRegion] = useState(() => {
    const saved = localStorage.getItem("mfb-provider-region");
    if (saved) return saved;
    const locale = (navigator.language || "en-US").toLowerCase();
    const country = locale.split("-")[1]?.toUpperCase();
    return ["US", "GB", "TR", "CA", "AU", "DE", "FR", "IN", "JP", "BR"].includes(country || "")
      ? country!
      : "US";
  });
  const [providersLoading, setProvidersLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [localizedOverview, setLocalizedOverview] = useState("");
  const [communityReviews, setCommunityReviews] = useState<
    Array<{
      id: string;
      rating: number;
      comment: string;
      display_name: string;
      created_at: string;
      user_id?: string;
    }>
  >([]);
  const [search, setSearch] = useState("");
  const [heroIndex, setHeroIndex] = useState(0);
  const [active, setActive] = useState("Discover");
  const [mobile, setMobile] = useState(false);
  const [selected, setSelected] = useState<Film | null>(null);
  const [toast, setToast] = useState("");
  const [genre, setGenre] = useState("All");
  const [categoryRoute, setCategoryRoute] = useState<string | null>(() =>
    genreFromPath(window.location.pathname),
  );
  const [categoryTab, setCategoryTab] = useState<"All" | "Film" | "Dizi">("All");
  const [categorySearch, setCategorySearch] = useState("");
  const [categorySort, setCategorySort] = useState<"rating" | "newest" | "oldest" | "title">(
    "rating",
  );
  const [showSearch, setShowSearch] = useState(false);
  const [browse, setBrowse] = useState<"All" | "Film" | "Dizi">(() =>
    window.location.pathname === "/movies"
      ? "Film"
      : window.location.pathname === "/series"
        ? "Dizi"
        : "All",
  );
  const [browsePage, setBrowsePage] = useState<"movies" | "series" | null>(() =>
    window.location.pathname === "/movies"
      ? "movies"
      : window.location.pathname === "/series"
        ? "series"
        : null,
  );
  const [footerInfo, setFooterInfo] = useState<
    "privacy" | "terms" | "cookies" | "contact" | "about" | null
  >(null);
  const [localizedDescriptions, setLocalizedDescriptions] = useState<Record<string, string>>({});
  useEffect(() => {
    localStorage.setItem("mfb-language", language);
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);
  useEffect(() => {
    let cancelled = false;
    if (!omdbKey) return;
    const loadRatings = async () => {
      const priorityIds = new Set([...watchlist, ...favorites, ...watchHistory]);
      const priorityTitles = new Set([
        "Oppenheimer",
        "Interstellar",
        "Dune: Part Two",
        "The Batman",
        "Avengers: Endgame",
      ]);
      const prioritized = [
        ...catalogue.filter((f) => priorityIds.has(f.id) || priorityTitles.has(f.title)),
        ...catalogue
          .slice()
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 35),
      ];
      const unique = Array.from(
        new Map(prioritized.map((f) => [`${f.title}|${f.year}|${f.kind}`, f])).values(),
      ).filter((f) => !imdbRatings[f.title]);
      for (let i = 0; i < unique.length; i += 4) {
        if (cancelled) return;
        const batch = unique.slice(i, i + 4);
        const values = await Promise.all(
          batch.map(async (film) => {
            try {
              const params = new URLSearchParams({
                apikey: omdbKey ?? "",
                t: film.title,
                y: String(film.year),
                type: film.kind === "Dizi" ? "series" : "movie",
              });
              const response = await fetch(`https://www.omdbapi.com/?${params.toString()}`);
              if (!response.ok) return null;
              const data = await response.json();
              return data.Response === "True" && data.imdbRating && data.imdbRating !== "N/A"
                ? ([film.title, String(data.imdbRating)] as const)
                : null;
            } catch {
              return null;
            }
          }),
        );
        if (!cancelled) {
          setImdbRatings((prev) => ({
            ...prev,
            ...Object.fromEntries(values.filter((v): v is readonly [string, string] => v !== null)),
          }));
        }
      }
    };
    void loadRatings();
    return () => {
      cancelled = true;
    };
  }, [catalogue, watchlist, favorites, watchHistory]);
  useEffect(() => {
    localStorage.setItem("mfb-provider-region", providerRegion);
  }, [providerRegion]);
  useEffect(() => {
    let cancelled = false;
    if (!tr) {
      setLocalizedDescriptions({});
      return () => {
        cancelled = true;
      };
    }
    if (!tmdbToken)
      return () => {
        cancelled = true;
      };
    const loadLocalizedDescriptions = async () => {
      const priority = [
        ...catalogue
          .filter((f) => f.kind === "Dizi")
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 12),
        ...catalogue
          .slice()
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 28),
      ];
      const unique = Array.from(
        new Map(priority.map((f) => [`${f.title}|${f.year}|${f.kind}`, f])).values(),
      );
      for (let i = 0; i < unique.length; i += 6) {
        if (cancelled) return;
        const batch = await Promise.all(
          unique.slice(i, i + 6).map(async (film) => {
            try {
              const kind = film.kind === "Dizi" ? "tv" : "movie";
              const params = new URLSearchParams({ query: film.title, language: "tr-TR" });
              params.set(kind === "tv" ? "first_air_date_year" : "year", String(film.year));
              const response = await fetch(
                `https://api.themoviedb.org/3/search/${kind}?${params.toString()}`,
                { headers: tmdbHeaders },
              );
              if (!response.ok) return null;
              const data = await response.json();
              const results = Array.isArray(data.results) ? data.results : [];
              const match =
                results.find((item: any) => {
                  const date = kind === "tv" ? item.first_air_date : item.release_date;
                  return date && Number(String(date).slice(0, 4)) === film.year;
                }) || results[0];
              return typeof match?.overview === "string" && match.overview.trim()
                ? ([film.title, match.overview.trim()] as const)
                : null;
            } catch {
              return null;
            }
          }),
        );
        if (!cancelled)
          setLocalizedDescriptions((prev) => ({
            ...prev,
            ...Object.fromEntries(batch.filter((x): x is readonly [string, string] => x !== null)),
          }));
      }
    };
    void loadLocalizedDescriptions();
    return () => {
      cancelled = true;
    };
  }, [tr, catalogue]);
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot" | "reset" | null>(null);
  const [authEmailSent, setAuthEmailSent] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [account, setAccount] = useState<{
    email: string;
    name: string;
    token: string;
    user?: string;
    isAdmin?: boolean;
  } | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountPanel, setAccountPanel] = useState<"profile" | "activity" | "settings" | null>(
    null,
  );
  const [profileName, setProfileName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState("");
  const [profileAvatarChoices, setProfileAvatarChoices] = useState<
    Array<{ name: string; url: string }>
  >([]);
  const [settingsEmail, setSettingsEmail] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [authError, setAuthError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const loadTrailer = async () => {
      setResolvedTrailer(null);
      setTrailerError("");
      if (!showTrailer || !selected) return;
      const known = trailers[selected.title];
      if (known) {
        setResolvedTrailer(known);
        return;
      }
      if (!tmdbToken) {
        setTrailerError(
          "TMDB access key is not configured. Add VITE_TMDB_ACCESS_TOKEN to frontend/.env.local.",
        );
        return;
      }
      setTrailerLoading(true);
      try {
        const kind = selected.kind === "Dizi" ? "tv" : "movie";
        const params = new URLSearchParams({
          query: selected.title,
          include_adult: "false",
          language: "en-US",
        });
        if (kind === "movie") params.set("year", String(selected.year));
        else params.set("first_air_date_year", String(selected.year));
        const searchResponse = await fetch(
          `https://api.themoviedb.org/3/search/${kind}?${params.toString()}`,
          { headers: tmdbHeaders },
        );
        if (!searchResponse.ok) throw new Error(`TMDB search failed (${searchResponse.status}).`);
        const searchData = await searchResponse.json();
        const results = Array.isArray(searchData.results) ? searchData.results : [];
        const result =
          results.find((item: any) => {
            const date = kind === "tv" ? item.first_air_date : item.release_date;
            return date && Number(String(date).slice(0, 4)) === selected.year;
          }) || results[0];
        if (!result) throw new Error("The title was not found in the TMDB catalogue.");
        const videosResponse = await fetch(
          `https://api.themoviedb.org/3/${kind}/${result.id}/videos?language=en-US`,
          { headers: tmdbHeaders },
        );
        if (!videosResponse.ok)
          throw new Error(`Fragman bilgisi could not be retrieved (${videosResponse.status}).`);
        const videosData = await videosResponse.json();
        const videos = Array.isArray(videosData.results) ? videosData.results : [];
        const video =
          videos.find((v: any) => v.site === "YouTube" && v.type === "Trailer" && v.official) ||
          videos.find((v: any) => v.site === "YouTube" && v.type === "Trailer") ||
          videos.find((v: any) => v.site === "YouTube" && v.type === "Teaser");
        if (!video?.key)
          throw new Error("No embeddable YouTube trailer was found for this title on TMDB.");
        if (!cancelled) setResolvedTrailer(video.key);
      } catch (error) {
        if (!cancelled)
          setTrailerError(
            error instanceof Error ? error.message : "Fragman could not be uploaded.",
          );
      } finally {
        if (!cancelled) setTrailerLoading(false);
      }
    };
    void loadTrailer();
    return () => {
      cancelled = true;
    };
  }, [showTrailer, selected?.id, selected?.title, selected?.year, selected?.kind]);
  const genres = [
    "All",
    "Action",
    "Adventure",
    "Animation",
    "Comedy",
    "Crime",
    "Documentary",
    "Drama",
    "Fantasy",
    "Horror",
    "Mystery",
    "Romance",
    "Sci-Fi",
    "Thriller",
  ];
  const heroSlides = [
    {
      title: "Oppenheimer",
      focus: "52%",
      lift: "10%",
      backdrop: "/images/oppenheimer-vivid.jpg",
      tagline:
        "The story of J. Robert Oppenheimer and the birth of the atomic bomb - a gripping exploration of genius, morality and the cost of progress.",
    },
    {
      title: "Interstellar",
      focus: "86%",
      lift: "22%",
      backdrop: "/images/interstellar-hero.jpg",
      tagline:
        "A team of explorers travels beyond this galaxy to discover whether mankind has a future among the stars.",
    },
    {
      title: "Dune: Part Two",
      focus: "50%",
      lift: "10%",
      backdrop: "https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg",
      tagline:
        "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.",
    },
    {
      title: "The Batman",
      focus: "50%",
      lift: "10%",
      backdrop: "https://image.tmdb.org/t/p/original/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg",
      tagline:
        "Batman ventures into Gotham City’s underworld when a sadistic killer leaves behind a trail of cryptic clues.",
    },
    {
      title: "Avengers: Endgame",
      focus: "50%",
      lift: "10%",
      backdrop: "/images/avengers-endgame.jpg",
      tagline: "The Avengers make one final stand to restore the universe.",
    },
  ];
  const currentHero = heroSlides[heroIndex];
  const currentHeroFilm =
    catalogue.find((f) => f.title === currentHero.title) ||
    films.find((f) => f.title === currentHero.title) ||
    catalogue[0];
  const moveHero = (direction: number) =>
    setHeroIndex((index) => (index + direction + heroSlides.length) % heroSlides.length);
  useEffect(() => {
    const syncRoute = () => {
      const path = window.location.pathname;
      setCategoryRoute(genreFromPath(path));
      setAdminOpen(path === "/admin");
      setBrowsePage(path === "/movies" ? "movies" : path === "/series" ? "series" : null);
      if (path === "/movies") {
        setBrowse("Film");
        setActive("Movies");
      } else if (path === "/series") {
        setBrowse("Dizi");
        setActive("TV Series");
      } else if (path === "/") {
        setBrowse("All");
        setActive("Discover");
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);
  useEffect(() => {
    if (showSearch) window.setTimeout(() => document.getElementById("search-input")?.focus(), 0);
  }, [showSearch]);
  useEffect(() => {
    if (selected || authMode)
      window.setTimeout(
        () =>
          document
            .querySelector<HTMLElement>('[role=\"dialog\"] button, [role=\"dialog\"] input')
            ?.focus(),
        0,
      );
  }, [selected, authMode]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selected) setSelected(null);
        if (authMode && !authBusy) setAuthMode(null);
        if (mobile) setMobile(false);
        if (showSearch) setShowSearch(false);
      }
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
      if ((selected || authMode) && event.key === "Tab") {
        const dialog = document.querySelector('[role=\"dialog\"]');
        const focusable = dialog
          ? Array.from(
              dialog.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex=\"0\"]',
              ),
            )
          : [];
        if (focusable.length) {
          const first = focusable[0],
            last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      if (!typing && !selected && !authMode && !showSearch && !categoryRoute && !adminOpen) {
        if (event.key === "ArrowRight") moveHero(1);
        if (event.key === "ArrowLeft") moveHero(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, authMode, authBusy, mobile, showSearch, categoryRoute, adminOpen]);
  useEffect(() => {
    if (!supabaseConfigured || !supabase) return;
    const client = supabase;
    let live = true;
    const load = async () => {
      const { data, error } = await client
        .from("movies")
        .select("*")
        .order("rating", { ascending: false });
      if (!live || error || !data?.length) return;
      const rows: Film[] = data.map((r: any) => {
        const seed = films.find(
          (f) =>
            f.title.trim().toLocaleLowerCase() ===
              String(r.title || "")
                .trim()
                .toLocaleLowerCase() && f.year === Number(r.year),
        );
        return {
          id: Number(r.id),
          title: r.title,
          year: Number(r.year),
          genre: r.genres?.[0] || r.genre || seed?.genre || "Drama",
          genres:
            Array.isArray(r.genres) && r.genres.length
              ? r.genres
              : seed?.genres || [r.genre || "Drama"],
          image: r.image_url || r.image || seed?.image || "",
          desc: r.description || r.desc || seed?.desc || "",
          runtime: r.runtime || seed?.runtime || "",
          rating: Number(r.rating) || seed?.rating || 0,
          kind:
            r.kind === "Dizi" || r.kind === "TV Series"
              ? "Dizi"
              : r.kind === "Film"
                ? "Film"
                : seed?.kind || "Film",
        };
      });
      setCatalogue(rows);
    };
    void load();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!live) return;
      if (!session) {
        if (event === "SIGNED_OUT") {
          setAccount(null);
          localStorage.removeItem("mfb-account");
        }
        return;
      }
      const user = session.user;
      const next = {
        email: user.email || "",
        name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Member",
        token: session.access_token,
        user: user.id,
        isAdmin: false,
      };
      setAccount(next);
      setAuthMode(null);
      setAuthEmailSent(false);
      setAuthPassword("");
      setProfileAvatar(String(user.user_metadata?.avatar_url || ""));
      setProfileName(
        String(user.user_metadata?.full_name || user.email?.split("@")[0] || "Member"),
      );
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("reset");
        setAuthEmailSent(false);
        setAuthError("");
        setNewPassword("");
        return;
      }
      if (event === "SIGNED_IN") {
        setToast(
          user.email_confirmed_at
            ? tr
              ? "E-posta doğrulandı. Hesabına giriş yaptın."
              : "Email verified. You are now signed in."
            : tr
              ? "Giriş başarılı."
              : "Signed in successfully.",
        );
      }
      window.setTimeout(() => {
        void client.rpc("is_mfb_admin").then(({ data: isAdmin, error }) => {
          if (!live) return;
          if (error) console.error("Admin role check failed:", error.message);
          setAccount({ ...next, isAdmin: !error && isAdmin === true });
        });
      }, 0);
    });
    client.auth.getSession().then(({ data }) => {
      if (data.session && live) {
        const user = data.session.user;
        client.rpc("is_mfb_admin").then(({ data: isAdmin, error }) => {
          if (!live) return;
          if (error) console.error("Admin role check failed:", error.message);
          const next = {
            email: user.email || "",
            name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Member",
            token: data.session!.access_token,
            user: user.id,
            isAdmin: !error && isAdmin === true,
          };
          setAccount(next);
          setProfileAvatar(String(user.user_metadata?.avatar_url || ""));
          setProfileName(
            String(user.user_metadata?.full_name || user.email?.split("@")[0] || "Member"),
          );
        });
      }
    });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);
  const openBrowse = (type: "movies" | "series") => {
    window.history.pushState({}, "", `/${type}`);
    setBrowsePage(type);
    setAdminOpen(false);
    setCategoryRoute(null);
    setBrowse(type === "movies" ? "Film" : "Dizi");
    setGenre("All");
    setSearch("");
    setActive(type === "movies" ? "Movies" : "TV Series");
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const openGenre = (g: string) => {
    setBrowsePage(null);
    window.history.pushState({}, "", `/turler/${genreSlugs[g] || genreSlugs.All}`);
    setCategoryRoute(g);
    setCategoryTab("All");
    setCategorySearch("");
    setCategorySort("rating");
    setSearch("");
    setGenre(g);
    setActive("Genres");
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    if (!account?.user || !supabaseConfigured || !supabase) return;
    let cancelled = false;
    supabase
      .from("user_watchlist")
      .select("movie_id")
      .eq("user_id", account.user)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const ids = data.map((row: any) => Number(row.movie_id));
        setWatchlist(ids);
        localStorage.setItem("mfb-watchlist:" + account.email, JSON.stringify(ids));
      });
    return () => {
      cancelled = true;
    };
  }, [account?.user, account?.email]);
  useEffect(() => {
    if (!account?.user || !supabaseConfigured || !supabase) return;
    let cancelled = false;
    supabase
      .from("user_favorites")
      .select("movie_id")
      .eq("user_id", account.user)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const ids = data.map((row: any) => Number(row.movie_id));
        setFavorites(ids);
        localStorage.setItem("mfb-favorites:" + account.email, JSON.stringify(ids));
      });
    return () => {
      cancelled = true;
    };
  }, [account?.user, account?.email]);
  useEffect(() => {
    if (!account?.user || !supabaseConfigured || !supabase) return;
    let cancelled = false;
    Promise.all([
      supabase
        .from("user_watch_history")
        .select("movie_id,viewed_at")
        .eq("user_id", account.user)
        .order("viewed_at", { ascending: true }),
      supabase
        .from("movie_reviews")
        .select("movie_id,rating,comment,updated_at")
        .eq("user_id", account.user),
    ]).then(([historyResult, reviewsResult]) => {
      if (cancelled) return;
      if (!historyResult.error && historyResult.data) {
        const ids = historyResult.data.map((row: any) => Number(row.movie_id));
        setWatchHistory(ids);
        localStorage.setItem("mfb-watch-history", JSON.stringify(ids));
      }
      if (!reviewsResult.error && reviewsResult.data) {
        const mapped: Record<number, UserReview> = {};
        for (const row of reviewsResult.data as any[])
          mapped[Number(row.movie_id)] = {
            rating: Number(row.rating),
            comment: row.comment || "",
            updatedAt: row.updated_at || new Date().toISOString(),
          };
        setReviews(mapped);
        localStorage.setItem("mfb-reviews", JSON.stringify(mapped));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [account?.user]);
  useEffect(() => {
    if (!selected) {
      setSelectedActor(null);
      setShowTrailer(false);
      setReviewRating(0);
      setReviewComment("");
      setWatchProviders(null);
      return;
    }
    const saved = reviews[selected.id];
    setReviewRating(saved?.rating ?? 0);
    setReviewComment(saved?.comment ?? "");
    setSelectedActor(null);
    setShowTrailer(false);
    setResolvedTrailer(null);
    setTrailerError("");
    setCommunityReviews([]);
    setWatchProviders(null);
  }, [selected?.id]);
  useEffect(() => {
    let cancelled = false;
    setRemoteCast([]);
    setLocalizedOverview("");
    if (!selected) return;
    const loadMetadata = async () => {
      setMetadataLoading(true);
      setProvidersLoading(true);
      try {
        if (tmdbToken) {
          const kind = selected.kind === "Dizi" ? "tv" : "movie";
          const params = new URLSearchParams({ query: selected.title, language: "en-US" });
          params.set(kind === "tv" ? "first_air_date_year" : "year", String(selected.year));
          const searchResponse = await fetch(
            `https://api.themoviedb.org/3/search/${kind}?${params.toString()}`,
            { headers: tmdbHeaders },
          );
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const results = Array.isArray(searchData.results) ? searchData.results : [];
            const match =
              results.find((item: any) => {
                const date = kind === "tv" ? item.first_air_date : item.release_date;
                return date && Number(String(date).slice(0, 4)) === selected.year;
              }) || results[0];
            if (match?.id) {
              const localizedResponse = await fetch(
                `https://api.themoviedb.org/3/${kind}/${match.id}?language=${tr ? "tr-TR" : "en-US"}`,
                { headers: tmdbHeaders },
              );
              if (localizedResponse.ok) {
                const localizedData = await localizedResponse.json();
                if (!cancelled && typeof localizedData.overview === "string")
                  setLocalizedOverview(localizedData.overview.trim());
              }
              const providerResponse = await fetch(
                `https://api.themoviedb.org/3/${kind}/${match.id}/watch/providers`,
                { headers: tmdbHeaders },
              );
              if (providerResponse.ok) {
                const providerData = await providerResponse.json();
                if (!cancelled) setWatchProviders(providerData.results?.[providerRegion] || null);
              }
              const creditsResponse = await fetch(
                `https://api.themoviedb.org/3/${kind}/${match.id}/credits?language=en-US`,
                { headers: tmdbHeaders },
              );
              if (creditsResponse.ok) {
                const credits = await creditsResponse.json();
                const cast = (Array.isArray(credits.cast) ? credits.cast : [])
                  .slice(0, 8)
                  .map((actor: any) => ({
                    name: String(actor.name || ""),
                    role: String(actor.character || "Cast"),
                    bio: "",
                    personId: Number(actor.id) || undefined,
                    photo: actor.profile_path
                      ? `https://image.tmdb.org/t/p/w185${actor.profile_path}`
                      : undefined,
                  }))
                  .filter((actor: CastMember) => actor.name);
                if (!cancelled && cast.length) setRemoteCast(cast);
              }
            }
          }
        }
        if (omdbKey) {
          const params = new URLSearchParams({
            apikey: omdbKey ?? "",
            t: selected.title,
            y: String(selected.year),
            type: selected.kind === "Dizi" ? "series" : "movie",
          });
          const response = await fetch(`https://www.omdbapi.com/?${params.toString()}`);
          if (response.ok) {
            const data = await response.json();
            if (
              data.Response === "True" &&
              data.imdbRating &&
              data.imdbRating !== "N/A" &&
              !cancelled
            )
              setImdbRatings((prev) => ({ ...prev, [selected.title]: String(data.imdbRating) }));
          }
        }
      } catch (error) {
        console.warn("Title metadata could not be loaded:", error);
      } finally {
        if (!cancelled) {
          setMetadataLoading(false);
          setProvidersLoading(false);
        }
      }
    };
    void loadMetadata();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.title, selected?.year, selected?.kind, providerRegion, language]);
  useEffect(() => {
    let cancelled = false;
    const loadActorProfile = async () => {
      if (!selectedActor) return;
      setActorProfileLoading(true);
      if (!tmdbToken) {
        setActorProfileLoading(false);
        return;
      }
      try {
        const headers = tmdbHeaders;
        let personId = selectedActor.personId;
        let person: any = null;
        if (personId) {
          const detailResponse = await fetch(
            `https://api.themoviedb.org/3/person/${personId}?language=${language === "tr" ? "tr-TR" : "en-US"}`,
            { headers },
          );
          if (detailResponse.ok) person = await detailResponse.json();
        }
        if (!person) {
          const params = new URLSearchParams({
            query: selectedActor.name,
            language: language === "tr" ? "tr-TR" : "en-US",
          });
          const searchResponse = await fetch(
            `https://api.themoviedb.org/3/search/person?${params.toString()}`,
            { headers },
          );
          if (!searchResponse.ok) return;
          const searchData = await searchResponse.json();
          person = searchData.results?.[0];
          personId = person?.id;
        }
        if (!personId) return;
        const creditsResponse = await fetch(
          `https://api.themoviedb.org/3/person/${personId}/combined_credits?language=${language === "tr" ? "tr-TR" : "en-US"}`,
          { headers },
        );
        let filmography: Array<{
          id: number;
          title: string;
          year: number;
          image: string;
          role: string;
          kind: "Film" | "Dizi";
        }> = [];
        if (creditsResponse.ok) {
          const credits = await creditsResponse.json();
          filmography = (Array.isArray(credits.cast) ? credits.cast : [])
            .filter((item: any) => item.poster_path && (item.title || item.name))
            .sort(
              (a: any, b: any) =>
                Number(b.release_date?.slice(0, 4) || b.first_air_date?.slice(0, 4) || 0) -
                Number(a.release_date?.slice(0, 4) || a.first_air_date?.slice(0, 4) || 0),
            )
            .slice(0, 12)
            .map((item: any) => ({
              id: Number(item.id),
              title: String(item.title || item.name),
              year: Number(String(item.release_date || item.first_air_date || "").slice(0, 4)) || 0,
              image: `https://image.tmdb.org/t/p/w185${item.poster_path}`,
              role: String(item.character || ""),
              kind: item.media_type === "tv" ? ("Dizi" as const) : ("Film" as const),
            }));
        }
        if (cancelled) return;
        const profile: CastMember = {
          ...selectedActor,
          personId: Number(personId),
          photo: person.profile_path
            ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
            : selectedActor.photo,
          filmography,
        };
        setRemoteCast((prev) =>
          prev.map((actor) =>
            actor.name === selectedActor.name ? { ...actor, ...profile } : actor,
          ),
        );
        setSelectedActor((prev) =>
          prev && prev.name === selectedActor.name ? { ...prev, ...profile } : prev,
        );
      } catch (error) {
        console.warn("Actor profile could not be loaded:", error);
      } finally {
        if (!cancelled) setActorProfileLoading(false);
      }
    };
    void loadActorProfile();
    return () => {
      cancelled = true;
    };
  }, [selectedActor?.name, selectedActor?.personId, language]);
  useEffect(() => {
    if (showTrailer && trailerFrameRef.current) {
      window.requestAnimationFrame(() =>
        trailerFrameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    }
  }, [showTrailer, resolvedTrailer, trailerLoading]);
  useEffect(() => {
    if (!selected) return;
    const next = [...watchHistory.filter((id) => id !== selected.id), selected.id].slice(-100);
    setWatchHistory(next);
    localStorage.setItem("mfb-watch-history", JSON.stringify(next));
    if (supabaseConfigured && supabase && account?.user) {
      void supabase
        .from("user_watch_history")
        .upsert(
          { user_id: account.user, movie_id: selected.id, viewed_at: new Date().toISOString() },
          { onConflict: "user_id,movie_id" },
        )
        .then(({ error }) => {
          if (error) console.warn("Could not sync watch history:", error.message);
        });
    }
  }, [selected?.id, account?.user]);
  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (authMode === "register") {
      const strongPassword =
        authPassword.length >= 8 &&
        /[A-Z]/.test(authPassword) &&
        /[a-z]/.test(authPassword) &&
        /[0-9]/.test(authPassword);
      if (!strongPassword) {
        setAuthError(
          tr
            ? "Şifre en az 8 karakter olmalı; en az bir büyük harf, bir küçük harf ve bir rakam içermeli."
            : "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.",
        );
        return;
      }
      if (authPassword !== authConfirmPassword) {
        setAuthError(tr ? "Şifreler eşleşmiyor." : "Passwords do not match.");
        return;
      }
    }
    setAuthBusy(true);
    try {
      if (!supabaseConfigured || !supabase)
        throw new Error(
          "Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) to frontend/.env.local, then enable email confirmation in Supabase Auth.",
        );
      if (authMode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: {
            data: { full_name: authName.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setAuthEmailSent(true);
          setAuthPassword("");
          setAuthConfirmPassword("");
          return;
        }
        setToast("Email verified session created.");
      } else if (authMode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setAuthEmailSent(true);
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
      }
      setAuthMode(null);
      setAuthPassword("");
      setAuthConfirmPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  };
  const submitPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !supabase ||
      newPassword.length < 8 ||
      !/[A-Z]/.test(newPassword) ||
      !/[a-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword)
    ) {
      setAuthError(
        tr
          ? "Şifre en az 8 karakter olmalı; en az bir büyük harf, bir küçük harf ve bir rakam içermeli."
          : "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.",
      );
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setAuthMode("login");
      setAuthPassword("");
      setToast(
        tr
          ? "Şifren güncellendi. Yeni şifrenle giriş yapabilirsin."
          : "Password updated. You can sign in with your new password.",
      );
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : tr
            ? "Şifre güncellenemedi."
            : "Could not update password.",
      );
    } finally {
      setAuthBusy(false);
    }
  };
  useEffect(() => {
    const names = tr
      ? [
          "Klasik",
          "Film Tutkunu",
          "Kovboy",
          "Büyücü",
          "Astronot",
          "Dedektif",
          "Süper Kahraman",
          "Samuray",
          "Siberpunk",
          "Viking",
          "Buz Savaşçısı",
          "Asi",
          "Korsan",
          "Elf Okçu",
          "Vampir",
          "Şövalye",
          "Steampunk",
          "Tatil",
          "Kral",
          "Oyuncu",
          "Bilgin",
          "Gizem",
          "Cadı",
          "Kara Film",
        ]
      : [
          "Classic",
          "Movie Fan",
          "Cowboy",
          "Wizard",
          "Astronaut",
          "Detective",
          "Superhero",
          "Samurai",
          "Cyberpunk",
          "Viking",
          "Ice Warrior",
          "Rogue",
          "Pirate",
          "Elf Archer",
          "Vampire",
          "Knight",
          "Steampunk",
          "Holiday",
          "King",
          "Gamer",
          "Scholar",
          "Mystery",
          "Witch",
          "Noir",
        ];
    const files = [
      "classic-sunglasses",
      "movie-fan",
      "cowboy",
      "wizard",
      "astronaut",
      "detective",
      "superhero",
      "samurai",
      "cyberpunk-gamer",
      "viking",
      "ice-warrior",
      "rogue",
      "pirate",
      "elf-archer",
      "vampire",
      "knight",
      "steampunk-engineer",
      "holiday",
      "king",
      "gamer",
      "scholar",
      "masked-mystery",
      "witch",
      "noir-agent",
    ];
    setProfileAvatarChoices(
      names.map((name, index) => ({
        name,
        url: `/avatars/avatar-${String(index + 1).padStart(2, "0")}-${files[index]}.png`,
      })),
    );
  }, [tr]);
  const saveProfile = async () => {
    if (!supabase || !supabaseConfigured || !account?.user) {
      setToast("Sign in and configure Supabase first.");
      return;
    }
    if (profileName.trim().length < 2) {
      setToast("Enter a name with at least 2 characters.");
      return;
    }
    setProfileBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: profileName.trim(), avatar_url: profileAvatar },
      });
      if (error) throw error;
      setAccount((prev) => (prev ? { ...prev, name: profileName.trim() } : prev));
      setToast("Profile updated.");
      setAccountPanel(null);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setProfileBusy(false);
    }
  };
  const sendPasswordReset = async () => {
    if (!supabase || !account?.email) {
      setToast("Sign in with an email address first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(account.email, {
      redirectTo: window.location.origin,
    });
    setToast(error ? error.message : "Password reset link sent to your email.");
  };
  const updatePassword = async () => {
    if (!supabase || newPassword.length < 8) {
      setToast("Choose a password with at least 8 characters.");
      return;
    }
    setSettingsBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSettingsBusy(false);
    if (error) {
      setToast(error.message);
      return;
    }
    setNewPassword("");
    setToast("Password updated successfully.");
  };
  const changeEmail = async () => {
    if (!supabase || !settingsEmail.trim() || !account) {
      setToast("Enter a valid new email address.");
      return;
    }
    setSettingsBusy(true);
    const { error } = await supabase.auth.updateUser(
      { email: settingsEmail.trim() },
      { emailRedirectTo: window.location.origin },
    );
    setSettingsBusy(false);
    if (error) {
      setToast(error.message);
      return;
    }
    setToast("Verification links were sent. Confirm the new email address to finish the change.");
    setSettingsEmail("");
  };
  const signOut = async () => {
    setAccountMenuOpen(false);
    if (supabaseConfigured && supabase) await supabase.auth.signOut();
    setAccount(null);
    localStorage.removeItem("mfb-account");
    try {
      setWatchlist(JSON.parse(localStorage.getItem("mfb-watchlist") || "[]"));
    } catch {
      setWatchlist([]);
    }
    setAdminOpen(false);
    setToast("Signed out");
  };
  const saveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");
    if (!supabaseConfigured || !supabase) {
      setAdminError("Configure Supabase before using the admin panel.");
      return;
    }
    if (!account?.isAdmin) {
      setAdminError("This account does not have administrator permissions.");
      return;
    }
    setAdminBusy(true);
    setAdminUploadStatus(adminImageFile ? "Validating poster..." : "Saving title...");
    const payload = {
      title: admin.trim(),
      year: Number(adminYear),
      genres: [adminGenre],
      image_url: adminImage.trim(),
      description: adminDesc.trim(),
      runtime: adminKind === "Film" ? "Feature film" : "Series",
      rating: Number(adminRating),
      kind: adminKind,
    };
    let uploadedPath: string | null = null;
    const previousImage = editing ? catalogue.find((f) => f.id === editing)?.image : null;
    try {
      if (
        !payload.title ||
        !payload.description ||
        (!payload.image_url && !adminImageFile) ||
        !Number.isFinite(payload.year) ||
        payload.year < 1888 ||
        payload.year > new Date().getFullYear() + 10 ||
        !Number.isFinite(payload.rating) ||
        payload.rating < 0 ||
        payload.rating > 10
      )
        throw new Error(
          "Enter a title, valid year, poster URL or image file, description and rating between 0 and 10.",
        );
      if (adminImageFile) {
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
        if (!allowed.includes(adminImageFile.type))
          throw new Error("Poster must be JPG, PNG, WebP or AVIF.");
        if (adminImageFile.size > 5 * 1024 * 1024)
          throw new Error("Poster file must be 5 MB or smaller.");
        const extension =
          adminImageFile.type === "image/jpeg" ? "jpg" : adminImageFile.type.split("/")[1];
        uploadedPath = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
        setAdminUploadStatus("Uploading poster...");
        const upload = await supabase.storage.from("posters").upload(uploadedPath, adminImageFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: adminImageFile.type,
        });
        if (upload.error)
          throw new Error(
            `Poster upload failed: ${upload.error.message}. Check the posters storage bucket and policies.`,
          );
        payload.image_url = supabase.storage
          .from("posters")
          .getPublicUrl(uploadedPath).data.publicUrl;
      }
      const parsedImage = new URL(payload.image_url, window.location.origin);
      if (!["http:", "https:"].includes(parsedImage.protocol))
        throw new Error("Poster URL must use HTTP or HTTPS.");
      setAdminUploadStatus("Saving catalogue entry...");
      const result = editing
        ? await supabase.from("movies").update(payload).eq("id", editing).select().single()
        : await supabase.from("movies").insert(payload).select().single();
      if (result.error) throw result.error;
      const r: any = result.data;
      const saved: Film = {
        id: Number(r.id),
        title: r.title,
        year: Number(r.year),
        genre: r.genres?.[0] || adminGenre,
        genres: r.genres || [adminGenre],
        image: r.image_url,
        desc: r.description,
        runtime: r.runtime,
        rating: Number(r.rating),
        kind: r.kind === "Dizi" ? "Dizi" : "Film",
      };
      setCatalogue((prev) =>
        editing ? prev.map((f) => (f.id === editing ? saved : f)) : [...prev, saved],
      );
      setEditing(null);
      setAdmin("");
      setAdminDesc("");
      setAdminImage("");
      setAdminImageFile(null);
      if (adminImagePreview) URL.revokeObjectURL(adminImagePreview);
      setAdminImagePreview("");
      if (previousImage && previousImage !== saved.image) {
        const oldPath = managedPosterPath(previousImage);
        if (oldPath) {
          try {
            await supabase.storage.from("posters").remove([oldPath]);
          } catch {
            /* keep the saved catalogue entry; cleanup can be retried later */
          }
        }
      }
      setToast("Catalogue entry saved.");
    } catch (err) {
      if (uploadedPath && supabase) {
        try {
          await supabase.storage.from("posters").remove([uploadedPath]);
        } catch {
          /* best-effort cleanup */
        }
      }
      setAdminError(
        err instanceof Error ? err.message : "Could not save title. Check Supabase policies.",
      );
    } finally {
      setAdminBusy(false);
      setAdminUploadStatus("");
    }
  };
  const editAdmin = (f: Film) => {
    setEditing(f.id);
    setAdmin(f.title);
    setAdminYear(String(f.year));
    setAdminGenre(f.genre);
    setAdminRating(String(f.rating || 8));
    setAdminImage(f.image);
    setAdminImageFile(null);
    if (adminImagePreview) URL.revokeObjectURL(adminImagePreview);
    setAdminImagePreview("");
    setAdminDesc(f.desc);
    setAdminKind(f.kind || "Film");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const deleteAdmin = async (id: number) => {
    if (
      !supabase ||
      !account?.isAdmin ||
      !window.confirm("Delete this catalogue title? This cannot be undone.")
    )
      return;
    const target = catalogue.find((f) => f.id === id);
    const { error } = await supabase.from("movies").delete().eq("id", id);
    if (error) {
      setAdminError(error.message);
      return;
    }
    setCatalogue((prev) => prev.filter((f) => f.id !== id));
    const path = target ? managedPosterPath(target.image) : null;
    if (path) {
      try {
        const removal = await supabase.storage.from("posters").remove([path]);
        if (removal.error) setToast(" deleted; poster cleanup needs review.");
      } catch {
        setToast(" deleted; poster cleanup needs review.");
      }
    } else setToast(" deleted");
  };
  const normalizePosterTitle = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const repairMissingPosters = async () => {
    if (!supabase || !account?.isAdmin) return;
    if (!tmdbToken) {
      setPosterRepairMessage(
        tr
          ? "TMDb anahtarı bulunamadı. VITE_TMDB_ACCESS_TOKEN ayarla."
          : "TMDb key missing. Configure VITE_TMDB_ACCESS_TOKEN.",
      );
      return;
    }
    setPosterRepairBusy(true);
    setPosterRepairMessage("");
    let repaired = 0;
    let failed = 0;
    try {
      const brokenIds = new Set<number>(missingPosterIds);
      const probeUrl = (src: string) =>
        new Promise<boolean>((resolve) => {
          const image = new Image();
          let settled = false;
          const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            resolve(ok);
          };
          const timer = window.setTimeout(() => finish(false), 10000);
          image.onload = () => finish(image.naturalWidth > 40 && image.naturalHeight > 40);
          image.onerror = () => finish(false);
          image.src = src;
        });
      const probe = (film: Film) => {
        const src = film.image || "";
        if (
          !src ||
          src.startsWith("/posters/") ||
          /placeholder|example\.com|no[-_ ]?poster/i.test(src)
        )
          return Promise.resolve(false);
        return probeUrl(src);
      };
      for (let i = 0; i < catalogue.length; i += 12) {
        const batch = catalogue.slice(i, i + 12);
        const results = await Promise.all(
          batch.map(async (film) => ({ id: film.id, ok: await probe(film) })),
        );
        results.forEach((result) => {
          if (!result.ok) brokenIds.add(result.id);
        });
      }
      setMissingPosterIds(Array.from(brokenIds));
      const targets = catalogue.filter((f) => brokenIds.has(f.id));
      if (!targets.length) {
        setPosterRepairMessage(
          tr
            ? "Posterler kontrol edildi; eksik veya erişilemeyen poster bulunamadı."
            : "Poster check complete; no missing or unreachable posters found.",
        );
        return;
      }
      for (const film of targets) {
        try {
          const mediaType = film.kind === "Dizi" ? "tv" : "movie";
          const url = new URL(`https://api.themoviedb.org/3/search/${mediaType}`);
          url.searchParams.set("query", film.title);
          url.searchParams.set(
            mediaType === "tv" ? "first_air_date_year" : "year",
            String(film.year),
          );
          url.searchParams.set("language", "en-US");
          const response = await fetch(url.toString(), {
            headers: tmdbHeaders,
          });
          if (!response.ok) throw new Error("TMDb search failed");
          const data = await response.json();
          const expected = normalizePosterTitle(film.title);
          const results = Array.isArray(data.results) ? data.results : [];
          const candidates = results
            .filter(
              (item: any) =>
                item.poster_path &&
                [item.title, item.name, item.original_title, item.original_name].some(
                  (candidate: any) =>
                    typeof candidate === "string" && normalizePosterTitle(candidate) === expected,
                ),
            )
            .sort((a: any, b: any) => {
              const ay = Number(String(a.release_date || a.first_air_date || "").slice(0, 4));
              const by = Number(String(b.release_date || b.first_air_date || "").slice(0, 4));
              return Number(by === film.year) - Number(ay === film.year);
            });
          let workingImage = "";
          for (const match of candidates) {
            const path = String(match.poster_path || "");
            if (!path.startsWith("/")) continue;
            for (const size of ["w500", "w342", "original"]) {
              const candidateImage = `https://image.tmdb.org/t/p/${size}${path}`;
              if (await probeUrl(candidateImage)) {
                workingImage = candidateImage;
                break;
              }
            }
            if (workingImage) break;
          }
          if (!workingImage) {
            failed++;
            continue;
          }
          const { error } = await supabase
            .from("movies")
            .update({ image_url: workingImage })
            .eq("id", film.id);
          if (error) {
            failed++;
            continue;
          }
          setCatalogue((prev) =>
            prev.map((item) => (item.id === film.id ? { ...item, image: workingImage } : item)),
          );
          setMissingPosterIds((prev) => prev.filter((id) => id !== film.id));
          brokenIds.delete(film.id);
          repaired++;
        } catch {
          failed++;
        }
      }
      setPosterRepairMessage(
        tr
          ? `Gerçekten yüklenen posterler düzeltildi: ${repaired}. Görseli doğrulanamayan/başarısız: ${failed}.`
          : `Verified posters repaired: ${repaired}. Unverified/failed: ${failed}.`,
      );
    } finally {
      setPosterRepairBusy(false);
    }
  };
  // Detect local placeholder posters too: these SVGs load successfully, so img onError never fires.
  useEffect(() => {
    if (!account?.isAdmin || !catalogue.length) return;
    const placeholderIds = catalogue
      .filter((f) => !f.image || f.image.startsWith("/posters/"))
      .map((f) => f.id);
    if (placeholderIds.length)
      setMissingPosterIds((prev) => {
        const next = Array.from(new Set([...prev, ...placeholderIds]));
        return next.length === prev.length && next.every((id, index) => id === prev[index])
          ? prev
          : next;
      });
  }, [account?.isAdmin]);
  useEffect(() => {
    if (missingPosterIds.length && !posterRepairBusy && account?.isAdmin)
      void repairMissingPosters();
  }, [missingPosterIds, account?.isAdmin]);
  const loadManagedUsers = async () => {
    if (!supabase || !account?.isAdmin) return;
    setUsersBusy(true);
    setUsersError("");
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list" },
      });
      if (error) throw error;
      if (!Array.isArray(data?.users))
        throw new Error("admin-users Edge Function is missing or returned an invalid response.");
      setManagedUsers(data.users);
    } catch (err) {
      let message =
        err instanceof Error
          ? err.message
          : "Could not load users. Deploy the secure admin-users Edge Function first.";
      const context = (err as { context?: Response })?.context;
      if (context instanceof Response) {
        try {
          const body = await context.clone().json();
          if (body?.error) message = String(body.error);
          else if (body?.message) message = String(body.message);
        } catch {}
      }
      setUsersError(message);
    } finally {
      setUsersBusy(false);
    }
  };
  const manageUser = async (userId: string, action: "promote" | "demote" | "delete") => {
    if (!supabase || !account?.isAdmin || (userId === account.user && action !== "promote")) return;
    if (
      action === "delete" &&
      !window.confirm(
        tr
          ? "Bu kullanıcı hesabı kalıcı olarak silinsin mi?"
          : "Permanently delete this user account?",
      )
    )
      return;
    if (
      action === "demote" &&
      !window.confirm(
        tr ? "Bu kullanıcının admin yetkisi kaldırılsın mı?" : "Remove this user’s admin role?",
      )
    )
      return;
    setUserActionId(userId);
    setUsersError("");
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action, userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (action === "delete") setManagedUsers((prev) => prev.filter((user) => user.id !== userId));
      else
        setManagedUsers((prev) =>
          prev.map((user) =>
            user.id === userId ? { ...user, role: action === "promote" ? "admin" : "user" } : user,
          ),
        );
    } catch (err) {
      let message =
        err instanceof Error
          ? err.message
          : "User management failed. Ensure the secure admin-users Edge Function is deployed.";
      const context = (err as { context?: Response })?.context;
      if (context instanceof Response) {
        try {
          const body = await context.clone().json();
          if (body?.error) message = String(body.error);
          else if (body?.message) message = String(body.message);
        } catch {}
      }
      setUsersError(message);
    } finally {
      setUserActionId(null);
    }
  };

  const toggle = async (id: number) => {
    const removing = watchlist.includes(id);
    const next = removing ? watchlist.filter((x) => x !== id) : [...watchlist, id];
    setWatchlist(next);
    localStorage.setItem(
      account ? "mfb-watchlist:" + account.email : "mfb-watchlist",
      JSON.stringify(next),
    );
    setToast(removing ? "Removed from your watchlist" : "Added to your watchlist");
    window.setTimeout(() => setToast(""), 2200);
    if (supabaseConfigured && supabase && account?.user) {
      const result = removing
        ? await supabase
            .from("user_watchlist")
            .delete()
            .eq("user_id", account.user)
            .eq("movie_id", id)
        : await supabase
            .from("user_watchlist")
            .upsert({ user_id: account.user, movie_id: id }, { onConflict: "user_id,movie_id" });
      if (result.error) {
        setToast("Saved on this device; cloud sync failed.");
        window.setTimeout(() => setToast(""), 2800);
      }
      return;
    }
    if (account?.token) {
      try {
        const response = await fetch(apiBaseUrl + "/api/watchlist/" + id, {
          method: removing ? "DELETE" : "POST",
          headers: { Authorization: "Bearer " + account.token },
        });
        if (!response.ok) {
          setToast("Saved locally, but server sync failed.");
          window.setTimeout(() => setToast(""), 2800);
        }
      } catch {
        setToast("Saved locally; API is currently unavailable.");
        window.setTimeout(() => setToast(""), 2800);
      }
    }
  };
  const toggleFavorite = async (id: number) => {
    const removing = favorites.includes(id);
    const next = removing ? favorites.filter((x) => x !== id) : [...favorites, id];
    setFavorites(next);
    localStorage.setItem(
      account ? "mfb-favorites:" + account.email : "mfb-favorites",
      JSON.stringify(next),
    );
    setToast(removing ? "Removed from favorites" : "Added to favorites");
    window.setTimeout(() => setToast(""), 2200);
    if (supabaseConfigured && supabase && account?.user) {
      const result = removing
        ? await supabase
            .from("user_favorites")
            .delete()
            .eq("user_id", account.user)
            .eq("movie_id", id)
        : await supabase
            .from("user_favorites")
            .upsert({ user_id: account.user, movie_id: id }, { onConflict: "user_id,movie_id" });
      if (result.error) {
        setToast("Saved locally; favorite sync failed.");
        window.setTimeout(() => setToast(""), 2800);
      }
    }
  };
  const filtered = useMemo(
    () =>
      catalogue.filter(
        (f) =>
          (browse === "All" || (f.kind || "Film") === browse) &&
          (!search ||
            [f.title, filmGenres(f).join(" "), f.desc, f.kind || "Film", String(f.year)].some((v) =>
              v.toLowerCase().includes(search.toLowerCase()),
            )) &&
          (genre === "All" || filmGenres(f).includes(genre)),
      ),
    [search, genre, browse],
  );
  const similars = useMemo(
    () =>
      selected
        ? catalogue
            .filter((f) => f.id !== selected.id)
            .map((f) => ({
              ...f,
              match: filmGenres(f).filter((g) => filmGenres(selected).includes(g)).length,
            }))
            .filter((f) => f.match > 0)
            .sort((a, b) => b.match - a.match || (b.rating || 0) - (a.rating || 0))
            .slice(0, 4)
        : [],
    [selected, catalogue],
  );
  const saveReview = async () => {
    if (!selected || reviewRating < 1) {
      setToast("Choose a star rating before saving your review.");
      return;
    }
    const saved = {
      rating: reviewRating,
      comment: reviewComment.trim(),
      updatedAt: new Date().toISOString(),
    };
    const next = { ...reviews, [selected.id]: saved };
    setReviews(next);
    localStorage.setItem("mfb-reviews", JSON.stringify(next));
    if (supabaseConfigured && supabase && account?.user) {
      const result = await supabase
        .from("movie_reviews")
        .upsert(
          {
            user_id: account.user,
            movie_id: selected.id,
            rating: reviewRating,
            comment: reviewComment.trim(),
            display_name: account.name,
          },
          { onConflict: "user_id,movie_id" },
        )
        .select("id,rating,comment,display_name,created_at,user_id")
        .single();
      if (result.error) {
        setToast(
          "Saved on this device. Cloud review sync failed; check the movie_reviews SQL policies.",
        );
      } else {
        setCommunityReviews((prev) =>
          [result.data as any, ...prev.filter((row) => row.user_id !== account.user)].slice(0, 8),
        );
        setToast("Your review was saved and synced.");
      }
    } else {
      setToast("Your rating was saved on this device. Sign in to sync it across devices.");
    }
    window.setTimeout(() => setToast(""), 2600);
  };
  const nav = ["Discover", "Movies", "TV Series", "Collections", "Genres"];
  const localizedGenre = (value: string) =>
    tr
      ? (
          {
            All: "Tümü",
            Action: "Aksiyon",
            Adventure: "Macera",
            Animation: "Animasyon",
            Comedy: "Komedi",
            Crime: "Suç",
            Documentary: "Belgesel",
            Drama: "Dram",
            Fantasy: "Fantastik",
            Horror: "Korku",
            Mystery: "Gizem",
            Romance: "Romantik",
            SciFi: "Bilim Kurgu",
            "Sci-Fi": "Bilim Kurgu",
            Thriller: "Gerilim",
            War: "Savaş",
            Western: "Vahşi Batı",
          } as Record<string, string>
        )[value] || value
      : value;
  const localizedDescription = (film: Film) => {
    const description = tr
      ? localizedDescriptions[film.title] ||
        (
          {
            "Breaking Bad":
              "Hayatını değiştiren bir teşhisin ardından bir kimya öğretmeni uyuşturucu ticaretine yönelir.",
            "Planet Earth":
              "Gezegenin yaşam alanlarını ve yaban hayatını keşfeden çığır açıcı bir doğa belgeseli.",
            "Planet Earth II":
              "Dünyanın adaları, dağları, ormanları ve çöllerinde olağanüstü bir yolculuk.",
            "Band of Brothers":
              "Amerikalı paraşütçülerden oluşan bir birlik, II. Dünya Savaşı sırasında Avrupa’da savaşır.",
            "Our Planet": "Doğal dünyaya ve geleceğini şekillendiren güçlere kapsamlı bir bakış.",
            "The Wire":
              "Baltimore’u kolluk kuvvetleri, siyaset ve suç dünyası üzerinden anlatan ayrıntılı bir portre.",
            "Avatar: The Last Airbender":
              "Genç bir hava bükücü, elementlerde ustalaşmak ve dünyaya dengeyi geri getirmek için yolculuğa çıkar.",
            Chernobyl:
              "Nükleer felakete müdahale eden insanlar, olayın insani ve siyasi sonuçlarıyla yüzleşir.",
            Oppenheimer:
              "J. Robert Oppenheimer’ın atom bombasının geliştirilmesindeki rolünün hikâyesi.",
            Interstellar:
              "Bir grup kaşif, insanlığın yıldızlar arasında bir geleceği olup olmadığını öğrenmek için galaksinin ötesine yolculuk eder.",
            "Dune: Part Two":
              "Paul Atreides, ailesini yok eden komploculara karşı intikam ararken Chani ve Fremenlerle birleşir.",
            "The Batman":
              "Şifreli ipuçları bırakan acımasız bir katil, Batman’i Gotham’ın karanlık yeraltı dünyasına sürükler.",
            "Avengers: Endgame": "Yenilmezler, evreni kurtarmak için son bir kez bir araya gelir.",
          } as Record<string, string>
        )[film.title] ||
        film.desc
      : film.desc;
    return tr && description.length > 125 ? `${description.slice(0, 122).trimEnd()}…` : description;
  };
  const card = (f: Film) => (
    <button
      type="button"
      className="poster"
      key={f.id}
      onClick={() => setSelected(f)}
      aria-label={tr ? `${f.title} ayrıntılarını görüntüle` : `View ${f.title} details`}
    >
      <div className="poster-img">
        <img
          src={f.image}
          alt={`${f.title} poster`}
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            if (!img.dataset.seedFallback) {
              const seed = films.find(
                (item) =>
                  item.title.trim().toLocaleLowerCase() === f.title.trim().toLocaleLowerCase() &&
                  item.year === f.year,
              );
              if (seed?.image && img.src !== seed.image) {
                img.dataset.seedFallback = "true";
                img.src = seed.image;
                return;
              }
            }
            if (img.dataset.fallback) {
              img.style.opacity = "0";
              return;
            }
            img.dataset.fallback = "true";
            img.src = `/posters/${f.id}.svg`;
          }}
        />
        <span className="poster-fallback">
          <Clapperboard size={26} />
          {f.title}
        </span>
        <span className="poster-hover">
          <span className="play-circle">
            <Play size={18} fill="currentColor" />
          </span>
          <span className="hover-title">{tr ? "Detayları gör" : "View details"}</span>
        </span>
        <span className="poster-year">{f.year}</span>
      </div>
      <span className="poster-title">{f.title}</span>
      <span className="poster-genre">
        {filmGenres(f).slice(0, 2).map(localizedGenre).join("  |  ")}
        {"  |  "}
        {tr ? (f.kind === "Dizi" ? "Dizi" : "Film") : f.kind === "Dizi" ? "TV Series" : "Film"}
      </span>
      {imdbRatings[f.title] && (
        <span className="imdb-rating">
          <b>IMDb</b> ★ {imdbRatings[f.title]}
        </span>
      )}
    </button>
  );
  return (
    <>
      <header className="topbar">
        <div style={{ position: "relative", left: "clamp(-24px, -1.4vw, -10px)" }}>
          <Logo small />
        </div>
        <nav className={mobile ? "nav open" : "nav"}>
          {nav.map((n) => (
            <button
              key={n}
              className={active === n ? "nav-link active" : "nav-link"}
              onClick={() => {
                if (n === "Movies") {
                  openBrowse("movies");
                  return;
                }
                if (n === "TV Series") {
                  openBrowse("series");
                  return;
                }
                setActive(n);
                setMobile(false);
                setBrowsePage(null);
                setBrowse("All");
                const target =
                  n === "Discover" ? "home" : n === "Collections" ? "collections" : "genres";
                if (categoryRoute || adminOpen || browsePage) {
                  window.history.pushState({}, "", "/");
                  setCategoryRoute(null);
                  setAdminOpen(false);
                  window.setTimeout(
                    () => document.getElementById(target)?.scrollIntoView({ behavior: "smooth" }),
                    0,
                  );
                } else document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {tr
                ? (
                    {
                      Discover: "Keşfet",
                      Movies: "Filmler",
                      "TV Series": "Diziler",
                      Collections: "Koleksiyonlar",
                      Genres: "Türler",
                    } as Record<string, string>
                  )[n]
                : n}
            </button>
          ))}
          <button
            className="nav-link"
            onClick={() => {
              setActive("My List");
              document.getElementById("my-list")?.scrollIntoView({ behavior: "smooth" });
              setMobile(false);
            }}
          >
            {tr ? "Listem" : "My List"} <span className="count">{watchlist.length}</span>
          </button>
          <button
            className="nav-link"
            onClick={() => {
              setActive("Favorites");
              document.getElementById("my-favorites")?.scrollIntoView({ behavior: "smooth" });
              setMobile(false);
            }}
          >
            <Heart size={14} /> {tr ? "Favoriler" : "Favorites"}{" "}
            <span className="count">{favorites.length}</span>
          </button>
        </nav>
        <div className="top-actions">
          <div
            className="language-switch"
            role="group"
            aria-label={tr ? "Dil seçimi" : "Language selection"}
          >
            <button
              type="button"
              className={language === "tr" ? "language-option active" : "language-option"}
              onClick={() => setLanguage("tr")}
              aria-pressed={language === "tr"}
            >
              TR
            </button>
            <span aria-hidden="true" className="language-divider">
              /
            </span>
            <button
              type="button"
              className={language === "en" ? "language-option active" : "language-option"}
              onClick={() => setLanguage("en")}
              aria-pressed={language === "en"}
            >
              EN
            </button>
          </div>
          <button
            className="icon-btn"
            aria-label={tr ? "Ara" : "Search"}
            onClick={() => {
              setShowSearch(!showSearch);
              document.getElementById("search-input")?.focus();
            }}
          >
            <Search size={18} />
          </button>
          {!account && (
            <button
              className="account-action register-action"
              onClick={() => {
                setAuthError("");
                setAuthMode("register");
              }}
              aria-label={tr ? "Hesap oluştur" : "Create account"}
            >
              <UserPlus size={16} />
              <span>{tr ? "Üye ol" : "Join"}</span>
            </button>
          )}
          <button
            className="account-action"
            onClick={() =>
              account
                ? (setAccountMenuOpen((v) => !v), setAccountPanel(null))
                : (setAuthError(""), setAuthMode("login"))
            }
            aria-expanded={account ? accountMenuOpen : undefined}
            aria-label={
              account ? (tr ? "Hesap menüsü" : "Account menu") : tr ? "Giriş yap" : "Sign in"
            }
          >
            {account ? (
              <>
                {profileAvatar ? (
                  <img
                    src={profileAvatar}
                    alt=""
                    aria-hidden="true"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "2px solid #e50046",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <UserRound size={16} />
                )}
                <span>{account.name.split(" ")[0]}</span>
                <ChevronDown size={13} />
              </>
            ) : (
              <>
                <LogIn size={16} />
                <span>{tr ? "Giriş yap" : "Sign in"}</span>
              </>
            )}
          </button>
          {account && accountMenuOpen && (
            <div className="account-dropdown" role="menu">
              <div className="account-dropdown-heading">
                <strong>{account.name}</strong>
                <span>{account.email}</span>
              </div>
              <button
                role="menuitem"
                onClick={() => {
                  setProfileName(account.name);
                  setAccountPanel("profile");
                  setAccountMenuOpen(false);
                }}
              >
                <UserRound size={16} /> {tr ? "Profil" : "Profile"}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setAccountPanel("activity");
                  setAccountMenuOpen(false);
                }}
              >
                <Clock size={16} /> {tr ? "Etkinliklerim" : "My activity"}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setAccountPanel("settings");
                  setAccountMenuOpen(false);
                }}
              >
                <Settings size={16} /> {tr ? "Hesap ayarları" : "Account settings"}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  setActive("My List");
                  document.getElementById("my-list")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <Bookmark size={16} /> {tr ? "İzleme listem" : "My watchlist"} ({watchlist.length})
              </button>
              {account.isAdmin && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setAdminOpen(true);
                    setAccountMenuOpen(false);
                    window.history.pushState({}, "", "/admin");
                  }}
                >
                  <ShieldCheck size={16} /> {tr ? "Yönetici paneli" : "Admin dashboard"}
                </button>
              )}
              <button role="menuitem" onClick={signOut}>
                <LogOut size={16} /> {tr ? "Çıkış yap" : "Sign out"}
              </button>
            </div>
          )}
          {account && (
            <button
              className="icon-btn signout-btn"
              aria-label={tr ? "Çıkış yap" : "Sign out"}
              title={tr ? "Çıkış yap" : "Sign out"}
              onClick={signOut}
            >
              <LogOut size={16} />
            </button>
          )}
          {adminOpen && (
            <button
              className="icon-btn"
              onClick={() => {
                setAdminOpen(false);
                window.history.pushState({}, "", "/");
              }}
              aria-label="Close admin panel"
            >
              <X size={16} />
            </button>
          )}
          <button
            className="icon-btn mobile-toggle"
            onClick={() => setMobile(!mobile)}
            aria-label="Toggle menu"
          >
            {mobile ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {showSearch && (
        <div className="search-drawer">
          <Search size={18} />
          <input
            id="search-input"
            aria-label={tr ? "Film ve dizilerde ara" : "Search films and series"}
            placeholder={tr ? "Film, dizi veya tür ara..." : "Search films, series, genres..."}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              document.getElementById("movies")?.scrollIntoView({ behavior: "smooth" });
            }}
          />
          <button
            className="icon-btn"
            onClick={() => {
              setShowSearch(false);
              setSearch("");
            }}
            aria-label="Close search"
          >
            <X size={18} />
          </button>
        </div>
      )}
      {!categoryRoute && !adminOpen && !browsePage && (
        <main id="home">
          <section
            className="hero"
            onTouchStart={(e) => {
              const t = e.touches[0];
              heroTouch.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              if (!heroTouch.current) return;
              const t = e.changedTouches[0];
              const dx = t.clientX - heroTouch.current.x,
                dy = t.clientY - heroTouch.current.y;
              heroTouch.current = null;
              if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) moveHero(dx < 0 ? 1 : -1);
            }}
          >
            <img
              key={currentHero.title}
              className="hero-image"
              style={{ "--hero-x": currentHero.focus, "--hero-lift": currentHero.lift } as any}
              src={currentHero.backdrop}
              alt={`${currentHero.title} featured backdrop`}
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                if (img.dataset.fallback) {
                  img.style.opacity = "0";
                  img.setAttribute("data-load-error", "true");
                  return;
                }
                img.dataset.fallback = "true";
                img.src = `/posters/backdrop-${currentHeroFilm.id}.svg`;
              }}
            />
            <div className="hero-shade" />
            <div className="hero-content">
              <p className="eyebrow">
                <span /> {tr ? "ÖNE ÇIKAN SEÇKİ" : "FEATURED SELECTION"}{" "}
                <span className="eyebrow-line" />
              </p>
              <h1>{currentHero.title.toUpperCase()}</h1>
              <p className="hero-desc">
                {tr
                  ? (
                      {
                        Oppenheimer:
                          "J. Robert Oppenheimer’ın atom bombasının geliştirilmesindeki rolünün hikâyesi.",
                        Interstellar:
                          "Bir grup kaşif, insanlığın yıldızların arasında bir geleceği olup olmadığını keşfetmek için galaksinin ötesine yolculuk eder.",
                        "Dune: Part Two":
                          "Paul Atreides, ailesini yok eden komploculara karşı intikam ararken Chani ve Fremenlerle birleşir.",
                        "The Batman":
                          "Sadist bir katilin şifreli ipuçları bırakması üzerine Batman, Gotham’ın karanlık yeraltı dünyasına iner.",
                        "Avengers: Endgame":
                          "Yenilmezler, evreni kurtarmak için son bir kez bir araya gelir.",
                      } as Record<string, string>
                    )[currentHero.title] || currentHero.tagline
                  : currentHero.tagline}
              </p>
              <div className="meta">
                <span>{currentHeroFilm.year}</span>
                <i />
                <span>{filmGenres(currentHeroFilm).map(localizedGenre).join("  |  ")}</span>
                <i />
                <span>
                  {tr
                    ? currentHeroFilm.kind === "Dizi"
                      ? "Dizi"
                      : "Film"
                    : currentHeroFilm.kind === "Dizi"
                      ? "TV Series"
                      : "Film"}
                </span>
                <i />
                <span>{currentHeroFilm.runtime}</span>
                {imdbRatings[currentHeroFilm.title] && (
                  <>
                    <i />
                    <span className="detail-rating">
                      IMDb ★ {imdbRatings[currentHeroFilm.title]}
                    </span>
                  </>
                )}
              </div>
              <div className="hero-actions">
                <button className="btn-primary" onClick={() => setSelected(currentHeroFilm)}>
                  <Play size={16} fill="currentColor" /> {tr ? "Yapımı keşfet" : "Explore title"}
                </button>
                <button className="btn-secondary" onClick={() => toggle(currentHeroFilm.id)}>
                  {watchlist.includes(currentHeroFilm.id) ? (
                    <Check size={17} />
                  ) : (
                    <Plus size={17} />
                  )}{" "}
                  {watchlist.includes(currentHeroFilm.id)
                    ? tr
                      ? "Listemde"
                      : "In My List"
                    : tr
                      ? "Listeme ekle"
                      : "Add to My List"}
                </button>
              </div>
              <p className="hero-tagline">
                {tr ? "PERDENİN ÖTESİNİ KEŞFET." : "DISCOVER BEYOND THE SCREEN."}
              </p>
            </div>
            <div className="hero-index" aria-label="Featured titles">
              {heroSlides.map((slide, index) => (
                <button
                  type="button"
                  key={slide.title}
                  className={index === heroIndex ? "index-active" : ""}
                  aria-label={`Show featured title ${index + 1}: ${slide.title}`}
                  aria-pressed={index === heroIndex}
                  onClick={() => setHeroIndex(index)}
                >
                  {String(index + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
            <div className="hero-bottom">
              <span>
                {String(heroIndex + 1).padStart(2, "0")} /{" "}
                {String(heroSlides.length).padStart(2, "0")}
              </span>
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${((heroIndex + 1) / heroSlides.length) * 100}%` }} />
              </div>
              <button
                type="button"
                aria-label="Previous featured title"
                onClick={() => moveHero(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button type="button" aria-label="Next featured title" onClick={() => moveHero(1)}>
                <ChevronRight size={18} />
              </button>
            </div>
          </section>
          <section className="section" id="movies">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{tr ? "ŞİMDİNİN ÖNE ÇIKANLARI" : "THE CULTURE RIGHT NOW"}</p>
                <h2>
                  {tr ? (
                    <>
                      Bu haftanın <em>trendleri</em>
                    </>
                  ) : (
                    <>
                      Trending <em>this week</em>
                    </>
                  )}
                </h2>
              </div>
              <button className="text-link" onClick={() => openBrowse("movies")}>
                {tr ? "Tümünü keşfet" : "Explore all"} <ArrowRight size={15} />
              </button>
            </div>
            {(search || genre !== "All" || browse !== "All") && (
              <p className="results-label">
                {filtered.length} {tr ? "yapım" : "titles"}
                {search ? (tr ? ` arama: "${search}"` : ` matching "${search}"`) : ""}
                {genre !== "All" ? (tr ? ` tür: ${localizedGenre(genre)}` : ` in ${genre}`) : ""}
                {browse !== "All"
                  ? tr
                    ? `  |  ${browse === "Film" ? "filmler" : "diziler"}`
                    : `  |  ${browse === "Film" ? "films" : "TV series"}`
                  : tr
                    ? "  |  film ve diziler"
                    : "  |  films and series"}
              </p>
            )}
            {filtered.length > 0 ? (
              <PosterCarousel label={tr ? "Trend filmler ve diziler" : "Trending films and series"}>
                {(search || genre !== "All" || browse !== "All"
                  ? filtered
                  : [...catalogue].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 10)
                ).map(card)}
              </PosterCarousel>
            ) : (
              <div className="empty-list catalog-empty">
                <Clapperboard size={25} />
                <h3>{tr ? "Henüz yapım bulunamadı." : "No titles found yet."}</h3>
                <p>
                  {tr
                    ? "Başka bir arama deneyin veya farklı bir tür seçin."
                    : "Try another search or choose a different genre."}
                </p>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setSearch("");
                    setGenre("All");
                  }}
                >
                  {tr ? "Filtreleri temizle" : "Clear filters"} <X size={15} />
                </button>
              </div>
            )}
          </section>
          <section className="section watch-history-section" aria-labelledby="history-heading">
            {watchHistory.length > 0 && (
              <>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      {tr ? "KALDIĞIN YERDEN DEVAM ET" : "PICK UP WHERE YOU LEFT OFF"}
                    </p>
                    <h2 id="history-heading">
                      {tr ? (
                        <>
                          Son <em>izlediklerin</em>
                        </>
                      ) : (
                        <>
                          Recently <em>viewed</em>
                        </>
                      )}
                    </h2>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => {
                      setWatchHistory([]);
                      localStorage.removeItem("mfb-watch-history");
                      setToast(tr ? "İzleme geçmişi temizlendi." : "Viewing history cleared.");
                    }}
                  >
                    {tr ? "Geçmişi temizle" : "Clear history"} <X size={14} />
                  </button>
                </div>
                <PosterCarousel label={tr ? "Son izlenen yapımlar" : "Recently viewed titles"}>
                  {watchHistory
                    .map((id) => catalogue.find((f) => f.id === id))
                    .filter((f): f is Film => Boolean(f))
                    .map(card)}
                </PosterCarousel>
              </>
            )}
          </section>
          <section className="collections section" id="collections">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{tr ? "MFB TARAFINDAN SEÇİLDİ" : "HANDPICKED BY MFB"}</p>
                <h2>
                  MFB <em>{tr ? "Seçkisi" : "Picks"}</em>
                </h2>
              </div>
              <p className="section-note">
                {tr
                  ? "Jenerik bittikten sonra bile akılda kalan hikâyeler."
                  : "Stories that stay with you long after the credits roll."}
              </p>
            </div>
            <div className="editorial-grid">
              <button className="editorial-feature" onClick={() => openBrowse("movies")}>
                <img
                  src="https://image.tmdb.org/t/p/original/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg"
                  alt="Interstellar cinematic landscape"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    if (img.dataset.fallback) {
                      img.style.opacity = "0";
                      return;
                    }
                    img.dataset.fallback = "true";
                    img.src = "/posters/backdrop-3.svg";
                  }}
                />
                <span className="editorial-gradient" />
                <span className="editorial-copy">
                  <span className="eyebrow">{tr ? "SİNEMA SANATI" : "THE ART OF CINEMA"}</span>
                  <strong>
                    {tr ? (
                      <>
                        Zamansız hikâyeler.
                        <br />
                        Cesur bakış açıları.
                      </>
                    ) : (
                      <>
                        Timeless stories.
                        <br />
                        Bolder perspectives.
                      </>
                    )}
                  </strong>
                  <span>
                    {tr
                      ? "Meraklı zihinler için seçilmiş sıra dışı filmler."
                      : "A curated collection of extraordinary films for curious minds."}
                  </span>
                  <b>
                    {tr ? "Koleksiyonu keşfet" : "Explore the collection"} <ArrowRight size={14} />
                  </b>
                </span>
              </button>
              <button
                className="collection-tile"
                onClick={() => setSelected(catalogue.find((f) => f.title === "Oppenheimer")!)}
              >
                <img
                  src={catalogue.find((f) => f.title === "Oppenheimer")!.image}
                  alt="Oppenheimer official poster"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    if (img.dataset.fallback) {
                      img.style.opacity = "0";
                      return;
                    }
                    img.dataset.fallback = "true";
                    img.src = `/posters/${catalogue.find((f) => f.title === "Oppenheimer")!.id}.svg`;
                  }}
                />
                <span>
                  <small>{tr ? "01 / USTALIK" : "01 / THE CRAFT"}</small>
                  <b>
                    {tr ? (
                      <>
                        Modern
                        <br />
                        başyapıtlar
                      </>
                    ) : (
                      <>
                        Modern
                        <br />
                        masterpieces
                      </>
                    )}
                  </b>
                </span>
              </button>
              <button className="collection-tile" onClick={() => setSelected(catalogue[0])}>
                <img
                  src="https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg"
                  alt="Dune: Part Two cinematic backdrop"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    if (img.dataset.fallback) {
                      img.style.opacity = "0";
                      return;
                    }
                    img.dataset.fallback = "true";
                    img.src = `/posters/${catalogue[0].id}.svg`;
                  }}
                />
                <span>
                  <small>{tr ? "02 / KEŞİF" : "02 / DISCOVERY"}</small>
                  <b>
                    {tr ? (
                      <>
                        Gizli
                        <br />
                        mücevherler
                      </>
                    ) : (
                      <>
                        Hidden
                        <br />
                        gems
                      </>
                    )}
                  </b>
                </span>
              </button>
              <button className="collection-tile" onClick={() => setSelected(catalogue[3])}>
                <img
                  src="https://image.tmdb.org/t/p/w1280/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg"
                  alt="The Batman cinematic backdrop"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    if (img.dataset.fallback) {
                      img.style.opacity = "0";
                      return;
                    }
                    img.dataset.fallback = "true";
                    img.src = `/posters/${catalogue[3].id}.svg`;
                  }}
                />
                <span>
                  <small>{tr ? "03 / ATMOSFER" : "03 / THE MOOD"}</small>
                  <b>
                    {tr ? (
                      <>
                        Karanlık ve
                        <br />
                        unutulmaz
                      </>
                    ) : (
                      <>
                        Dark &<br />
                        unforgettable
                      </>
                    )}
                  </b>
                </span>
              </button>
            </div>
          </section>
          <section className="section" id="series">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{tr ? "YENİ TUTKUN" : "YOUR NEXT OBSESSION"}</p>
                <h2>
                  {tr ? (
                    <>
                      Tadını çıkaracağın <em>diziler</em>
                    </>
                  ) : (
                    <>
                      Series worth <em>savouring</em>
                    </>
                  )}
                </h2>
              </div>
              <button className="text-link" onClick={() => openBrowse("series")}>
                {tr ? "Dizileri keşfet" : "Discover series"} <ArrowRight size={15} />
              </button>
            </div>
            <div className="series-grid">
              {catalogue
                .filter((f) => f.kind === "Dizi")
                .sort((a, b) => (b.rating || 0) - (a.rating || 0))
                .slice(0, 8)
                .map((f, i) => (
                  <button className="series-card" key={f.id} onClick={() => setSelected(f)}>
                    <div className="series-art">
                      <span className="series-art-fallback">
                        <Clapperboard size={22} />
                        {f.title}
                      </span>
                      <img
                        className="series-poster-fallback"
                        style={{ objectFit: "cover", background: "#08080b" }}
                        src={f.image}
                        alt={`${f.title} artwork`}
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          if (!img.dataset.seedFallback) {
                            const seed = films.find(
                              (item) =>
                                item.title.trim().toLocaleLowerCase() ===
                                  f.title.trim().toLocaleLowerCase() && item.year === f.year,
                            );
                            if (seed?.image && img.src !== seed.image) {
                              img.dataset.seedFallback = "true";
                              img.src = seed.image;
                              return;
                            }
                          }
                          if (img.dataset.fallback) {
                            img.style.opacity = "0";
                            return;
                          }
                          img.dataset.fallback = "true";
                          img.src = `/posters/${f.id}.svg`;
                        }}
                      />
                    </div>
                    <div>
                      <small>
                        {String(i + 1).padStart(2, "0")} - {tr ? "DİZİ" : "SERIES"}
                      </small>
                      <h3>{f.title}</h3>
                      <p>{localizedDescription(f)}</p>
                      <span>
                        {tr ? "Yapımı keşfet" : "Discover title"} <ArrowRight size={14} />
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          </section>
          <section className="section discover-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{tr ? "MERAKINI TAKİP ET" : "FOLLOW YOUR CURIOSITY"}</p>
                <h2>
                  {tr ? (
                    <>
                      Türe göre <em>keşfet</em>
                    </>
                  ) : (
                    <>
                      Explore by <em>genre</em>
                    </>
                  )}
                </h2>
              </div>
            </div>
            <div className="genre-list" id="genres">
              {genres.map((g, i) => (
                <button
                  key={g}
                  className={genre === g ? "genre-chip selected" : "genre-chip"}
                  onClick={() => openGenre(g)}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {localizedGenre(g)}
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
            <p className="genre-help">
              {tr
                ? "Film ve dizileri türe göre keşfetmek için bir tür seç."
                : "Choose a genre to open its dedicated page with films and series."}
            </p>
          </section>
          <section className="section my-list" id="my-list">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {tr ? "DAHA SONRA İZLEMEK İÇİN SAKLA" : "SAVE IT FOR LATER"}
                </p>
                <h2>
                  {tr ? (
                    <>
                      İzleme <em>listem</em>
                    </>
                  ) : (
                    <>
                      Your <em>watchlist</em>
                    </>
                  )}
                </h2>
              </div>
              <span className="list-count">
                <Bookmark size={15} />
                {watchlist.length} {tr ? "yapım kayıtlı" : "titles saved"}
              </span>
            </div>
            {watchlist.length ? (
              <PosterCarousel label={tr ? "İzleme listem" : "My watchlist"}>
                {catalogue.filter((f) => watchlist.includes(f.id)).map(card)}
              </PosterCarousel>
            ) : (
              <div className="empty-list">
                <Bookmark size={25} />
                <h3>
                  {tr ? "Sıradaki favorin seni bekliyor." : "Your next favourite is waiting."}
                </h3>
                <p>
                  {tr
                    ? "Daha sonra izlemek için film ve dizileri kişisel listene ekle."
                    : "Save films and series to build a personal collection for later."}
                </p>
                <button
                  className="btn-secondary"
                  onClick={() =>
                    document.getElementById("movies")?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  {tr ? "Yapımları keşfet" : "Explore titles"} <ArrowRight size={15} />
                </button>
              </div>
            )}
          </section>
          <section className="section my-list" id="my-favorites">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {tr ? "EN SEVDİKLERİN YANINDA OLSUN" : "KEEP YOUR ALL-TIME PICKS CLOSE"}
                </p>
                <h2>
                  {tr ? (
                    <>
                      Favori <em>yapımlarım</em>
                    </>
                  ) : (
                    <>
                      Your <em>favorites</em>
                    </>
                  )}
                </h2>
              </div>
              <span className="list-count">
                <Heart size={15} />
                {favorites.length} {tr ? "favori" : "favorites"}
              </span>
            </div>
            {favorites.length ? (
              <PosterCarousel label={tr ? "Favori yapımlar" : "Favorite titles"}>
                {catalogue.filter((f) => favorites.includes(f.id)).map(card)}
              </PosterCarousel>
            ) : (
              <div className="empty-list">
                <Heart size={25} />
                <h3>{tr ? "Favorilerine yer aç." : "Make room for your favourites."}</h3>
                <p>
                  {tr
                    ? "En sevdiğin yapımları izleme listenden ayrı tut."
                    : "Save the titles you love most separately from your watchlist."}
                </p>
                <button
                  className="btn-secondary"
                  onClick={() =>
                    document.getElementById("movies")?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  {tr ? "Yapımları keşfet" : "Explore titles"} <ArrowRight size={15} />
                </button>
              </div>
            )}
          </section>
        </main>
      )}
      {browsePage && !adminOpen && !categoryRoute && (
        <main className="genre-page section browse-page">
          <div className="genre-breadcrumb">
            <button
              onClick={() => {
                window.history.pushState({}, "", "/");
                setBrowsePage(null);
                setBrowse("All");
                setActive("Discover");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              {tr ? "Keşfet" : "Discover"}
            </button>
            <ChevronRight size={14} />
            <span>
              {browsePage === "movies" ? (tr ? "Filmler" : "Movies") : tr ? "Diziler" : "TV Series"}
            </span>
          </div>
          <div className="genre-page-heading">
            <div>
              <p className="eyebrow">{tr ? "KOLEKSİYONU KEŞFET" : "EXPLORE THE COLLECTION"}</p>
              <h1>
                {browsePage === "movies"
                  ? tr
                    ? "Filmler"
                    : "Movies"
                  : tr
                    ? "Diziler"
                    : "TV Series"}
              </h1>
              <p>
                {browsePage === "movies"
                  ? tr
                    ? "Bir sonraki film gecen için seçilmiş filmleri keşfet."
                    : "Explore films selected for your next movie night."
                  : tr
                    ? "Zaman ayırmaya değer dizileri keşfet."
                    : "Explore series worth spending time with."}
              </p>
            </div>
            <span className="genre-total">
              {filtered.length} {tr ? "yapım" : "titles"}
            </span>
          </div>
          <div className="genre-tools browse-tools">
            <label className="genre-search">
              <Search size={17} />
              <input
                aria-label={
                  tr
                    ? "Yapım, tür ve yıl ara"
                    : `Search ${browsePage === "movies" ? "movies" : "TV series"}`
                }
                placeholder={tr ? "Yapım, tür veya yıl ara..." : "Search titles, genres, years..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label={tr ? "Aramayı temizle" : "Clear search"}
                >
                  <X size={15} />
                </button>
              )}
            </label>
            <label className="genre-sort-label">
              {tr ? "Tür" : "Genre"}
              <select value={genre} onChange={(e) => setGenre(e.target.value)}>
                {genres.map((g) => (
                  <option key={g} value={g}>
                    {g === "All" ? (tr ? "Tüm türler" : "All genres") : localizedGenre(g)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filtered.length ? (
            <div className="genre-poster-grid">
              {[...filtered].sort((a, b) => (b.rating || 0) - (a.rating || 0)).map(card)}
            </div>
          ) : (
            <div className="empty-list genre-empty">
              <Clapperboard size={25} />
              <h3>{tr ? "Yapım bulunamadı." : "No titles found."}</h3>
              <p>
                {tr
                  ? "Başka bir arama yap veya filtreleri temizle."
                  : "Try another search or clear your filters."}
              </p>
              <button
                className="btn-secondary"
                onClick={() => {
                  setSearch("");
                  setGenre("All");
                }}
              >
                {tr ? "Filtreleri temizle" : "Clear filters"} <X size={15} />
              </button>
            </div>
          )}
        </main>
      )}
      {adminOpen && (
        <main className="admin-page section">
          <div className="genre-breadcrumb">
            <button
              onClick={() => {
                setAdminOpen(false);
                window.history.pushState({}, "", "/");
              }}
            >
              {tr ? "Keşfet" : "Discover"}
            </button>
            <ChevronRight size={14} />
            <span>{tr ? "Yönetim paneli" : "Admin dashboard"}</span>
          </div>
          <div className="genre-page-heading">
            <div>
              <p className="eyebrow">{tr ? "KATALOG YÖNETİMİ" : "CATALOGUE MANAGEMENT"}</p>
              <h1>
                {tr ? "Yönetim" : "Admin"} <em>{tr ? "paneli" : "dashboard"}</em>
              </h1>
            </div>
            <span className="genre-total">
              {catalogue.length} {tr ? "yapım" : "titles"}
            </span>
          </div>
          {!supabaseConfigured && (
            <p className="admin-alert">
              {tr
                ? "Supabase yapılandırılmamış. Proje URL’sini ve yayınlanabilir anahtarı ekle, ardından supabase/schema.sql dosyasını uygula."
                : "Supabase is not configured. Add the project URL and publishable key, then apply supabase/schema.sql."}
            </p>
          )}
          {!account?.isAdmin && (
            <p className="admin-alert">
              {tr
                ? "Bu hesapta yönetici yetkisi yok. Bir hesap oluştur ve README.md dosyasındaki SQL talimatlarıyla kullanıcı kimliğine yönetici rolü ver."
                : "Admin access is not granted to this account. Create an account, then promote its user ID to the admin role using the SQL instructions in README.md."}
            </p>
          )}
          {account?.isAdmin && (
            <>
              <div className="admin-section-tabs">
                <button
                  type="button"
                  className={adminSection === "catalogue" ? "genre-tab active" : "genre-tab"}
                  onClick={() => setAdminSection("catalogue")}
                >
                  {tr ? "Katalog" : "Catalogue"}
                </button>
                <button
                  type="button"
                  className={adminSection === "users" ? "genre-tab active" : "genre-tab"}
                  onClick={() => {
                    setAdminSection("users");
                    if (!managedUsers.length) void loadManagedUsers();
                  }}
                >
                  <UserRound size={15} />
                  {tr ? "Kullanıcılar" : "Users"}
                </button>
              </div>
              {adminSection === "catalogue" && (
                <>
                  <div className="admin-layout">
                    <form className="admin-form" onSubmit={saveAdmin}>
                      <h2>
                        {editing
                          ? tr
                            ? "Yapımı düzenle"
                            : "Edit title"
                          : tr
                            ? "Yapım ekle"
                            : "Add a title"}
                      </h2>
                      <label>
                        {tr ? "Yapım adı" : "Title"}
                        <input
                          required
                          minLength={2}
                          value={admin}
                          onChange={(e) => setAdmin(e.target.value)}
                        />
                      </label>
                      <div className="admin-form-row">
                        <label>
                          {tr ? "Yayın yılı" : "Release year"}
                          <input
                            type="number"
                            min="1888"
                            max={new Date().getFullYear() + 10}
                            required
                            value={adminYear}
                            onChange={(e) => setAdminYear(e.target.value)}
                          />
                        </label>
                        <label>
                          {tr ? "MFB puanı" : "MFB score"}
                          <input
                            type="number"
                            min="0"
                            max="10"
                            step="0.1"
                            required
                            value={adminRating}
                            onChange={(e) => setAdminRating(e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="admin-form-row">
                        <label>
                          {tr ? "Tür" : "Genre"}
                          <select
                            value={adminGenre}
                            onChange={(e) => setAdminGenre(e.target.value)}
                          >
                            {genres
                              .filter((g) => g !== "All")
                              .map((g) => (
                                <option key={g} value={g}>
                                  {localizedGenre(g)}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          <select
                            value={adminKind}
                            onChange={(e) => setAdminKind(e.target.value as "Film" | "Dizi")}
                          >
                            <option value="Film">Film</option>
                            <option value="Dizi">{tr ? "Dizi" : "TV Series"}</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        {tr ? "Poster URL" : "Poster URL"}{" "}
                        <span>
                          ({tr ? "dosya yüklüyorsan isteğe bağlı" : "optional if uploading a file"})
                        </span>
                        <input
                          type="url"
                          value={adminImage}
                          onChange={(e) => {
                            setAdminImage(e.target.value);
                            if (adminImageFile) {
                              setAdminImageFile(null);
                              if (adminImagePreview) URL.revokeObjectURL(adminImagePreview);
                              setAdminImagePreview("");
                            }
                          }}
                          placeholder="https://example.com/poster.jpg"
                        />
                      </label>
                      <label>
                        {tr
                          ? "Veya poster yükle (JPG, PNG, WebP, AVIF | en fazla 5 MB)"
                          : "Or upload poster (JPG, PNG, WebP, AVIF | max 5 MB)"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setAdminError("");
                            if (!file) {
                              setAdminImageFile(null);
                              if (adminImagePreview) URL.revokeObjectURL(adminImagePreview);
                              setAdminImagePreview("");
                              return;
                            }
                            if (
                              !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
                                file.type,
                              )
                            ) {
                              setAdminError("Poster must be JPG, PNG, WebP or AVIF.");
                              e.currentTarget.value = "";
                              return;
                            }
                            if (file.size > 5 * 1024 * 1024) {
                              setAdminError("Poster file must be 5 MB or smaller.");
                              e.currentTarget.value = "";
                              return;
                            }
                            if (adminImagePreview) URL.revokeObjectURL(adminImagePreview);
                            setAdminImageFile(file);
                            setAdminImagePreview(URL.createObjectURL(file));
                            setAdminImage("");
                          }}
                        />
                      </label>
                      {(adminImagePreview || adminImage) && (
                        <div className="admin-poster-preview">
                          <img
                            src={adminImagePreview || adminImage}
                            alt="Poster preview"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.opacity = "0.25";
                            }}
                          />
                          <span>
                            {adminImageFile ? "Selected poster preview" : "Current poster"}
                          </span>
                        </div>
                      )}
                      {adminUploadStatus && (
                        <p className="admin-upload-status" role="status">
                          {adminUploadStatus}
                        </p>
                      )}
                      <label>
                        {tr ? "Açıklama" : "Description"}
                        <textarea
                          required
                          rows={4}
                          value={adminDesc}
                          onChange={(e) => setAdminDesc(e.target.value)}
                        />
                      </label>
                      {adminError && (
                        <p className="auth-error" role="alert">
                          {adminError}
                        </p>
                      )}
                      <div className="hero-actions">
                        <button
                          className="btn-primary"
                          disabled={adminBusy || !account?.isAdmin || !supabaseConfigured}
                        >
                          {adminBusy
                            ? tr
                              ? "Kaydediliyor..."
                              : "Saving..."
                            : editing
                              ? tr
                                ? "Yapımı güncelle"
                                : "Update title"
                              : tr
                                ? "Yapım ekle"
                                : "Add title"}
                        </button>
                        {editing && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                              setEditing(null);
                              setAdmin("");
                              setAdminDesc("");
                              setAdminImage("");
                              setAdminImageFile(null);
                              if (adminImagePreview) URL.revokeObjectURL(adminImagePreview);
                              setAdminImagePreview("");
                            }}
                          >
                            {tr ? "İptal" : "Cancel"}
                          </button>
                        )}
                      </div>
                    </form>
                    <section className="admin-table-wrap">
                      <h2>{tr ? "Katalogdaki yapımlar" : "Catalogue titles"}</h2>
                      <label className="admin-catalogue-search">
                        <Search size={17} />
                        <input
                          type="search"
                          value={adminCatalogueSearch}
                          onChange={(e) => setAdminCatalogueSearch(e.target.value)}
                          placeholder={
                            tr ? "Katalogda film veya dizi ara…" : "Search catalogue titles…"
                          }
                          aria-label={tr ? "Katalogda ara" : "Search catalogue"}
                        />
                        {adminCatalogueSearch && (
                          <button
                            type="button"
                            onClick={() => setAdminCatalogueSearch("")}
                            aria-label={tr ? "Aramayı temizle" : "Clear search"}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </label>
                      {posterRepairMessage && (
                        <p className="detail-muted" role="status">
                          {posterRepairMessage}
                        </p>
                      )}
                      <div className="admin-table-scroll">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>{tr ? "Poster" : "Poster"}</th>
                              <th></th>
                              <th></th>
                              <th>{tr ? "MFB puanı" : "MFB score"}</th>
                              <th>{tr ? "İşlemler" : "Actions"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {catalogue.filter(
                              (f) =>
                                !adminCatalogueSearch ||
                                [
                                  f.title,
                                  String(f.year),
                                  filmGenres(f).join(" "),
                                  f.kind || "Film",
                                ].some((value) =>
                                  value
                                    .toLowerCase()
                                    .includes(adminCatalogueSearch.trim().toLowerCase()),
                                ),
                            ).length ? (
                              catalogue
                                .filter(
                                  (f) =>
                                    !adminCatalogueSearch ||
                                    [
                                      f.title,
                                      String(f.year),
                                      filmGenres(f).join(" "),
                                      f.kind || "Film",
                                    ].some((value) =>
                                      value
                                        .toLowerCase()
                                        .includes(adminCatalogueSearch.trim().toLowerCase()),
                                    ),
                                )
                                .slice()
                                .sort((a, b) => a.title.localeCompare(b.title))
                                .map((f) => (
                                  <tr key={f.id}>
                                    <td>
                                      <AdminCataloguePoster
                                        film={f}
                                        onMissing={(id) =>
                                          setMissingPosterIds((prev) =>
                                            prev.includes(id) ? prev : [...prev, id],
                                          )
                                        }
                                      />
                                    </td>
                                    <td>
                                      <strong>{f.title}</strong>
                                      <small>
                                        {filmGenres(f)
                                          .slice(0, 2)
                                          .map(localizedGenre)
                                          .join("  |  ")}{" "}
                                        /{" "}
                                        {tr
                                          ? f.kind === "Dizi"
                                            ? "Dizi"
                                            : "Film"
                                          : f.kind || "Film"}
                                      </small>
                                    </td>
                                    <td>{f.year}</td>
                                    <td>* {(f.rating || 0).toFixed(1)}</td>
                                    <td>
                                      <div className="admin-row-actions">
                                        <button
                                          type="button"
                                          onClick={() => editAdmin(f)}
                                          disabled={!account?.isAdmin}
                                        >
                                          {tr ? "Düzenle" : "Edit"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteAdmin(f.id)}
                                          disabled={!account?.isAdmin}
                                        >
                                          {tr ? "Sil" : "Delete"}
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))
                            ) : (
                              <tr>
                                <td colSpan={5}>
                                  {adminCatalogueSearch
                                    ? tr
                                      ? "Aramayla eşleşen yapım bulunamadı."
                                      : "No titles match your search."
                                    : tr
                                      ? "Katalogda yapım bulunamadı. Formu kullanarak ilk yapımı ekle."
                                      : "No catalogue titles found. Add the first title using the form."}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                </>
              )}
              {adminSection === "users" && (
                <section className="admin-users-panel">
                  <div className="admin-users-heading">
                    <div>
                      <h2>{tr ? "Kayıtlı kullanıcılar" : "Registered users"}</h2>
                      <p>
                        {tr
                          ? "Kullanıcı rolleri güvenli sunucu işlevi üzerinden yönetilir."
                          : "User roles are managed through a secure server function."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void loadManagedUsers()}
                      disabled={usersBusy}
                    >
                      {usersBusy ? (tr ? "Yükleniyor…" : "Loading…") : tr ? "Yenile" : "Refresh"}
                    </button>
                  </div>
                  <input
                    className="admin-user-search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder={tr ? "E-posta ile ara…" : "Search by email…"}
                    aria-label={tr ? "Kullanıcı ara" : "Search users"}
                  />
                  {usersError && (
                    <p className="admin-alert" role="alert">
                      {usersError}
                    </p>
                  )}
                  {usersBusy ? (
                    <p className="detail-muted">
                      {tr ? "Kullanıcılar yükleniyor…" : "Loading users…"}
                    </p>
                  ) : (
                    <div className="admin-users-list">
                      {managedUsers
                        .filter((user) =>
                          (user.email || "").toLowerCase().includes(userSearch.toLowerCase()),
                        )
                        .map((user) => (
                          <article className="admin-user-row" key={user.id}>
                            <div className="admin-user-info">
                              <strong>{user.email || user.id}</strong>
                              <small>
                                {user.created_at
                                  ? new Date(user.created_at).toLocaleDateString()
                                  : ""}{" "}
                                · {user.role === "admin" ? "Admin" : tr ? "Kullanıcı" : "User"}
                              </small>
                            </div>
                            <div className="admin-row-actions">
                              {user.role === "admin" ? (
                                <button
                                  type="button"
                                  disabled={!!userActionId || user.id === account?.user}
                                  onClick={() => void manageUser(user.id, "demote")}
                                >
                                  {userActionId === user.id
                                    ? "…"
                                    : tr
                                      ? "Admini kaldır"
                                      : "Remove admin"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!!userActionId}
                                  onClick={() => void manageUser(user.id, "promote")}
                                >
                                  {userActionId === user.id ? "…" : tr ? "Admin yap" : "Make admin"}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={!!userActionId || user.id === account?.user}
                                onClick={() => void manageUser(user.id, "delete")}
                              >
                                {tr ? "Sil" : "Delete"}
                              </button>
                            </div>
                          </article>
                        ))}
                      {!managedUsers.length && !usersBusy && !usersError && (
                        <p className="detail-muted">
                          {tr ? "Kullanıcı listesi boş." : "No users loaded."}
                        </p>
                      )}
                    </div>
                  )}
                  <p className="admin-note">
                    {tr
                      ? "Not: Kullanıcı yönetiminin çalışması için Supabase Edge Function “admin-users” dağıtılmalıdır."
                      : "Note: Deploy the Supabase Edge Function “admin-users” for user management to work."}
                  </p>
                </section>
              )}
            </>
          )}
        </main>
      )}
      {categoryRoute && !adminOpen && (
        <main className="genre-page section">
          <div className="genre-breadcrumb">
            <button
              onClick={() => {
                window.history.pushState({}, "", "/");
                setCategoryRoute(null);
                setGenre("All");
                setActive("Discover");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              {tr ? "Keşfet" : "Discover"}
            </button>
            <ChevronRight size={14} />
            <span>
              {tr ? localizedGenre(categoryRoute) : genreLabels[categoryRoute] || categoryRoute}
            </span>
          </div>
          <div className="genre-page-heading">
            <div>
              <p className="eyebrow">{tr ? "KOLEKSİYONU KEŞFET" : "EXPLORE THE COLLECTION"}</p>
              <h1>
                {tr ? localizedGenre(categoryRoute) : genreLabels[categoryRoute] || categoryRoute}
              </h1>
              <p>
                {tr
                  ? "Bu türdeki film ve dizileri keşfet. Varsayılan sıralama MFB puanına göredir."
                  : "Explore films and series in this genre. Sorted by MFB score by default."}
              </p>
              <small className="rating-disclaimer">
                {tr
                  ? "MFB puanları editoryal katalog değerleridir, canlı IMDb puanları değildir."
                  : "MFB scores are editorial catalogue values, not live IMDb ratings."}
              </small>
            </div>
            <span className="genre-total">
              {
                catalogue.filter(
                  (f) => categoryRoute === "All" || filmGenres(f).includes(categoryRoute),
                ).length
              }{" "}
              {tr ? "yapım" : "titles"}
            </span>
          </div>
          <div className="genre-page-controls">
            <div
              className="genre-tabs"
              role="tablist"
              aria-label={tr ? "İçerik türü" : "Content type"}
            >
              {(
                [
                  { label: tr ? "Tümü" : "All", value: "All" },
                  { label: tr ? "Filmler" : "Movies", value: "Film" },
                  { label: tr ? "Diziler" : "TV Series", value: "Dizi" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.value}
                  role="tab"
                  aria-selected={categoryTab === tab.value}
                  className={categoryTab === tab.value ? "genre-tab active" : "genre-tab"}
                  onClick={() => setCategoryTab(tab.value)}
                >
                  {tab.label}
                  <span>
                    {
                      catalogue.filter(
                        (f) =>
                          (categoryRoute === "All" || filmGenres(f).includes(categoryRoute)) &&
                          (tab.value === "All" || (f.kind || "Film") === tab.value),
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
            <div className="genre-tools">
              <label className="genre-search">
                <Search size={17} />
                <input
                  aria-label={tr ? "Bu türde ara" : "Search this genre"}
                  placeholder={tr ? "Bu türde ara..." : "Search this genre..."}
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                />
                {categorySearch && (
                  <button
                    onClick={() => setCategorySearch("")}
                    aria-label={tr ? "Aramayı temizle" : "Clear search"}
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
              <label className="genre-sort-label">
                {tr ? "Sırala" : "Sort by"}
                <select
                  value={categorySort}
                  onChange={(e) => setCategorySort(e.target.value as typeof categorySort)}
                >
                  <option value="rating">{tr ? "MFB puanı" : "IMDb rating"}</option>
                  <option value="newest">{tr ? "En yeni" : "Newest first"}</option>
                  <option value="oldest">{tr ? "En eski" : "Oldest first"}</option>
                  <option value="title">A-Z</option>
                </select>
              </label>
            </div>
          </div>
          {(() => {
            const items = catalogue
              .filter(
                (f) =>
                  (categoryRoute === "All" || filmGenres(f).includes(categoryRoute)) &&
                  (categoryTab === "All" || (f.kind || "Film") === categoryTab) &&
                  (!categorySearch ||
                    [f.title, f.desc, String(f.year)].some((v) =>
                      v.toLowerCase().includes(categorySearch.toLowerCase()),
                    )),
              )
              .sort((a, b) =>
                categorySort === "rating"
                  ? (b.rating || 0) - (a.rating || 0)
                  : categorySort === "newest"
                    ? b.year - a.year
                    : categorySort === "oldest"
                      ? a.year - b.year
                      : a.title.localeCompare(b.title),
              );
            return items.length ? (
              <div className="genre-poster-grid">{items.map(card)}</div>
            ) : (
              <div className="empty-list genre-empty">
                <Clapperboard size={25} />
                <h3>{tr ? "Bu türde yapım bulunamadı." : "No titles found in this genre."}</h3>
                <p>
                  {tr
                    ? "Başka bir sekme seç veya aramanı değiştir."
                    : "Try another tab or change your search."}
                </p>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setCategorySearch("");
                    setCategoryTab("All");
                  }}
                >
                  {tr ? "Filtreleri temizle" : "Clear filters"} <X size={15} />
                </button>
              </div>
            );
          })()}
        </main>
      )}
      <footer className="footer">
        <div className="footer-main">
          <div className="footer-brand">
            <Logo />
            <p>
              {tr ? (
                <>
                  Bizi etkileyen hikâyeler için.
                  <br />
                  Perdenin ötesini keşfet.
                </>
              ) : (
                <>
                  For the stories that move us.
                  <br />
                  Discover beyond the screen.
                </>
              )}
            </p>
          </div>
          <div className="footer-links">
            <div>
              <b>{tr ? "KEŞFET" : "EXPLORE"}</b>
              <a href="#movies">{tr ? "Filmler" : "Movies"}</a>
              <a href="#series">{tr ? "Diziler" : "TV Series"}</a>
              <a href="#genres">{tr ? "Türler" : "Genres"}</a>
              <a href="#collections">{tr ? "Koleksiyonlar" : "Collections"}</a>
            </div>
            <div>
              <b>{tr ? "SİNEMAN" : "YOUR CINEMA"}</b>
              <a href="#my-list">{tr ? "İzleme listem" : "My watchlist"}</a>
              <a href="#my-favorites">{tr ? "Favorilerim" : "My favorites"}</a>
              <button type="button" onClick={() => setFooterInfo("about")}>
                {tr ? "MFB Hakkında" : "About MFB"}
              </button>
              <button type="button" onClick={() => setFooterInfo("contact")}>
                {tr ? "İletişim" : "Contact"}
              </button>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} MFB CINEMA.{" "}
            {tr
              ? "Film ve dizi keşfi için bir adres."
              : "A destination for film and series discovery."}
          </span>
          <span>{tr ? "KEŞFET | İNCELE | HATIRLA" : "DISCOVER | EXPLORE | REMEMBER"}</span>
        </div>
      </footer>
      {accountPanel && account && (
        <div className="modal-backdrop" role="presentation" onClick={() => setAccountPanel(null)}>
          <section
            className="account-panel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-panel-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              onClick={() => setAccountPanel(null)}
              aria-label={tr ? "Hesap panelini kapat" : "Close account panel"}
            >
              <X />
            </button>
            <p className="eyebrow">{tr ? "MFB CINEMA HESABIN" : "YOUR MFB CINEMA"}</p>
            <h2 id="account-panel-title">
              {accountPanel === "profile"
                ? tr
                  ? "Profil"
                  : "Profile"
                : accountPanel === "activity"
                  ? tr
                    ? "Etkinliklerim"
                    : "My activity"
                  : tr
                    ? "Hesap ayarları"
                    : "Account settings"}
            </h2>
            {accountPanel === "profile" && (
              <div className="account-panel-content profile-editor">
                <div className="profile-editor-hero">
                  <div className="profile-avatar">
                    {profileAvatar ? (
                      <img src={profileAvatar} alt="Profile avatar" />
                    ) : (
                      (profileName.trim()[0] || "M").toUpperCase()
                    )}
                  </div>
                  <div>
                    <p className="eyebrow">{tr ? "KENDİNE GÖRE DÜZENLE" : "MAKE IT YOURS"}</p>
                    <strong>{profileName || account.name}</strong>
                    <span>
                      {tr
                        ? "Film zevkini yansıtan bir profil oluştur."
                        : "Build a profile that reflects your taste in film."}
                    </span>
                  </div>
                </div>
                <section className="profile-avatar-picker">
                  <div className="profile-section-heading">
                    <div>
                      <h3>{tr ? "Profil avatarı" : "Profile avatar"}</h3>
                      <p>
                        {tr
                          ? "Film ve dizi dünyasından bir avatar seç."
                          : "Choose a face from the world of film and television."}
                      </p>
                    </div>
                    <span>
                      {profileAvatarChoices.length || 24} {tr ? "avatar" : "avatars"}
                    </span>
                  </div>
                  <div className="profile-avatar-grid">
                    {profileAvatarChoices.length ? (
                      profileAvatarChoices.map((avatar) => (
                        <button
                          type="button"
                          key={avatar.name}
                          className={`profile-avatar-option${profileAvatar === avatar.url ? " selected" : ""}`}
                          onClick={() => setProfileAvatar(avatar.url)}
                          aria-pressed={profileAvatar === avatar.url}
                          title={avatar.name}
                        >
                          <img src={avatar.url} alt={avatar.name} loading="lazy" />
                          <span>{avatar.name}</span>
                          {profileAvatar === avatar.url && <i aria-hidden="true">✓</i>}
                        </button>
                      ))
                    ) : (
                      <p className="profile-avatar-loading">
                        {tr
                          ? "Sinematik avatarlar yükleniyor… VITE_TMDB_ACCESS_TOKEN ayarını kontrol et."
                          : "Loading cinematic avatars… Make sure VITE_TMDB_ACCESS_TOKEN is configured."}
                      </p>
                    )}
                  </div>
                </section>
                <section className="profile-personal-details">
                  <h3>{tr ? "Kişisel bilgiler" : "Personal details"}</h3>
                  <label>
                    {tr ? "Görünen ad" : "Display name"}
                    <input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      minLength={2}
                      maxLength={80}
                    />
                  </label>
                  <label>
                    {tr ? "E-posta adresi" : "Email address"}
                    <input value={account.email} readOnly />
                  </label>
                  <button
                    className="btn-primary"
                    disabled={profileBusy}
                    onClick={() => void saveProfile()}
                  >
                    {profileBusy
                      ? tr
                        ? "Kaydediliyor..."
                        : "Saving..."
                      : tr
                        ? "Değişiklikleri kaydet"
                        : "Save changes"}
                  </button>
                </section>
              </div>
            )}
            {accountPanel === "activity" && (
              <div className="account-panel-content">
                <div className="account-stat-grid">
                  <div>
                    <strong>{watchlist.length}</strong>
                    <span>{tr ? "İzleme listesindeki yapımlar" : "Watchlist titles"}</span>
                  </div>
                  <div>
                    <strong>{watchHistory.length}</strong>
                    <span>{tr ? "İzlenen yapımlar" : "Viewed titles"}</span>
                  </div>
                  <div>
                    <strong>{Object.keys(reviews).length}</strong>
                    <span>{tr ? "Puanların" : "Your ratings"}</span>
                  </div>
                </div>
                <h3>{tr ? "Son izlenenler" : "Recently viewed"}</h3>
                {watchHistory.length ? (
                  <div className="account-title-list">
                    {watchHistory
                      .slice()
                      .reverse()
                      .map((id) => {
                        const f = catalogue.find((item) => item.id === id);
                        return f ? (
                          <button
                            key={id}
                            onClick={() => {
                              setSelected(f);
                              setAccountPanel(null);
                            }}
                          >
                            <img src={f.image || `/posters/${f.id}.svg`} alt="" />
                            <span>
                              {f.title}
                              <small>
                                {f.year}
                                {"  |  "}
                                {f.kind || "Film"}
                              </small>
                            </span>
                          </button>
                        ) : null;
                      })}
                  </div>
                ) : (
                  <p className="account-empty">
                    {tr
                      ? "Açtığın film ve diziler burada görünür."
                      : "Titles you open will appear here."}
                  </p>
                )}
                <h3>{tr ? "Puanların" : "Your ratings"}</h3>
                {Object.keys(reviews).length ? (
                  <div className="account-title-list">
                    {Object.entries(reviews).map(([id, r]) => {
                      const f = catalogue.find((item) => item.id === Number(id));
                      return f ? (
                        <button
                          key={id}
                          onClick={() => {
                            setSelected(f);
                            setReviewRating(r.rating);
                            setReviewComment(r.comment);
                            setAccountPanel(null);
                          }}
                        >
                          <img src={f.image || `/posters/${f.id}.svg`} alt="" />
                          <span>
                            {f.title}
                            <small>
                              {r.rating}/5 {tr ? "yıldız" : "stars"}
                              {r.comment ? (tr ? "  |  Yorum eklendi" : "  |  Review added") : ""}
                            </small>
                          </span>
                        </button>
                      ) : null;
                    })}
                  </div>
                ) : (
                  <p className="account-empty">
                    {tr
                      ? "Henüz hiçbir yapıma puan vermedin."
                      : "You have not rated any titles yet."}
                  </p>
                )}
              </div>
            )}
            {accountPanel === "settings" && (
              <div className="account-panel-content">
                <div className="settings-row">
                  <div>
                    <strong>{tr ? "Şifre" : "Password"}</strong>
                    <p>
                      {tr
                        ? "E-posta ile güvenli bir şifre sıfırlama bağlantısı al."
                        : "Receive a secure password reset link by email."}
                    </p>
                  </div>
                  <button className="btn-secondary" onClick={() => void sendPasswordReset()}>
                    {tr ? "Şifre sıfırlama bağlantısı gönder" : "Reset password"}
                  </button>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{tr ? "Şifreyi değiştir" : "Change password"}</strong>
                    <p>
                      {tr
                        ? "En az 8 karakter kullan. E-posta ile sıfırlama bağlantısı da isteyebilirsin."
                        : "Use at least 8 characters. You can also request a reset link by email."}
                    </p>
                    <label className="settings-inline-label">
                      {tr ? "Yeni şifre" : "New password"}
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={8}
                        autoComplete="new-password"
                        placeholder={tr ? "En az 8 karakter" : "At least 8 characters"}
                      />
                    </label>
                  </div>
                  <button
                    className="btn-secondary"
                    disabled={settingsBusy || newPassword.length < 8}
                    onClick={() => void updatePassword()}
                  >
                    {settingsBusy
                      ? tr
                        ? "Kaydediliyor..."
                        : "Saving..."
                      : tr
                        ? "Şifreyi güncelle"
                        : "Update password"}
                  </button>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{tr ? "E-posta adresi" : "Email address"}</strong>
                    <p>
                      {tr ? "Mevcut:" : "Current:"} {account.email}
                    </p>
                    <small>
                      {tr
                        ? "Yeni adres etkinleşmeden önce Supabase doğrulama bağlantısı gönderir."
                        : "Supabase sends verification links before the new address takes effect."}
                    </small>
                    <label className="settings-inline-label">
                      {tr ? "Yeni e-posta" : "New email"}
                      <input
                        type="email"
                        value={settingsEmail}
                        onChange={(e) => setSettingsEmail(e.target.value)}
                        placeholder="new-address@example.com"
                        autoComplete="email"
                      />
                    </label>
                  </div>
                  <button
                    className="btn-secondary"
                    disabled={settingsBusy || !settingsEmail.trim()}
                    onClick={() => void changeEmail()}
                  >
                    {settingsBusy
                      ? tr
                        ? "Gönderiliyor..."
                        : "Sending..."
                      : tr
                        ? "E-postayı değiştir"
                        : "Change email"}
                  </button>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{tr ? "Oturum" : "Session"}</strong>
                    <p>
                      {tr
                        ? "Bu cihazda bu hesaptan çıkış yap."
                        : "Sign out of this account on this device."}
                    </p>
                  </div>
                  <button className="btn-secondary" onClick={() => void signOut()}>
                    {tr ? "Çıkış yap" : "Sign out"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      {authMode && (
        <div
          className="modal-backdrop auth-backdrop"
          role="presentation"
          onClick={() => {
            if (!authBusy) setAuthMode(null);
          }}
        >
          <section
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              disabled={authBusy}
              onClick={() => setAuthMode(null)}
              aria-label={tr ? "Hesap formunu kapat" : "Close account form"}
            >
              <X />
            </button>
            <Logo />
            <p className="eyebrow">
              {tr
                ? authMode === "register"
                  ? "KOLEKSİYONA KATIL"
                  : authMode === "forgot"
                    ? "ŞİFRE SIFIRLAMA"
                    : authMode === "reset"
                      ? "YENİ ŞİFRE BELİRLE"
                      : "TEKRAR HOŞ GELDİN"
                : authMode === "register"
                  ? "JOIN THE COLLECTION"
                  : authMode === "forgot"
                    ? "RESET PASSWORD"
                    : authMode === "reset"
                      ? "CHOOSE A NEW PASSWORD"
                      : "WELCOME BACK"}
            </p>
            <h2 id="auth-title">
              {authEmailSent
                ? tr
                  ? "E-postanı kontrol et"
                  : "Check your email"
                : authMode === "register"
                  ? tr
                    ? "Hesap oluştur"
                    : "Create your account"
                  : authMode === "forgot"
                    ? tr
                      ? "Şifremi unuttum"
                      : "Forgot your password?"
                    : authMode === "reset"
                      ? tr
                        ? "Yeni şifre belirle"
                        : "Set a new password"
                      : tr
                        ? "MFB Cinema’ya giriş yap"
                        : "Sign in to MFB"}
            </h2>
            {authEmailSent ? (
              <div className="auth-email-confirmation" role="status" aria-live="polite">
                <p>
                  {authMode === "forgot"
                    ? tr
                      ? "Şifre sıfırlama bağlantısını şu adrese gönderdik:"
                      : "We sent a password reset link to:"
                    : tr
                      ? "Doğrulama bağlantısını şu adrese gönderdik:"
                      : "We sent a verification link to:"}
                </p>
                <strong>{authEmail.trim()}</strong>
                <p>
                  {authMode === "forgot"
                    ? tr
                      ? "Gelen kutunu aç ve şifre sıfırlama bağlantısına tıkla. E-postayı göremezsen spam klasörünü kontrol et."
                      : "Open your inbox and click the password reset link. Check your spam folder if you do not see it."
                    : tr
                      ? "Gelen kutunu açıp e-postadaki bağlantıya tıkla. E-postayı göremezsen spam klasörünü kontrol et. Doğrulama tamamlanınca giriş yapabilirsin."
                      : "Open your inbox and click the link in the message. If you do not see it, check your spam folder. You can sign in after verifying your address."}
                </p>
                <button
                  type="button"
                  className="btn-primary auth-submit"
                  onClick={() => {
                    setAuthEmailSent(false);
                    setAuthMode("login");
                    setAuthError("");
                  }}
                >
                  {tr ? "Giriş ekranına dön" : "Back to sign in"}
                </button>
              </div>
            ) : authMode === "reset" ? (
              <>
                <p className="auth-intro">
                  {tr
                    ? "Hesabın için yeni bir şifre belirle."
                    : "Choose a new password for your account."}
                </p>
                <form className="auth-form" onSubmit={submitPasswordReset}>
                  <label>
                    {tr ? "Yeni şifre" : "New password"}
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={
                        tr
                          ? "8+ karakter, büyük/küçük harf ve rakam"
                          : "8+ chars, upper/lowercase and number"
                      }
                    />
                  </label>
                  <small className="auth-footnote">
                    {tr
                      ? "En az 8 karakter, bir büyük harf, bir küçük harf ve bir rakam kullan."
                      : "Use at least 8 characters, one uppercase letter, one lowercase letter, and one number."}
                  </small>
                  {authError && (
                    <p className="auth-error" role="alert">
                      {authError}
                    </p>
                  )}
                  <button className="btn-primary auth-submit" disabled={authBusy}>
                    {authBusy
                      ? tr
                        ? "Kaydediliyor..."
                        : "Saving..."
                      : tr
                        ? "Şifreyi güncelle"
                        : "Update password"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="auth-intro">
                  {authMode === "register"
                    ? tr
                      ? "Kendi sinema günlüğünü oluştur ve izleme listeni sakla."
                      : "Build your own cinema journal and keep your watchlist close."
                    : authMode === "forgot"
                      ? tr
                        ? "E-posta adresini gir; sana güvenli bir şifre sıfırlama bağlantısı gönderelim."
                        : "Enter your email address and we will send you a secure password reset link."
                      : tr
                        ? "Kaydettiğin yapımlar seni bekliyor."
                        : "Your saved titles are waiting for you."}
                </p>
                <form className="auth-form" onSubmit={submitAuth}>
                  {authMode === "register" && (
                    <label>
                      {tr ? "Ad soyad" : "Full name"}
                      <input
                        autoComplete="name"
                        required
                        minLength={2}
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        placeholder={tr ? "Adın" : "Your name"}
                      />
                    </label>
                  )}
                  <label>
                    {tr ? "E-posta adresi" : "Email address"}
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </label>
                  {authMode !== "forgot" && (
                    <label>
                      {tr ? "Şifre" : "Password"}
                      <input
                        type="password"
                        autoComplete={authMode === "register" ? "new-password" : "current-password"}
                        required
                        minLength={authMode === "register" ? 8 : 8}
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder={
                          authMode === "register"
                            ? tr
                              ? "8+ karakter, büyük/küçük harf ve rakam"
                              : "8+ chars, upper/lowercase and number"
                            : tr
                              ? "En az 8 karakter"
                              : "At least 8 characters"
                        }
                      />
                    </label>
                  )}
                  {authMode === "register" && (
                    <>
                      <small className="auth-footnote">
                        {tr
                          ? "Şifre en az 8 karakter olmalı; bir büyük harf, bir küçük harf ve bir rakam içermeli."
                          : "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number."}
                      </small>
                      <label>
                        {tr ? "Şifreyi tekrar gir" : "Confirm password"}
                        <input
                          type="password"
                          autoComplete="new-password"
                          required
                          minLength={8}
                          value={authConfirmPassword}
                          onChange={(e) => setAuthConfirmPassword(e.target.value)}
                          placeholder={tr ? "Şifreni tekrar gir" : "Enter your password again"}
                        />
                      </label>
                    </>
                  )}
                  {authError && (
                    <p className="auth-error" role="alert">
                      {authError}
                    </p>
                  )}
                  {authMode === "login" && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -6 }}>
                      <button
                        type="button"
                        className="auth-forgot-link"
                        style={{
                          border: 0,
                          background: "transparent",
                          color: "#ff315a",
                          textDecoration: "underline",
                          cursor: "pointer",
                          fontSize: 14,
                          padding: 0,
                        }}
                        onClick={() => {
                          setAuthMode("forgot");
                          setAuthError("");
                          setAuthEmailSent(false);
                          setNewPassword("");
                        }}
                      >
                        {tr ? "Şifremi unuttum?" : "Forgot password?"}
                      </button>
                    </div>
                  )}
                  <button
                    className="btn-primary auth-submit"
                    disabled={
                      authBusy ||
                      (authMode === "register" &&
                        (!(
                          authPassword.length >= 8 &&
                          /[A-Z]/.test(authPassword) &&
                          /[a-z]/.test(authPassword) &&
                          /[0-9]/.test(authPassword)
                        ) ||
                          authPassword !== authConfirmPassword))
                    }
                  >
                    {authBusy ? (
                      tr ? (
                        "Lütfen bekle..."
                      ) : (
                        "Please wait..."
                      )
                    ) : authMode === "register" ? (
                      <>
                        <UserPlus size={16} /> {tr ? "Hesap oluştur" : "Create account"}
                      </>
                    ) : authMode === "forgot" ? (
                      tr ? (
                        "Sıfırlama bağlantısı gönder"
                      ) : (
                        "Send reset link"
                      )
                    ) : (
                      <>
                        <LogIn size={16} /> {tr ? "Giriş yap" : "Sign in"}
                      </>
                    )}
                  </button>
                </form>
                <p className="auth-switch">
                  {authMode === "register"
                    ? tr
                      ? "Zaten hesabın var mı?"
                      : "Already have an account?"
                    : authMode === "forgot"
                      ? tr
                        ? "Giriş ekranına dön"
                        : "Back to sign in"
                      : tr
                        ? "MFB Cinema’ya yeni misin?"
                        : "New to MFB Cinema?"}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError("");
                      setAuthEmailSent(false);
                      setAuthMode(authMode === "register" ? "login" : "register");
                    }}
                  >
                    {authMode === "register"
                      ? tr
                        ? "Giriş yap"
                        : "Sign in"
                      : authMode === "forgot"
                        ? tr
                          ? "Giriş yap"
                          : "Sign in"
                        : tr
                          ? "Hesap oluştur"
                          : "Create account"}
                  </button>
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {footerInfo && (
        <div className="modal-backdrop" role="presentation" onClick={() => setFooterInfo(null)}>
          <section
            className="account-panel-modal footer-info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="footer-info-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              onClick={() => setFooterInfo(null)}
              aria-label={tr ? "Kapat" : "Close"}
            >
              <X />
            </button>
            <p className="eyebrow">MFB CINEMA</p>
            <h2 id="footer-info-title">
              {footerInfo === "privacy"
                ? tr
                  ? "Gizlilik politikası"
                  : "Privacy policy"
                : footerInfo === "terms"
                  ? tr
                    ? "Kullanım koşulları"
                    : "Terms of use"
                  : footerInfo === "cookies"
                    ? tr
                      ? "Çerez tercihleri"
                      : "Cookie preferences"
                    : footerInfo === "contact"
                      ? tr
                        ? "İletişim"
                        : "Contact"
                      : tr
                        ? "MFB Hakkında"
                        : "About MFB"}
            </h2>
            <div className="account-panel-content">
              {footerInfo === "privacy" ? (
                <div className="footer-legal-copy">
                  {tr ? (
                    <>
                      <p>
                        MFB Cinema, tercihlerinize bağlı olarak dil seçimi, izleme listesi,
                        favoriler, izleme geçmişi ve değerlendirmeler gibi bilgileri bu tarayıcıda
                        saklayabilir.
                      </p>
                      <p>
                        Hesap özellikleri etkinleştirildiğinde oturum açma ve hesap bilgileri
                        Supabase üzerinden işlenebilir. Film bilgileri ve görseller için TMDb; IMDb
                        puanları için OMDb; fragmanlar için YouTube; yayın seçenekleri için TMDb
                        üzerinden JustWatch gibi üçüncü taraf hizmetlere istek gönderilebilir. Bu
                        hizmetlerin kendi gizlilik koşulları da geçerlidir.
                      </p>
                      <p>
                        Bu açıklama mevcut uygulamanın genel işleyişini özetler; resmi hukuki
                        danışmanlık değildir. Yayına almadan önce kullanılan veriler, saklama
                        süreleri, veri sorumlusu iletişim bilgileri ve kullanıcı hakları gerçek
                        uygulamaya göre tamamlanmalıdır.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        Depending on your choices, MFB Cinema may store items such as language
                        preference, watchlist, favorites, viewing history and ratings in this
                        browser.
                      </p>
                      <p>
                        When account features are enabled, authentication and account information
                        may be processed through Supabase. Requests may be sent to third-party
                        services such as TMDb for film data and images, OMDb for IMDb ratings,
                        YouTube for trailers, and JustWatch via TMDb for streaming availability.
                        Those services' own privacy terms may also apply.
                      </p>
                      <p>
                        This notice summarizes the application's general behavior and is not legal
                        advice. Before launch, complete it to reflect actual data use, retention
                        periods, the data controller's contact details and applicable user rights.
                      </p>
                    </>
                  )}
                </div>
              ) : footerInfo === "terms" ? (
                <div className="footer-legal-copy">
                  {tr ? (
                    <>
                      <p>
                        MFB Cinema, film ve dizileri keşfetmek, katalog bilgilerini incelemek ve
                        kişisel listeler oluşturmak için sunulan bir keşif arayüzüdür. Bu hizmet
                        doğrudan film veya dizi yayını sağlamaz.
                      </p>
                      <p>
                        Yapım bilgileri, görseller, puanlar ve yayın seçenekleri üçüncü taraf
                        kaynaklardan gelebilir; doğrulukları, güncellikleri ve bölgesel
                        kullanılabilirlikleri garanti edilmez. İzleme veya satın alma işlemleri
                        ilgili sağlayıcının kendi sitesinde gerçekleşir ve o sağlayıcının
                        koşullarına tabidir.
                      </p>
                      <p>
                        Hizmeti kötüye kullanmamalı, güvenliği aşmaya çalışmamalı veya başkalarının
                        haklarını ihlal etmemelisiniz. Bu metin taslaktır; yayın öncesinde
                        uygulamanın gerçek işleyişine ve geçerli mevzuata göre gözden
                        geçirilmelidir.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        MFB Cinema is a discovery interface for exploring films and series,
                        reviewing catalogue information and creating personal lists. It does not
                        directly stream films or series.
                      </p>
                      <p>
                        Title information, images, ratings and streaming availability may come from
                        third-party sources; their accuracy, freshness and regional availability are
                        not guaranteed. Viewing or purchasing takes place on the relevant provider's
                        service and is subject to that provider's terms.
                      </p>
                      <p>
                        You must not misuse the service, attempt to bypass its security or violate
                        others' rights. This is a draft and should be reviewed against the actual
                        service and applicable law before launch.
                      </p>
                    </>
                  )}
                </div>
              ) : footerInfo === "cookies" ? (
                <div className="footer-legal-copy">
                  {tr ? (
                    <>
                      <p>
                        MFB Cinema, dil seçimi ve izleme listesi gibi temel özellikleri hatırlamak
                        için tarayıcının yerel depolama alanını kullanabilir. Bu, tek başına reklam
                        veya analitik çerezi kullanıldığı anlamına gelmez.
                      </p>
                      <p>
                        Bu sürümde ayrı bir reklam/analitik çerez tercih merkezi bulunmuyor.
                        Tarayıcı verilerini temizlemek, bu cihazda saklanan tercihleri ve yerel
                        listeleri silebilir.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        MFB Cinema may use browser local storage to remember essential features such
                        as language selection and saved titles. This does not by itself mean
                        advertising or analytics cookies are being used.
                      </p>
                      <p>
                        This version does not include a separate advertising/analytics cookie
                        preference centre. Clearing browser data may remove preferences and lists
                        stored on this device.
                      </p>
                    </>
                  )}
                </div>
              ) : footerInfo === "contact" ? (
                <div className="footer-legal-copy">
                  <p>
                    {tr
                      ? "Soruların, önerilerin veya geri bildirimlerin için e-posta gönderebilirsin."
                      : "For questions, suggestions or feedback, you can email us."}
                  </p>
                  <a
                    className="btn-primary footer-contact-link"
                    href="mailto:mehmetfarukbagdas@gmail.com?subject=MFB%20Cinema%20-%20İletişim"
                    onClick={() => {}}
                  >
                    <Mail size={16} />
                    {"mehmetfarukbagdas@gmail.com"}
                  </a>
                  <p className="detail-muted">
                    {tr
                      ? "Bağlantı, cihazındaki varsayılan e-posta uygulamasını açar."
                      : "This link opens the default email app on your device."}
                  </p>
                </div>
              ) : (
                <p>
                  {tr
                    ? "MFB Cinema, film ve dizileri keşfetmek, kişisel izleme listeleri oluşturmak ve yeni hikâyeler bulmak için tasarlanmış bir katalog deneyimidir."
                    : "MFB Cinema is a catalogue experience designed to discover films and series, build personal watchlists and find new stories."}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <Check size={16} />
          {toast}
        </div>
      )}
      {selected && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <section
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.title} details`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              onClick={() => setSelected(null)}
              aria-label="Close details"
            >
              <X />
            </button>
            <img
              className="detail-backdrop"
              src={selected.image}
              alt=""
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                if (!img.dataset.seedFallback) {
                  const seed = films.find(
                    (item) =>
                      item.title.trim().toLocaleLowerCase() ===
                        selected.title.trim().toLocaleLowerCase() && item.year === selected.year,
                  );
                  if (seed?.image && img.src !== seed.image) {
                    img.dataset.seedFallback = "true";
                    img.src = seed.image;
                    return;
                  }
                }
                if (img.dataset.fallback) {
                  img.style.opacity = "0";
                  return;
                }
                img.dataset.fallback = "true";
                img.src = `/posters/${selected.id}.svg`;
              }}
            />
            <div className="detail-content">
              <p className="eyebrow">
                {tr ? "MFB CINEMA / YAPIM DETAYLARI" : "MFB CINEMA / TITLE DETAILS"}
              </p>
              <h2>{selected.title}</h2>
              <div className="meta">
                <span>{selected.year}</span>
                <i />
                <span>{filmGenres(selected).join("  |  ")}</span>
                <i />
                <span>{selected.kind || "Film"}</span>
                <i />
                <span>{selected.runtime}</span>
                {(imdbRatings[selected.title] || selected.rating) && (
                  <>
                    <i />
                    <span className="detail-rating">
                      {imdbRatings[selected.title]
                        ? `IMDb ★ ${imdbRatings[selected.title]}`
                        : tr
                          ? "IMDb puanı mevcut değil"
                          : "IMDb rating unavailable"}
                    </span>
                  </>
                )}
              </div>
              <p>
                {localizedOverview ||
                  (tr ? "Açıklama şu anda Türkçe olarak mevcut değil." : selected.desc)}
              </p>
              <div className="hero-actions">
                <button className="btn-primary" onClick={() => toggle(selected.id)}>
                  {watchlist.includes(selected.id) ? <Check size={16} /> : <Plus size={16} />}{" "}
                  {watchlist.includes(selected.id)
                    ? tr
                      ? "Listemde"
                      : "In My List"
                    : tr
                      ? "Listeme ekle"
                      : "Add to My List"}
                </button>
                <button className="btn-secondary" onClick={() => void toggleFavorite(selected.id)}>
                  {favorites.includes(selected.id) ? (
                    <Heart size={16} fill="currentColor" />
                  ) : (
                    <Heart size={16} />
                  )}{" "}
                  {favorites.includes(selected.id)
                    ? tr
                      ? "Favorilerde"
                      : "Favorited"
                    : tr
                      ? "Favorilere ekle"
                      : "Add to favorites"}
                </button>
                <button className="btn-secondary" onClick={() => setShowTrailer((v) => !v)}>
                  <Play size={15} />
                  {showTrailer
                    ? tr
                      ? "Fragmanı gizle"
                      : "Hide trailer"
                    : tr
                      ? "Fragmanı izle"
                      : "Watch trailer"}
                </button>
                <button className="btn-secondary" onClick={() => setSelected(null)}>
                  {tr ? "Kapat" : "Close"}
                </button>
              </div>
              <section className="detail-subsection watch-providers-section">
                <p className="eyebrow">{tr ? "NEREDEN İZLENİR" : "WHERE TO WATCH"}</p>
                <label
                  className="provider-region-label"
                  style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}
                >
                  {tr ? "Yayın bölgesi" : "Availability region"}
                  <select
                    value={providerRegion}
                    onChange={(e) => {
                      setProviderRegion(e.target.value);
                      setWatchProviders(null);
                    }}
                    style={{
                      background: "var(--surface, #171717)",
                      color: "inherit",
                      border: "1px solid rgba(255,255,255,.18)",
                      padding: "6px 8px",
                      borderRadius: 6,
                    }}
                  >
                    <option value="US">
                      {tr ? "Amerika Birleşik Devletleri" : "United States"}
                    </option>
                    <option value="GB">{tr ? "Birleşik Krallık" : "United Kingdom"}</option>
                    <option value="TR">Türkiye</option>
                    <option value="CA">Kanada / Canada</option>
                    <option value="AU">Avustralya / Australia</option>
                    <option value="DE">Almanya / Germany</option>
                    <option value="FR">Fransa / France</option>
                    <option value="IN">Hindistan / India</option>
                    <option value="JP">Japonya / Japan</option>
                    <option value="BR">Brezilya / Brazil</option>
                  </select>
                </label>
                {providersLoading ? (
                  <p className="detail-muted">
                    {tr
                      ? "Güncel yayın seçenekleri kontrol ediliyor…"
                      : "Checking current streaming availability…"}
                  </p>
                ) : watchProviders ? (
                  <>
                    <div
                      className="provider-groups"
                      style={{ display: "grid", gap: 14, marginTop: 12 }}
                    >
                      {(
                        [
                          { key: "flatrate", label: tr ? "Abonelik" : "Subscription" },
                          { key: "free", label: tr ? "Ücretsiz" : "Free" },
                          { key: "ads", label: tr ? "Reklamlı ücretsiz" : "Free with ads" },
                          { key: "rent", label: tr ? "Kirala" : "Rent" },
                          { key: "buy", label: tr ? "Satın al" : "Buy" },
                        ] as const
                      ).map((group) => {
                        const entries = Array.isArray(watchProviders[group.key])
                          ? watchProviders[group.key]
                          : [];
                        if (!entries.length) return null;
                        return (
                          <div className="provider-group" key={group.key}>
                            <strong>{group.label}</strong>
                            <div
                              className="provider-list"
                              style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}
                            >
                              {entries.map((provider: any) => (
                                <a
                                  className="provider-item"
                                  key={`${group.key}-${provider.provider_id}`}
                                  href={
                                    watchProviders.link ||
                                    `https://www.justwatch.com/${providerRegion.toLowerCase()}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  title={
                                    tr
                                      ? `${provider.provider_name} yayın seçeneklerini aç`
                                      : `Open ${provider.provider_name} availability`
                                  }
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                    border: "1px solid rgba(255,255,255,.12)",
                                    padding: "7px 10px",
                                    borderRadius: 8,
                                    fontSize: 13,
                                  }}
                                >
                                  {provider.logo_path && (
                                    <img
                                      src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                                      alt=""
                                      loading="lazy"
                                      style={{
                                        width: 28,
                                        height: 28,
                                        objectFit: "cover",
                                        borderRadius: 6,
                                      }}
                                    />
                                  )}
                                  <span>{provider.provider_name}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <small
                      className="provider-attribution"
                      style={{ display: "block", marginTop: 8, opacity: 0.65 }}
                    >
                      {tr
                        ? "Yayın verileri TMDb üzerinden JustWatch tarafından sağlanır. Kullanılabilirlik değişebilir."
                        : "Availability data provided by JustWatch via TMDB. Availability may change."}
                    </small>
                  </>
                ) : (
                  <p className="detail-muted">
                    {tmdbToken
                      ? tr
                        ? "Seçilen bölgede yayın bilgisi bulunamadı."
                        : "No streaming availability found for the selected region."
                      : tr
                        ? "Yayın platformlarını yüklemek için frontend/.env.local dosyasına VITE_TMDB_ACCESS_TOKEN ekleyin."
                        : "Add VITE_TMDB_ACCESS_TOKEN to frontend/.env.local to load streaming platforms."}
                  </p>
                )}
              </section>
              {showTrailer && (
                <div className="trailer-frame" ref={trailerFrameRef}>
                  {trailerLoading ? (
                    <div className="trailer-status">Searching for a trailer via TMDB...</div>
                  ) : resolvedTrailer ? (
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${resolvedTrailer}?rel=0&playsinline=1&autoplay=1`}
                      title={`${selected.title} trailer`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  ) : (
                    <div className="trailer-status" role="status">
                      <span>{trailerError || "No embedded trailer was found for this title."}</span>
                      <a
                        className="trailer-search-link"
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${selected.title} ${selected.year} official trailer`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Search trailers on YouTube
                      </a>
                    </div>
                  )}
                  <p>
                    Trailers play through YouTube. Some video owners may disable embedded playback.
                  </p>
                </div>
              )}
              <section className="detail-subsection">
                <p className="eyebrow">{tr ? "OYUNCULAR VE EKİP" : "CAST &amp; CREATIVES"}</p>
                {(remoteCast.length ? remoteCast : castBy[selected.title])?.length ? (
                  <div className="cast-list">
                    {(remoteCast.length ? remoteCast : castBy[selected.title]).map((actor) => (
                      <button
                        type="button"
                        key={actor.name}
                        className="cast-chip"
                        onClick={() => setSelectedActor(actor)}
                        aria-label={
                          tr
                            ? `${actor.name} oyuncu profilini aç`
                            : `View profile for ${actor.name}`
                        }
                      >
                        {actor.photo ? (
                          <img
                            className="cast-chip-photo"
                            src={actor.photo}
                            alt=""
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="cast-chip-placeholder">
                            {actor.name
                              .split(/\s+/)
                              .map((part) => part[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                        )}
                        <strong>{actor.name}</strong>
                        <span>{actor.role}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="detail-muted">
                    {metadataLoading
                      ? "Loading cast information…"
                      : "Cast information is not available. Configure VITE_TMDB_ACCESS_TOKEN to load cast details automatically."}
                  </p>
                )}
                {selectedActor && (
                  <div className="actor-bio actor-profile">
                    <button
                      className="actor-bio-close"
                      onClick={() => setSelectedActor(null)}
                      aria-label={tr ? "Oyuncu profilini kapat" : "Close actor profile"}
                    >
                      <X size={14} />
                    </button>
                    <div className="actor-profile-heading">
                      {selectedActor.photo ? (
                        <img src={selectedActor.photo} alt={selectedActor.name} />
                      ) : (
                        <div className="actor-profile-placeholder">
                          {selectedActor.name
                            .split(/\s+/)
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                      )}
                      <div>
                        <strong>{selectedActor.name}</strong>
                        <span>{selectedActor.role}</span>
                        <small>
                          {actorProfileLoading
                            ? tr
                              ? "Profil yükleniyor…"
                              : "Loading profile…"
                            : tr
                              ? "Oyuncu profili"
                              : "Actor profile"}
                        </small>
                      </div>
                    </div>
                    <div className="actor-filmography">
                      <h4>{tr ? "Bilinen yapımlar" : "Known for"}</h4>
                      {selectedActor.filmography?.length ? (
                        <div className="actor-filmography-grid">
                          {selectedActor.filmography.map((item) => (
                            <button
                              type="button"
                              key={`${item.kind}-${item.id}`}
                              onClick={() => {
                                const found = catalogue.find(
                                  (f) => f.title.toLowerCase() === item.title.toLowerCase(),
                                );
                                if (found) setSelected(found);
                                else
                                  setToast(
                                    tr
                                      ? "Bu yapım katalogda bulunmuyor."
                                      : "This title is not in the catalogue.",
                                  );
                              }}
                            >
                              <img src={item.image} alt="" loading="lazy" />
                              <span>{item.title}</span>
                              <small>
                                {item.year || "—"}
                                {item.role ? ` · ${item.role}` : ""}
                              </small>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p>
                          {actorProfileLoading
                            ? tr
                              ? "Yapımlar yükleniyor…"
                              : "Loading filmography…"
                            : tr
                              ? "Filmografi şu anda mevcut değil."
                              : "Filmography is not available right now."}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </section>
              <section className="detail-subsection review-panel">
                <p className="eyebrow">{tr ? "DEĞERLENDİRMEN" : "YOUR REVIEW"}</p>
                <div
                  className="review-stars"
                  role="group"
                  aria-label="Rate this title from 1 to 5 stars"
                >
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={star <= reviewRating ? "star-active" : ""}
                      aria-label={`${star} star${star === 1 ? "" : "s"}`}
                      aria-pressed={reviewRating === star}
                      onClick={() => setReviewRating(star)}
                    >
                      *
                    </button>
                  ))}
                </div>
                <label className="review-label">
                  {tr ? "Yorum (isteğe bağlı)" : "Review (optional)"}
                  <textarea
                    rows={3}
                    maxLength={600}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder={
                      tr
                        ? "Film bittikten sonra aklında ne kaldı?"
                        : "What stayed with you after the credits?"
                    }
                  />
                </label>
                <div className="review-actions">
                  <small>
                    {reviewComment.length}/600 characters
                    {"  |  "}
                    {account?.user && supabaseConfigured
                      ? "Cloud sync enabled"
                      : "Saved locally on this device"}
                  </small>
                  <button className="btn-primary" onClick={saveReview} disabled={reviewRating < 1}>
                    {tr ? "Puanı kaydet" : "Save rating"}
                  </button>
                </div>
                {reviews[selected.id] && (
                  <p className="saved-review" role="status">
                    Your rating: <strong>{reviews[selected.id].rating}/5 *</strong>
                    {reviews[selected.id].comment && <span>"{reviews[selected.id].comment}"</span>}
                  </p>
                )}
                {communityReviews.length > 0 && (
                  <div className="community-reviews">
                    <p className="review-community-title">
                      COMMUNITY REVIEWS <span>{communityReviews.length}</span>
                    </p>
                    {communityReviews.map((row) => (
                      <article className="community-review" key={row.id}>
                        <div>
                          <strong>{row.display_name || "MFB member"}</strong>
                          <span>
                            {"*".repeat(Math.max(0, Math.min(5, Number(row.rating))))}{" "}
                            <small>{new Date(row.created_at).toLocaleDateString()}</small>
                          </span>
                        </div>
                        {row.comment && <p>{row.comment}</p>}
                      </article>
                    ))}
                  </div>
                )}
              </section>
              {similars.length > 0 && (
                <section className="detail-subsection">
                  <p className="eyebrow">
                    {tr ? "BUNU İZLEDİĞİN İÇİN" : "BECAUSE YOU VIEWED THIS"}
                  </p>
                  <div className="similar-grid">
                    {similars.map((f) => (
                      <button
                        type="button"
                        key={f.id}
                        onClick={() => setSelected(catalogue.find((item) => item.id === f.id) || f)}
                        aria-label={
                          tr ? `${f.title} ayrıntılarını görüntüle` : `View ${f.title} details`
                        }
                      >
                        <img
                          src={f.image}
                          loading="lazy"
                          alt=""
                          onError={(e) => {
                            const img = e.currentTarget as HTMLImageElement;
                            if (img.dataset.fallback) {
                              img.style.opacity = "0";
                              return;
                            }
                            img.dataset.fallback = "true";
                            img.src = `/posters/${f.id}.svg`;
                          }}
                        />
                        <span>
                          <strong>{f.title}</strong>
                          <small>
                            {f.year}
                            {"  |  "}
                            {imdbRatings[f.title]
                              ? `IMDb ★ ${imdbRatings[f.title]}`
                              : tr
                                ? "IMDb puanı mevcut değil"
                                : "IMDb rating unavailable"}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <small className="demo-note">
                {tr
                  ? "Editoryal puanlar katalog referans değerleridir. Kullanıcı puanları ve yorumları bu tarayıcıda saklanır; cihazlar arasında eşitlemek için güvenli bir arka uç yapılandırılmalıdır."
                  : "Editorial scores are catalogue reference values. User ratings and reviews are stored in this browser; configure a secured backend table to sync them across devices."}
              </small>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
