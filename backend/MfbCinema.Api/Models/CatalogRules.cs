namespace MfbCinema.Api.Models;

public static class CatalogRules
{
    public static bool IsValidTitle(string? title) => !string.IsNullOrWhiteSpace(title) && title.Trim().Length <= 180;
    public static bool IsValidGenre(string? genre) => !string.IsNullOrWhiteSpace(genre) && genre.Trim().Length <= 80;
    public static bool IsValidEditorialRating(double rating) => double.IsFinite(rating) && rating is >= 0 and <= 10;
    public static bool IsValidUserRating(int rating) => rating is >= 1 and <= 5;
    public static bool IsValidPlaybackProgress(int positionSeconds, int? durationSeconds) =>
        positionSeconds is >= 0 and <= 604800 && (!durationSeconds.HasValue || durationSeconds.Value is >= 1 and <= 604800);
    public static int NormalizePage(int page) => Math.Max(1, page);
    public static int NormalizePageSize(int pageSize) => Math.Clamp(pageSize, 1, 50);
    public static string PosterFallback(int movieId) => $"/posters/{movieId}.svg";
    public static string BackdropFallback(int movieId) => $"/posters/backdrop-{movieId}.svg";
}
