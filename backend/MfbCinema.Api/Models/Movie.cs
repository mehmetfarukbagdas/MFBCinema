namespace MfbCinema.Api.Models;

public sealed class Movie
{
    public int Id { get; set; }
    public required string Title { get; set; }
    public required string Genre { get; set; }
    public int Year { get; set; }
    public string Synopsis { get; set; } = string.Empty;
    public string PosterUrl { get; set; } = string.Empty;
    public string BackdropUrl { get; set; } = string.Empty;
    public string Kind { get; set; } = "Film";
    public string Runtime { get; set; } = string.Empty;
    public double Rating { get; set; }
    public string Director { get; set; } = string.Empty;
    public string CastNames { get; set; } = string.Empty;
    public string Language { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public bool IsFeatured { get; set; }
    public bool IsPublished { get; set; } = true;
    public int Popularity { get; set; }
    public DateTime? ReleaseDate { get; set; }
}
