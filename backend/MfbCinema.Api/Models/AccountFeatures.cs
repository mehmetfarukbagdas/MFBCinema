namespace MfbCinema.Api.Models;

public sealed class FavoriteEntry
{
    public int Id { get; set; }
    public int UserAccountId { get; set; }
    public int MovieId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class WatchHistoryEntry
{
    public int Id { get; set; }
    public int UserAccountId { get; set; }
    public int MovieId { get; set; }
    public int PositionSeconds { get; set; }
    public int? DurationSeconds { get; set; }
    public DateTime LastWatchedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class MovieRating
{
    public int Id { get; set; }
    public int UserAccountId { get; set; }
    public int MovieId { get; set; }
    public int Rating { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class MovieReview
{
    public int Id { get; set; }
    public int UserAccountId { get; set; }
    public int MovieId { get; set; }
    public string DisplayName { get; set; } = "Member";
    public int Rating { get; set; }
    public string Comment { get; set; } = string.Empty;
    public bool IsHidden { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class Season
{
    public int Id { get; set; }
    public int SeriesId { get; set; }
    public int SeasonNumber { get; set; }
    public string Title { get; set; } = string.Empty;
    public string PosterUrl { get; set; } = string.Empty;
    public DateTime? ReleaseDate { get; set; }
}

public sealed class Episode
{
    public int Id { get; set; }
    public int SeasonId { get; set; }
    public int EpisodeNumber { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Synopsis { get; set; } = string.Empty;
    public int? RuntimeMinutes { get; set; }
    public string StillUrl { get; set; } = string.Empty;
    public DateTime? AirDate { get; set; }
}

public sealed class UserNotification
{
    public int Id { get; set; }
    public int UserAccountId { get; set; }
    public string Type { get; set; } = "system";
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? PayloadJson { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAtUtc { get; set; }
}

public sealed class WatchPartyRoom
{
    public int Id { get; set; }
    public string RoomCode { get; set; } = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
    public int HostUserAccountId { get; set; }
    public int MovieId { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsPlaying { get; set; }
    public double PositionSeconds { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class WatchPartyParticipant
{
    public int Id { get; set; }
    public int RoomId { get; set; }
    public int UserAccountId { get; set; }
    public DateTime JoinedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class CastMember
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ProfileUrl { get; set; } = string.Empty;
    public string Biography { get; set; } = string.Empty;
}

public sealed class ContentCastCredit
{
    public int Id { get; set; }
    public int MovieId { get; set; }
    public int CastMemberId { get; set; }
    public string CharacterName { get; set; } = string.Empty;
    public int CreditOrder { get; set; }
}
