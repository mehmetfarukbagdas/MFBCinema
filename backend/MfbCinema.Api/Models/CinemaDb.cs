using Microsoft.EntityFrameworkCore;

namespace MfbCinema.Api.Models;

public sealed class CinemaDb(DbContextOptions<CinemaDb> options) : DbContext(options)
{
    public DbSet<Movie> Movies => Set<Movie>();
    public DbSet<UserAccount> Users => Set<UserAccount>();
    public DbSet<WatchlistEntry> WatchlistEntries => Set<WatchlistEntry>();
    public DbSet<FavoriteEntry> Favorites => Set<FavoriteEntry>();
    public DbSet<WatchHistoryEntry> WatchHistory => Set<WatchHistoryEntry>();
    public DbSet<MovieRating> Ratings => Set<MovieRating>();
    public DbSet<MovieReview> Reviews => Set<MovieReview>();
    public DbSet<Season> Seasons => Set<Season>();
    public DbSet<Episode> Episodes => Set<Episode>();
    public DbSet<UserNotification> Notifications => Set<UserNotification>();
    public DbSet<WatchPartyRoom> WatchPartyRooms => Set<WatchPartyRoom>();
    public DbSet<WatchPartyParticipant> WatchPartyParticipants => Set<WatchPartyParticipant>();
    public DbSet<CastMember> CastMembers => Set<CastMember>();
    public DbSet<ContentCastCredit> ContentCastCredits => Set<ContentCastCredit>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var movie = modelBuilder.Entity<Movie>();
        movie.ToTable("movies", "public");
        movie.HasKey(m => m.Id);
        movie.Property(m => m.Id).HasColumnName("id").ValueGeneratedOnAdd();
        movie.Property(m => m.Title).HasColumnName("title");
        movie.Property(m => m.Genre).HasColumnName("genre");
        movie.Property(m => m.Year).HasColumnName("year");
        movie.Property(m => m.Synopsis).HasColumnName("synopsis");
        movie.Property(m => m.PosterUrl).HasColumnName("image_url");
        movie.Property(m => m.BackdropUrl).HasColumnName("backdrop_url");
        movie.Property(m => m.Kind).HasColumnName("kind");
        movie.Property(m => m.Runtime).HasColumnName("runtime");
        movie.Property(m => m.Rating).HasColumnName("rating");
        movie.Property(m => m.Director).HasColumnName("director");
        movie.Property(m => m.CastNames).HasColumnName("cast_names");
        movie.Property(m => m.Language).HasColumnName("language");
        movie.Property(m => m.Country).HasColumnName("country");
        movie.Property(m => m.IsFeatured).HasColumnName("is_featured");
        movie.Property(m => m.IsPublished).HasColumnName("is_published");
        movie.Property(m => m.Popularity).HasColumnName("popularity");
        movie.Property(m => m.ReleaseDate).HasColumnName("release_date");

        modelBuilder.Entity<UserAccount>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<UserAccount>().Property(u => u.Email).HasMaxLength(320);
        modelBuilder.Entity<UserAccount>().Property(u => u.Name).HasMaxLength(100);
        modelBuilder.Entity<WatchlistEntry>().HasIndex(w => new { w.UserAccountId, w.MovieId }).IsUnique();
        modelBuilder.Entity<FavoriteEntry>().HasIndex(w => new { w.UserAccountId, w.MovieId }).IsUnique();
        modelBuilder.Entity<WatchHistoryEntry>().HasIndex(w => new { w.UserAccountId, w.MovieId }).IsUnique();
        modelBuilder.Entity<MovieRating>().HasIndex(w => new { w.UserAccountId, w.MovieId }).IsUnique();
        modelBuilder.Entity<MovieReview>().HasIndex(w => new { w.UserAccountId, w.MovieId }).IsUnique();
        modelBuilder.Entity<Season>().HasIndex(s => new { s.SeriesId, s.SeasonNumber }).IsUnique();
        modelBuilder.Entity<Episode>().HasIndex(e => new { e.SeasonId, e.EpisodeNumber }).IsUnique();
        modelBuilder.Entity<WatchPartyRoom>().HasIndex(r => r.RoomCode).IsUnique();
        modelBuilder.Entity<WatchPartyParticipant>().HasIndex(p => new { p.RoomId, p.UserAccountId }).IsUnique();
        modelBuilder.Entity<ContentCastCredit>().HasIndex(c => new { c.MovieId, c.CastMemberId }).IsUnique();
        modelBuilder.Entity<CastMember>().Property(c => c.Name).HasMaxLength(180);
        modelBuilder.Entity<CastMember>().Property(c => c.ProfileUrl).HasMaxLength(2048);
        modelBuilder.Entity<ContentCastCredit>().Property(c => c.CharacterName).HasMaxLength(180);
        modelBuilder.Entity<UserNotification>().HasIndex(n => new { n.UserAccountId, n.CreatedAtUtc });
        modelBuilder.Entity<MovieReview>().Property(r => r.Comment).HasMaxLength(600);
        modelBuilder.Entity<MovieReview>().Property(r => r.DisplayName).HasMaxLength(100);
        modelBuilder.Entity<Season>().Property(s => s.Title).HasMaxLength(180);
        modelBuilder.Entity<Episode>().Property(e => e.Title).HasMaxLength(180);
        modelBuilder.Entity<WatchPartyRoom>().Property(r => r.RoomCode).HasMaxLength(12);
        modelBuilder.Entity<WatchlistEntry>().HasOne<UserAccount>().WithMany().HasForeignKey(w => w.UserAccountId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<WatchlistEntry>().HasOne<Movie>().WithMany().HasForeignKey(w => w.MovieId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<FavoriteEntry>().HasOne<UserAccount>().WithMany().HasForeignKey(w => w.UserAccountId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<FavoriteEntry>().HasOne<Movie>().WithMany().HasForeignKey(w => w.MovieId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<WatchHistoryEntry>().HasOne<UserAccount>().WithMany().HasForeignKey(w => w.UserAccountId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<WatchHistoryEntry>().HasOne<Movie>().WithMany().HasForeignKey(w => w.MovieId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<MovieRating>().HasOne<UserAccount>().WithMany().HasForeignKey(w => w.UserAccountId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<MovieRating>().HasOne<Movie>().WithMany().HasForeignKey(w => w.MovieId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<MovieReview>().HasOne<UserAccount>().WithMany().HasForeignKey(w => w.UserAccountId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<MovieReview>().HasOne<Movie>().WithMany().HasForeignKey(w => w.MovieId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<Season>().HasOne<Movie>().WithMany().HasForeignKey(s => s.SeriesId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<Episode>().HasOne<Season>().WithMany().HasForeignKey(e => e.SeasonId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<UserNotification>().HasOne<UserAccount>().WithMany().HasForeignKey(n => n.UserAccountId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<WatchPartyRoom>().HasOne<UserAccount>().WithMany().HasForeignKey(r => r.HostUserAccountId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<WatchPartyRoom>().HasOne<Movie>().WithMany().HasForeignKey(r => r.MovieId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<WatchPartyParticipant>().HasOne<WatchPartyRoom>().WithMany().HasForeignKey(p => p.RoomId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<WatchPartyParticipant>().HasOne<UserAccount>().WithMany().HasForeignKey(p => p.UserAccountId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<ContentCastCredit>().HasOne<Movie>().WithMany().HasForeignKey(c => c.MovieId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<ContentCastCredit>().HasOne<CastMember>().WithMany().HasForeignKey(c => c.CastMemberId).OnDelete(DeleteBehavior.Cascade);
    }
}
