using MfbCinema.Api.Models;
using Xunit;

namespace MfbCinema.Tests;

public sealed class CatalogRulesTests
{
    [Theory]
    [InlineData("Dune", true)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    public void TitleValidation_RejectsEmptyTitles(string title, bool expected)
    {
        // Arrange
        // Act
        var actual = CatalogRules.IsValidTitle(title);
        // Assert
        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(8.5, true)]
    [InlineData(10, true)]
    [InlineData(-0.1, false)]
    [InlineData(10.1, false)]
    public void EditorialRatingValidation_UsesZeroToTenScale(double rating, bool expected)
    {
        // Arrange
        // Act
        var actual = CatalogRules.IsValidEditorialRating(rating);
        // Assert
        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData(1, true)]
    [InlineData(5, true)]
    [InlineData(0, false)]
    [InlineData(6, false)]
    public void UserRatingValidation_UsesOneToFiveScale(int rating, bool expected)
    {
        // Arrange
        // Act
        var actual = CatalogRules.IsValidUserRating(rating);
        // Assert
        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData(0, null, true)]
    [InlineData(120, 3600, true)]
    [InlineData(-1, 3600, false)]
    [InlineData(604801, null, false)]
    [InlineData(10, 0, false)]
    public void PlaybackProgressValidation_RejectsOutOfRangeValues(int position, int? duration, bool expected)
    {
        // Arrange
        // Act
        var actual = CatalogRules.IsValidPlaybackProgress(position, duration);
        // Assert
        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Pagination_IsBounded()
    {
        // Arrange
        // Act
        var page = CatalogRules.NormalizePage(0);
        var pageSize = CatalogRules.NormalizePageSize(500);
        // Assert
        Assert.Equal(1, page);
        Assert.Equal(50, pageSize);
    }

    [Fact]
    public void MissingArtwork_HasDeterministicLocalFallbacks()
    {
        // Arrange
        const int movieId = 42;
        // Act
        var poster = CatalogRules.PosterFallback(movieId);
        var backdrop = CatalogRules.BackdropFallback(movieId);
        // Assert
        Assert.Equal("/posters/42.svg", poster);
        Assert.Equal("/posters/backdrop-42.svg", backdrop);
    }
}
