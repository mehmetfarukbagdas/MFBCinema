namespace MfbCinema.Api.Models;

public sealed record ProfileUpdateInput(string? Name);
public sealed record WatchProgressInput(int PositionSeconds, int? DurationSeconds);
public sealed record RatingInput(int Rating, string? Comment);
public sealed record ReviewModerationInput(bool Hidden);
public sealed record SeasonInput(int SeasonNumber, string? Title, string? PosterUrl, DateTime? ReleaseDate);
public sealed record EpisodeInput(int EpisodeNumber, string Title, string? Synopsis, int? RuntimeMinutes, string? StillUrl, DateTime? AirDate);
public sealed record WatchPartyCreateInput(int MovieId);
public sealed record WatchPartyJoinInput(string RoomCode);
public sealed record WatchPartyCommandInput(string Command, double? PositionSeconds);
public sealed record CatalogMovieInput(string Title, string Genre, int Year, string? Synopsis, string? PosterUrl,
    string? BackdropUrl, string? Kind, string? Runtime, double Rating, string? Director, string? CastNames,
    string? Language, string? Country, bool IsFeatured, bool IsPublished, int Popularity, DateTime? ReleaseDate);
public sealed record CastMemberInput(string Name, string? ProfileUrl, string? Biography);
public sealed record CastCreditInput(int CastMemberId, string? CharacterName, int CreditOrder);
public sealed record SeasonUpdateInput(int SeasonNumber, string? Title, string? PosterUrl, DateTime? ReleaseDate);
