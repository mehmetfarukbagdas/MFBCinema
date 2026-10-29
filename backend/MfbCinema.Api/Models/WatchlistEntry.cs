namespace MfbCinema.Api.Models;

public sealed class WatchlistEntry
{
    public int Id { get; set; }
    public int UserAccountId { get; set; }
    public int MovieId { get; set; }
    public DateTime AddedAtUtc { get; set; } = DateTime.UtcNow;
}
