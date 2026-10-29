using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MfbCinema.Api.Models;
using MfbCinema.Api.Hubs;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 240,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
    options.AddFixedWindowLimiter("auth", limiter =>
    {
        limiter.PermitLimit = 10; limiter.Window = TimeSpan.FromMinutes(1); limiter.QueueLimit = 0; limiter.AutoReplenishment = true;
    });
});
var connectionString = builder.Configuration.GetConnectionString("Cinema");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("ConnectionStrings:Cinema must be configured through a secret or environment variable.");
builder.Services.AddDbContext<CinemaDb>(options => options.UseNpgsql(connectionString));
builder.Services.AddScoped<IPasswordHasher<UserAccount>, PasswordHasher<UserAccount>>();
var jwtKey = Environment.GetEnvironmentVariable("JWT_KEY");
if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32 || (!builder.Environment.IsDevelopment() && jwtKey.StartsWith("DEV_ONLY", StringComparison.Ordinal)))
    throw new InvalidOperationException("Configure a strong JWT_KEY of at least 32 characters before starting the API.");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "MfbCinema.Api";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "MfbCinema.Client";
var adminEmails = (builder.Configuration.GetSection("Admin:Emails").Get<string[]>() ?? Array.Empty<string>())
    .Where(email => !string.IsNullOrWhiteSpace(email)).Select(email => email.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options => options.TokenValidationParameters = new TokenValidationParameters
{
    ValidateIssuer = true,
    ValidIssuer = jwtIssuer,
    ValidateAudience = true,
    ValidAudience = jwtAudience,
    ValidateIssuerSigningKey = true,
    IssuerSigningKey = signingKey,
    ValidateLifetime = true,
    ClockSkew = TimeSpan.FromSeconds(30)
});
builder.Services.AddAuthorization(options => options.AddPolicy("AdminOnly", policy => policy.RequireAuthenticatedUser().RequireRole("Admin")));
var configuredOrigins = (builder.Configuration["CORS_ORIGINS"] ?? "http://localhost:5173,http://127.0.0.1:5173")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(configuredOrigins).AllowAnyHeader().AllowAnyMethod()));
var app = builder.Build();
app.UseCors();
app.UseRateLimiter();
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.UseAuthentication();
app.UseAuthorization();

// Database schema changes are intentionally not executed at application startup.
// Apply the reviewed additive SQL migration manually after backing up the database.
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", service = "MFB Cinema API" }));
app.MapGet("/api/genres", async (CinemaDb db) => Results.Ok(await db.Movies.AsNoTracking().Select(m => m.Genre).Distinct().OrderBy(g => g).ToListAsync()));
app.MapGet("/api/movies", async (CinemaDb db, string? q, string? genre, int page = 1, int pageSize = 20) =>
{
    page = CatalogRules.NormalizePage(page); pageSize = CatalogRules.NormalizePageSize(pageSize);
    var query = db.Movies.AsNoTracking().AsQueryable();
    if (!string.IsNullOrWhiteSpace(q)) query = query.Where(m => m.Title.ToLower().Contains(q.ToLower()));
    if (!string.IsNullOrWhiteSpace(genre)) query = query.Where(m => m.Genre.ToLower() == genre.ToLower());
    var total = await query.CountAsync();
    var items = await query.OrderBy(m => m.Title).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
    return Results.Ok(new { page, pageSize, total, items });
});
app.MapGet("/api/movies/{id:int}", async (int id, CinemaDb db) =>
{
    var movie = await db.Movies.FindAsync(id);
    return (IResult)(movie is null ? Results.NotFound(new { message = "Movie not found" }) : Results.Ok(movie));
});
app.MapPost("/api/movies", async (MovieInput input, CinemaDb db) =>
{
    if (string.IsNullOrWhiteSpace(input.Title) || string.IsNullOrWhiteSpace(input.Genre)) return (IResult)Results.ValidationProblem(new Dictionary<string, string[]> { ["title"] = ["Title and genre are required."] });
    var movie = new Movie { Title = input.Title.Trim(), Genre = input.Genre.Trim(), Year = input.Year, Synopsis = input.Synopsis ?? "", PosterUrl = input.PosterUrl ?? "" };
    db.Movies.Add(movie); await db.SaveChangesAsync(); return (IResult)Results.Created($"/api/movies/{movie.Id}", movie);
}).RequireAuthorization("AdminOnly");

app.MapPost("/api/auth/register", async (RegisterInput input, CinemaDb db, IPasswordHasher<UserAccount> hasher) =>
{
    var name = input.Name?.Trim(); var email = input.Email?.Trim().ToLowerInvariant();
    if (string.IsNullOrWhiteSpace(name) || name.Length < 2 || name.Length > 100 || string.IsNullOrWhiteSpace(email) || !email.Contains('@') || email.Length > 320 || string.IsNullOrWhiteSpace(input.Password) || input.Password.Length < 8 || input.Password.Length > 128)
        return (IResult)Results.BadRequest(new { message = "Enter a valid name and email. Password must be 8–128 characters." });
    if (await db.Users.AnyAsync(u => u.Email == email)) return (IResult)Results.Conflict(new { message = "An account with this email already exists." });
    var user = new UserAccount { Name = name, Email = email, PasswordHash = "pending" };
    user.PasswordHash = hasher.HashPassword(user, input.Password);
    db.Users.Add(user);
    try { await db.SaveChangesAsync(); } catch (DbUpdateException) { return (IResult)Results.Conflict(new { message = "An account with this email already exists." }); }
    return (IResult)Results.Ok(CreateAuthResponse(user, signingKey, adminEmails.Contains(user.Email), jwtIssuer, jwtAudience));
}).RequireRateLimiting("auth");
app.MapPost("/api/auth/login", async (LoginInput input, CinemaDb db, IPasswordHasher<UserAccount> hasher) =>
{
    var email = input.Email?.Trim().ToLowerInvariant();
    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrEmpty(input.Password)) return Results.BadRequest(new { message = "Email and password are required." });
    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email);
    if (user is null || hasher.VerifyHashedPassword(user, user.PasswordHash, input.Password) == PasswordVerificationResult.Failed) return (IResult)Results.Json(new { message = "Email or password is incorrect." }, statusCode: StatusCodes.Status401Unauthorized);
    return (IResult)Results.Ok(CreateAuthResponse(user, signingKey, adminEmails.Contains(user.Email), jwtIssuer, jwtAudience));
}).RequireRateLimiting("auth");
app.MapGet("/api/auth/me", async (ClaimsPrincipal principal, CinemaDb db) =>
{
    var id = principal.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(id, out var userId)) return (IResult)Results.Unauthorized();
    var user = await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => new { u.Id, u.Name, u.Email, u.CreatedAtUtc }).SingleOrDefaultAsync();
    return (IResult)(user is null ? Results.NotFound() : Results.Ok(user));
}).RequireAuthorization();
app.MapGet("/api/watchlist", async (ClaimsPrincipal principal, CinemaDb db) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return (IResult)Results.Unauthorized();
    var items = await (from w in db.WatchlistEntries join m in db.Movies on w.MovieId equals m.Id where w.UserAccountId == userId orderby w.AddedAtUtc descending select new { w.MovieId, w.AddedAtUtc, movie = m }).ToListAsync();
    return Results.Ok(items);
}).RequireAuthorization();
app.MapPost("/api/watchlist/{movieId:int}", async (int movieId, ClaimsPrincipal principal, CinemaDb db) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return (IResult)Results.Unauthorized();
    if (!await db.Movies.AnyAsync(m => m.Id == movieId)) return (IResult)Results.NotFound(new { message = "Movie not found." });
    if (!await db.WatchlistEntries.AnyAsync(w => w.UserAccountId == userId && w.MovieId == movieId)) { db.WatchlistEntries.Add(new WatchlistEntry { UserAccountId = userId, MovieId = movieId }); await db.SaveChangesAsync(); }
    return (IResult)Results.NoContent();
}).RequireAuthorization();
app.MapDelete("/api/watchlist/{movieId:int}", async (int movieId, ClaimsPrincipal principal, CinemaDb db) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return (IResult)Results.Unauthorized();
    var entry = await db.WatchlistEntries.SingleOrDefaultAsync(w => w.UserAccountId == userId && w.MovieId == movieId);
    if (entry is not null) { db.WatchlistEntries.Remove(entry); await db.SaveChangesAsync(); }
    return (IResult)Results.NoContent();
}).RequireAuthorization();

// Versioned catalogue API: bounded pagination, safe sort allow-list, and server-side filtering.
app.MapGet("/api/v1/genres", async (CinemaDb db, CancellationToken ct) =>
    Results.Ok(await db.Movies.AsNoTracking().Where(m => m.IsPublished).Select(m => m.Genre).Distinct().OrderBy(g => g).ToListAsync(ct)));

app.MapGet("/api/v1/movies", async (CinemaDb db, string? q, string? genre, string? kind, int? yearFrom, int? yearTo,
    double? minRating, bool? featured, string? sort, int page = 1, int pageSize = 20, CancellationToken ct = default) =>
{
    page = Math.Max(1, page);
    pageSize = Math.Clamp(pageSize, 1, 50);
    var query = db.Movies.AsNoTracking().Where(m => m.IsPublished);
    if (!string.IsNullOrWhiteSpace(q))
    {
        var term = q.Trim().ToLowerInvariant();
        query = query.Where(m => m.Title.ToLower().Contains(term) || m.Synopsis.ToLower().Contains(term) ||
            m.Genre.ToLower().Contains(term) || m.Director.ToLower().Contains(term) || m.CastNames.ToLower().Contains(term));
    }
    if (!string.IsNullOrWhiteSpace(genre)) query = query.Where(m => m.Genre.ToLower() == genre.Trim().ToLower());
    if (!string.IsNullOrWhiteSpace(kind)) query = query.Where(m => m.Kind.ToLower() == kind.Trim().ToLower());
    if (yearFrom.HasValue) query = query.Where(m => m.Year >= yearFrom.Value);
    if (yearTo.HasValue) query = query.Where(m => m.Year <= yearTo.Value);
    if (minRating.HasValue) query = query.Where(m => m.Rating >= Math.Clamp(minRating.Value, 0, 10));
    if (featured == true) query = query.Where(m => m.IsFeatured);
    var total = await query.CountAsync(ct);
    query = (sort ?? "title").ToLowerInvariant() switch
    {
        "year" or "newest" => query.OrderByDescending(m => m.Year).ThenBy(m => m.Title),
        "oldest" => query.OrderBy(m => m.Year).ThenBy(m => m.Title),
        "rating" => query.OrderByDescending(m => m.Rating).ThenBy(m => m.Title),
        "popular" or "popularity" => query.OrderByDescending(m => m.Popularity).ThenByDescending(m => m.Rating),
        "title_desc" => query.OrderByDescending(m => m.Title),
        _ => query.OrderBy(m => m.Title)
    };
    var items = await query.Skip((page - 1) * pageSize).Take(pageSize).Select(m => new
    {
        m.Id,
        m.Title,
        m.Genre,
        m.Year,
        m.Synopsis,
        m.Kind,
        m.Runtime,
        m.Rating,
        m.Director,
        m.CastNames,
        m.Language,
        m.Country,
        m.IsFeatured,
        m.Popularity,
        m.ReleaseDate,
        posterUrl = string.IsNullOrWhiteSpace(m.PosterUrl) ? $"/posters/{m.Id}.svg" : m.PosterUrl,
        backdropUrl = string.IsNullOrWhiteSpace(m.BackdropUrl) ? $"/posters/backdrop-{m.Id}.svg" : m.BackdropUrl
    }).ToListAsync(ct);
    return Results.Ok(new { page, pageSize, total, totalPages = (int)Math.Ceiling(total / (double)pageSize), items });
});

app.MapGet("/api/v1/content/trending", async (CinemaDb db, int take = 12, CancellationToken ct = default) =>
    Results.Ok(await db.Movies.AsNoTracking().Where(m => m.IsPublished).OrderByDescending(m => m.Popularity).ThenByDescending(m => m.Rating).Take(Math.Clamp(take, 1, 30)).Select(m => new { m.Id, m.Title, m.Genre, m.Year, m.Synopsis, m.Kind, m.Runtime, m.Rating, m.Popularity, posterUrl = string.IsNullOrWhiteSpace(m.PosterUrl) ? $"/posters/{m.Id}.svg" : m.PosterUrl, backdropUrl = string.IsNullOrWhiteSpace(m.BackdropUrl) ? $"/posters/backdrop-{m.Id}.svg" : m.BackdropUrl }).ToListAsync(ct)));
app.MapGet("/api/v1/content/popular", async (CinemaDb db, int take = 12, CancellationToken ct = default) =>
    Results.Ok(await db.Movies.AsNoTracking().Where(m => m.IsPublished).OrderByDescending(m => m.Rating).ThenByDescending(m => m.Popularity).Take(Math.Clamp(take, 1, 30)).Select(m => new { m.Id, m.Title, m.Genre, m.Year, m.Synopsis, m.Kind, m.Runtime, m.Rating, m.Popularity, posterUrl = string.IsNullOrWhiteSpace(m.PosterUrl) ? $"/posters/{m.Id}.svg" : m.PosterUrl, backdropUrl = string.IsNullOrWhiteSpace(m.BackdropUrl) ? $"/posters/backdrop-{m.Id}.svg" : m.BackdropUrl }).ToListAsync(ct)));
app.MapGet("/api/v1/content/featured", async (CinemaDb db, int take = 12, CancellationToken ct = default) =>
    Results.Ok(await db.Movies.AsNoTracking().Where(m => m.IsPublished && m.IsFeatured).OrderByDescending(m => m.Popularity).Take(Math.Clamp(take, 1, 30)).Select(m => new { m.Id, m.Title, m.Genre, m.Year, m.Synopsis, m.Kind, m.Runtime, m.Rating, m.Popularity, posterUrl = string.IsNullOrWhiteSpace(m.PosterUrl) ? $"/posters/{m.Id}.svg" : m.PosterUrl, backdropUrl = string.IsNullOrWhiteSpace(m.BackdropUrl) ? $"/posters/backdrop-{m.Id}.svg" : m.BackdropUrl }).ToListAsync(ct)));
app.MapGet("/api/v1/movies/{id:int}", async (int id, CinemaDb db, CancellationToken ct) =>
{
    var movie = await db.Movies.AsNoTracking().Where(m => m.Id == id && m.IsPublished).Select(m => new
    {
        m.Id,
        m.Title,
        m.Genre,
        m.Year,
        m.Synopsis,
        m.Kind,
        m.Runtime,
        m.Rating,
        m.Director,
        m.CastNames,
        m.Language,
        m.Country,
        m.IsFeatured,
        posterUrl = string.IsNullOrWhiteSpace(m.PosterUrl) ? $"/posters/{m.Id}.svg" : m.PosterUrl,
        backdropUrl = string.IsNullOrWhiteSpace(m.BackdropUrl) ? $"/posters/backdrop-{m.Id}.svg" : m.BackdropUrl
    }).SingleOrDefaultAsync(ct);
    return movie is null ? Results.NotFound(new { message = "Content not found." }) : Results.Ok(movie);
});
app.MapGet("/api/v1/series", async (CinemaDb db, string? q, int page = 1, int pageSize = 20, CancellationToken ct = default) =>
{
    page = CatalogRules.NormalizePage(page); pageSize = CatalogRules.NormalizePageSize(pageSize);
    var query = db.Movies.AsNoTracking().Where(m => m.IsPublished && m.Kind.ToLower() == "dizi");
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim().ToLowerInvariant(); query = query.Where(m => m.Title.ToLower().Contains(term) || m.Synopsis.ToLower().Contains(term)); }
    var total = await query.CountAsync(ct);
    var items = await query.OrderBy(m => m.Title).Skip((page - 1) * pageSize).Take(pageSize).Select(m => new
    {
        m.Id,
        m.Title,
        m.Genre,
        m.Year,
        m.Synopsis,
        m.Kind,
        m.Runtime,
        m.Rating,
        m.Director,
        m.CastNames,
        posterUrl = string.IsNullOrWhiteSpace(m.PosterUrl) ? $"/posters/{m.Id}.svg" : m.PosterUrl,
        backdropUrl = string.IsNullOrWhiteSpace(m.BackdropUrl) ? $"/posters/backdrop-{m.Id}.svg" : m.BackdropUrl
    }).ToListAsync(ct);
    return Results.Ok(new { page, pageSize, total, totalPages = (int)Math.Ceiling(total / (double)pageSize), items });
});

app.MapPost("/api/v1/admin/movies", async (CatalogMovieInput input, CinemaDb db, CancellationToken ct) =>
{
    if (!CatalogRules.IsValidTitle(input.Title) || !CatalogRules.IsValidGenre(input.Genre) || input.Year is < 1888 or > 2100 || !CatalogRules.IsValidEditorialRating(input.Rating) || input.Popularity < 0)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["movie"] = ["Title, genre, year, rating, and popularity must be valid."] });
    var kind = string.Equals(input.Kind, "Dizi", StringComparison.OrdinalIgnoreCase) ? "Dizi" : "Film";
    var movie = new Movie
    {
        Title = input.Title.Trim(),
        Genre = input.Genre.Trim(),
        Year = input.Year,
        Synopsis = input.Synopsis?.Trim() ?? string.Empty,
        PosterUrl = input.PosterUrl?.Trim() ?? string.Empty,
        BackdropUrl = input.BackdropUrl?.Trim() ?? string.Empty,
        Kind = kind,
        Runtime = input.Runtime?.Trim() ?? string.Empty,
        Rating = input.Rating,
        Director = input.Director?.Trim() ?? string.Empty,
        CastNames = input.CastNames?.Trim() ?? string.Empty,
        Language = input.Language?.Trim() ?? string.Empty,
        Country = input.Country?.Trim() ?? string.Empty,
        IsFeatured = input.IsFeatured,
        IsPublished = input.IsPublished,
        Popularity = input.Popularity,
        ReleaseDate = input.ReleaseDate
    };
    db.Movies.Add(movie); await db.SaveChangesAsync(ct);
    return Results.Created($"/api/v1/movies/{movie.Id}", movie);
}).RequireAuthorization("AdminOnly");
app.MapPut("/api/v1/admin/movies/{id:int}", async (int id, CatalogMovieInput input, CinemaDb db, CancellationToken ct) =>
{
    if (!CatalogRules.IsValidTitle(input.Title) || !CatalogRules.IsValidGenre(input.Genre) || input.Year is < 1888 or > 2100 || !CatalogRules.IsValidEditorialRating(input.Rating) || input.Popularity < 0)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["movie"] = ["Title, genre, year, rating, and popularity must be valid."] });
    var movie = await db.Movies.SingleOrDefaultAsync(m => m.Id == id, ct);
    if (movie is null) return Results.NotFound();
    movie.Title = input.Title.Trim(); movie.Genre = input.Genre.Trim(); movie.Year = input.Year; movie.Synopsis = input.Synopsis?.Trim() ?? string.Empty;
    movie.PosterUrl = input.PosterUrl?.Trim() ?? string.Empty; movie.BackdropUrl = input.BackdropUrl?.Trim() ?? string.Empty;
    movie.Kind = string.Equals(input.Kind, "Dizi", StringComparison.OrdinalIgnoreCase) ? "Dizi" : "Film"; movie.Runtime = input.Runtime?.Trim() ?? string.Empty;
    movie.Rating = input.Rating; movie.Director = input.Director?.Trim() ?? string.Empty; movie.CastNames = input.CastNames?.Trim() ?? string.Empty;
    movie.Language = input.Language?.Trim() ?? string.Empty; movie.Country = input.Country?.Trim() ?? string.Empty; movie.IsFeatured = input.IsFeatured;
    movie.IsPublished = input.IsPublished; movie.Popularity = input.Popularity; movie.ReleaseDate = input.ReleaseDate;
    await db.SaveChangesAsync(ct); return Results.Ok(movie);
}).RequireAuthorization("AdminOnly");
app.MapDelete("/api/v1/admin/movies/{id:int}", async (int id, CinemaDb db, CancellationToken ct) =>
{
    var movie = await db.Movies.SingleOrDefaultAsync(m => m.Id == id, ct);
    if (movie is null) return Results.NotFound();
    db.Movies.Remove(movie); await db.SaveChangesAsync(ct); return Results.NoContent();
}).RequireAuthorization("AdminOnly");
app.MapPost("/api/v1/admin/series/{seriesId:int}/seasons", async (int seriesId, SeasonInput input, CinemaDb db, CancellationToken ct) =>
{
    if (input.SeasonNumber < 1 || (input.Title?.Length ?? 0) > 180) return Results.ValidationProblem(new Dictionary<string, string[]> { ["season"] = ["Season number must be positive and title must be at most 180 characters."] });
    if (!await db.Movies.AnyAsync(m => m.Id == seriesId && m.Kind.ToLower() == "dizi", ct)) return Results.NotFound(new { message = "Series not found." });
    var season = new Season { SeriesId = seriesId, SeasonNumber = input.SeasonNumber, Title = input.Title?.Trim() ?? $"Season {input.SeasonNumber}", PosterUrl = input.PosterUrl?.Trim() ?? string.Empty, ReleaseDate = input.ReleaseDate };
    db.Seasons.Add(season);
    try { await db.SaveChangesAsync(ct); } catch (DbUpdateException) { return Results.Conflict(new { message = "That season number already exists for this series." }); }
    return Results.Created($"/api/v1/seasons/{season.Id}/episodes", season);
}).RequireAuthorization("AdminOnly");
app.MapPost("/api/v1/admin/seasons/{seasonId:int}/episodes", async (int seasonId, EpisodeInput input, CinemaDb db, CancellationToken ct) =>
{
    if (input.EpisodeNumber < 1 || string.IsNullOrWhiteSpace(input.Title) || input.Title.Trim().Length > 180 || (input.RuntimeMinutes.HasValue && input.RuntimeMinutes.Value < 1))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["episode"] = ["Episode number/title/runtime are invalid."] });
    if (!await db.Seasons.AnyAsync(s => s.Id == seasonId, ct)) return Results.NotFound(new { message = "Season not found." });
    var episode = new Episode
    {
        SeasonId = seasonId,
        EpisodeNumber = input.EpisodeNumber,
        Title = input.Title.Trim(),
        Synopsis = input.Synopsis?.Trim() ?? string.Empty,
        RuntimeMinutes = input.RuntimeMinutes,
        StillUrl = input.StillUrl?.Trim() ?? string.Empty,
        AirDate = input.AirDate
    };
    db.Episodes.Add(episode);
    try { await db.SaveChangesAsync(ct); } catch (DbUpdateException) { return Results.Conflict(new { message = "That episode number already exists for this season." }); }
    return Results.Created($"/api/v1/seasons/{seasonId}/episodes", episode);
}).RequireAuthorization("AdminOnly");
app.MapPut("/api/v1/admin/episodes/{episodeId:int}", async (int episodeId, EpisodeInput input, CinemaDb db, CancellationToken ct) =>
{
    if (input.EpisodeNumber < 1 || string.IsNullOrWhiteSpace(input.Title) || input.Title.Trim().Length > 180 || (input.RuntimeMinutes.HasValue && input.RuntimeMinutes.Value < 1))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["episode"] = ["Episode number/title/runtime are invalid."] });
    var episode = await db.Episodes.SingleOrDefaultAsync(e => e.Id == episodeId, ct);
    if (episode is null) return Results.NotFound();
    episode.EpisodeNumber = input.EpisodeNumber; episode.Title = input.Title.Trim(); episode.Synopsis = input.Synopsis?.Trim() ?? string.Empty;
    episode.RuntimeMinutes = input.RuntimeMinutes; episode.StillUrl = input.StillUrl?.Trim() ?? string.Empty; episode.AirDate = input.AirDate;
    try { await db.SaveChangesAsync(ct); } catch (DbUpdateException) { return Results.Conflict(new { message = "That episode number already exists for this season." }); }
    return Results.Ok(episode);
}).RequireAuthorization("AdminOnly");
app.MapDelete("/api/v1/admin/episodes/{episodeId:int}", async (int episodeId, CinemaDb db, CancellationToken ct) =>
{
    var episode = await db.Episodes.SingleOrDefaultAsync(e => e.Id == episodeId, ct);
    if (episode is null) return Results.NotFound();
    db.Episodes.Remove(episode); await db.SaveChangesAsync(ct); return Results.NoContent();
}).RequireAuthorization("AdminOnly");

app.MapGet("/api/v1/series/{id:int}/seasons", async (int id, CinemaDb db, CancellationToken ct) =>
{
    if (!await db.Movies.AnyAsync(m => m.Id == id && m.Kind.ToLower() == "dizi", ct)) return Results.NotFound(new { message = "Series not found." });
    return Results.Ok(await db.Seasons.AsNoTracking().Where(s => s.SeriesId == id).OrderBy(s => s.SeasonNumber)
        .Select(s => new { s.Id, s.SeriesId, s.SeasonNumber, s.Title, posterUrl = string.IsNullOrWhiteSpace(s.PosterUrl) ? $"/posters/{s.SeriesId}.svg" : s.PosterUrl, s.ReleaseDate }).ToListAsync(ct));
});
app.MapGet("/api/v1/seasons/{id:int}/episodes", async (int id, CinemaDb db, CancellationToken ct) =>
    Results.Ok(await (from e in db.Episodes.AsNoTracking()
                      join s in db.Seasons.AsNoTracking() on e.SeasonId equals s.Id
                      where e.SeasonId == id
                      orderby e.EpisodeNumber
                      select new { e.Id, e.SeasonId, e.EpisodeNumber, e.Title, e.Synopsis, e.RuntimeMinutes, stillUrl = string.IsNullOrWhiteSpace(e.StillUrl) ? $"/posters/{s.SeriesId}.svg" : e.StillUrl, e.AirDate }).ToListAsync(ct)));

app.MapGet("/api/v1/users/me", async (ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    var user = await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => new { u.Id, u.Name, u.Email, u.CreatedAtUtc }).SingleOrDefaultAsync(ct);
    return user is null ? Results.NotFound() : Results.Ok(user);
}).RequireAuthorization();
app.MapPut("/api/v1/users/me", async (ProfileUpdateInput input, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    var name = input.Name?.Trim();
    if (string.IsNullOrWhiteSpace(name) || name.Length is < 2 or > 100) return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name must contain 2–100 characters."] });
    var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
    if (user is null) return Results.NotFound();
    user.Name = name;
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { user.Id, user.Name, user.Email, user.CreatedAtUtc });
}).RequireAuthorization();

app.MapGet("/api/v1/users/me/favorites", async (ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    return Results.Ok(await (from f in db.Favorites.AsNoTracking() join m in db.Movies.AsNoTracking() on f.MovieId equals m.Id where f.UserAccountId == userId orderby f.CreatedAtUtc descending select new { f.MovieId, f.CreatedAtUtc, movie = m }).ToListAsync(ct));
}).RequireAuthorization();
app.MapPost("/api/v1/users/me/favorites/{movieId:int}", async (int movieId, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    if (!await db.Movies.AnyAsync(m => m.Id == movieId && m.IsPublished, ct)) return Results.NotFound(new { message = "Content not found." });
    if (!await db.Favorites.AnyAsync(f => f.UserAccountId == userId && f.MovieId == movieId, ct)) { db.Favorites.Add(new FavoriteEntry { UserAccountId = userId, MovieId = movieId }); await db.SaveChangesAsync(ct); }
    return Results.NoContent();
}).RequireAuthorization();
app.MapDelete("/api/v1/users/me/favorites/{movieId:int}", async (int movieId, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    var entry = await db.Favorites.SingleOrDefaultAsync(f => f.UserAccountId == userId && f.MovieId == movieId, ct);
    if (entry is not null) { db.Favorites.Remove(entry); await db.SaveChangesAsync(ct); }
    return Results.NoContent();
}).RequireAuthorization();

app.MapGet("/api/v1/users/me/history", async (ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    return Results.Ok(await (from h in db.WatchHistory.AsNoTracking() join m in db.Movies.AsNoTracking() on h.MovieId equals m.Id where h.UserAccountId == userId orderby h.LastWatchedAtUtc descending select new { h.MovieId, h.PositionSeconds, h.DurationSeconds, h.LastWatchedAtUtc, movie = m }).Take(100).ToListAsync(ct));
}).RequireAuthorization();
app.MapPut("/api/v1/users/me/history/{movieId:int}", async (int movieId, WatchProgressInput input, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    if (!CatalogRules.IsValidPlaybackProgress(input.PositionSeconds, input.DurationSeconds)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["positionSeconds"] = ["Playback progress is outside the accepted range."] });
    if (!await db.Movies.AnyAsync(m => m.Id == movieId, ct)) return Results.NotFound(new { message = "Content not found." });
    var entry = await db.WatchHistory.SingleOrDefaultAsync(h => h.UserAccountId == userId && h.MovieId == movieId, ct);
    if (entry is null) { entry = new WatchHistoryEntry { UserAccountId = userId, MovieId = movieId }; db.WatchHistory.Add(entry); }
    entry.PositionSeconds = input.PositionSeconds; entry.DurationSeconds = input.DurationSeconds; entry.LastWatchedAtUtc = DateTime.UtcNow;
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { entry.MovieId, entry.PositionSeconds, entry.DurationSeconds, entry.LastWatchedAtUtc });
}).RequireAuthorization();
app.MapGet("/api/v1/users/me/continue-watching", async (ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    var progress = await db.WatchHistory.AsNoTracking().Where(h => h.UserAccountId == userId && h.PositionSeconds > 0 && (!h.DurationSeconds.HasValue || h.PositionSeconds < h.DurationSeconds.Value - 30)).OrderByDescending(h => h.LastWatchedAtUtc).Take(30).ToListAsync(ct);
    var movieIds = progress.Select(h => h.MovieId).ToArray();
    var movies = await db.Movies.AsNoTracking().Where(m => movieIds.Contains(m.Id)).ToDictionaryAsync(m => m.Id, ct);
    return Results.Ok(progress.Where(h => movies.ContainsKey(h.MovieId)).Select(h => new { history = h, movie = movies[h.MovieId], progressPercent = h.DurationSeconds.HasValue ? Math.Clamp((int)Math.Round(h.PositionSeconds * 100d / h.DurationSeconds.Value), 0, 100) : (int?)null }));
}).RequireAuthorization();

app.MapPost("/api/v1/content/{movieId:int}/ratings", async (int movieId, RatingInput input, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    if (!CatalogRules.IsValidUserRating(input.Rating)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["rating"] = ["Rating must be from 1 to 5."] });
    if (!await db.Movies.AnyAsync(m => m.Id == movieId, ct)) return Results.NotFound(new { message = "Content not found." });
    var rating = await db.Ratings.SingleOrDefaultAsync(r => r.UserAccountId == userId && r.MovieId == movieId, ct);
    if (rating is null) { rating = new MovieRating { UserAccountId = userId, MovieId = movieId }; db.Ratings.Add(rating); }
    rating.Rating = input.Rating; rating.UpdatedAtUtc = DateTime.UtcNow;
    if (input.Comment is not null)
    {
        var comment = input.Comment.Trim();
        if (comment.Length > 600) return Results.ValidationProblem(new Dictionary<string, string[]> { ["comment"] = ["Comment cannot exceed 600 characters."] });
        var review = await db.Reviews.SingleOrDefaultAsync(r => r.UserAccountId == userId && r.MovieId == movieId, ct);
        if (review is null) { review = new MovieReview { UserAccountId = userId, MovieId = movieId, DisplayName = principal.FindFirstValue(ClaimTypes.Name) ?? "Member" }; db.Reviews.Add(review); }
        review.Rating = input.Rating; review.Comment = comment; review.UpdatedAtUtc = DateTime.UtcNow;
    }
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { rating.MovieId, rating.Rating, rating.UpdatedAtUtc });
}).RequireAuthorization();
app.MapGet("/api/v1/content/{movieId:int}/reviews", async (int movieId, CinemaDb db, int page = 1, int pageSize = 20, CancellationToken ct = default) =>
{
    page = CatalogRules.NormalizePage(page); pageSize = CatalogRules.NormalizePageSize(pageSize);
    var query = db.Reviews.AsNoTracking().Where(r => r.MovieId == movieId && !r.IsHidden);
    var total = await query.CountAsync(ct);
    var items = await query.OrderByDescending(r => r.CreatedAtUtc).Skip((page - 1) * pageSize).Take(pageSize).Select(r => new { r.Id, r.DisplayName, r.Rating, r.Comment, r.CreatedAtUtc, r.UpdatedAtUtc }).ToListAsync(ct);
    return Results.Ok(new { page, pageSize, total, items });
});
app.MapPost("/api/v1/content/{movieId:int}/reviews", async (int movieId, RatingInput input, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    if (input.Rating is < 1 or > 5 || (input.Comment?.Length ?? 0) > 600) return Results.ValidationProblem(new Dictionary<string, string[]> { ["review"] = ["Rating must be 1–5 and comment must be at most 600 characters."] });
    if (!await db.Movies.AnyAsync(m => m.Id == movieId, ct)) return Results.NotFound(new { message = "Content not found." });
    var review = await db.Reviews.SingleOrDefaultAsync(r => r.UserAccountId == userId && r.MovieId == movieId, ct);
    if (review is null) { review = new MovieReview { UserAccountId = userId, MovieId = movieId, DisplayName = principal.FindFirstValue(ClaimTypes.Name) ?? "Member" }; db.Reviews.Add(review); }
    review.Rating = input.Rating; review.Comment = input.Comment?.Trim() ?? string.Empty; review.UpdatedAtUtc = DateTime.UtcNow;
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { review.Id, review.MovieId, review.Rating, review.Comment, review.UpdatedAtUtc });
}).RequireAuthorization();
app.MapPut("/api/v1/admin/reviews/{reviewId:int}/moderation", async (int reviewId, ReviewModerationInput input, CinemaDb db, CancellationToken ct) =>
{
    var review = await db.Reviews.SingleOrDefaultAsync(r => r.Id == reviewId, ct);
    if (review is null) return Results.NotFound();
    review.IsHidden = input.Hidden; review.UpdatedAtUtc = DateTime.UtcNow;
    await db.SaveChangesAsync(ct);
    return Results.NoContent();
}).RequireAuthorization("AdminOnly");

app.MapGet("/api/v1/users/me/notifications", async (ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    return Results.Ok(await db.Notifications.AsNoTracking().Where(n => n.UserAccountId == userId).OrderByDescending(n => n.CreatedAtUtc).Take(50).ToListAsync(ct));
}).RequireAuthorization();
app.MapPut("/api/v1/users/me/notifications/{id:int}/read", async (int id, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    var notification = await db.Notifications.SingleOrDefaultAsync(n => n.Id == id && n.UserAccountId == userId, ct);
    if (notification is null) return Results.NotFound();
    notification.ReadAtUtc = DateTime.UtcNow; await db.SaveChangesAsync(ct); return Results.NoContent();
}).RequireAuthorization();

app.MapPost("/api/v1/watch-parties", async (WatchPartyCreateInput input, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    if (!await db.Movies.AnyAsync(m => m.Id == input.MovieId && m.IsPublished, ct)) return Results.NotFound(new { message = "Content not found." });
    var room = new WatchPartyRoom { HostUserAccountId = userId, MovieId = input.MovieId };
    db.WatchPartyRooms.Add(room); await db.SaveChangesAsync(ct);
    db.WatchPartyParticipants.Add(new WatchPartyParticipant { RoomId = room.Id, UserAccountId = userId });
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/v1/watch-parties/{room.RoomCode}", new { room.RoomCode, room.MovieId, room.IsActive, room.IsPlaying, room.PositionSeconds, room.CreatedAtUtc });
}).RequireAuthorization();
app.MapPost("/api/v1/watch-parties/join", async (WatchPartyJoinInput input, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    var code = input.RoomCode.Trim().ToUpperInvariant();
    var room = await db.WatchPartyRooms.SingleOrDefaultAsync(r => r.RoomCode == code && r.IsActive, ct);
    if (room is null) return Results.NotFound(new { message = "Active watch party not found." });
    if (!await db.WatchPartyParticipants.AnyAsync(p => p.RoomId == room.Id && p.UserAccountId == userId, ct))
    {
        var count = await db.WatchPartyParticipants.CountAsync(p => p.RoomId == room.Id, ct);
        if (count >= 20) return Results.Conflict(new { message = "This watch party has reached its 20 participant limit." });
        db.WatchPartyParticipants.Add(new WatchPartyParticipant { RoomId = room.Id, UserAccountId = userId });
        db.Notifications.Add(new UserNotification { UserAccountId = room.HostUserAccountId, Type = "watch-party", Title = "A participant joined", Message = "A user joined your watch party." });
        await db.SaveChangesAsync(ct);
    }
    return Results.Ok(new { room.RoomCode, room.MovieId, room.IsPlaying, room.PositionSeconds, room.UpdatedAtUtc });
}).RequireAuthorization();
app.MapPost("/api/v1/watch-parties/{roomCode}/commands", async (string roomCode, WatchPartyCommandInput input, ClaimsPrincipal principal, CinemaDb db, IHubContext<WatchPartyHub> hub, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    var command = input.Command.Trim().ToLowerInvariant();
    if (command is not ("play" or "pause" or "seek")) return Results.ValidationProblem(new Dictionary<string, string[]> { ["command"] = ["Command must be play, pause, or seek."] });
    var position = input.PositionSeconds ?? 0;
    if (double.IsNaN(position) || double.IsInfinity(position) || position < 0 || position > 604800) return Results.ValidationProblem(new Dictionary<string, string[]> { ["positionSeconds"] = ["Position is outside the accepted range."] });
    var room = await db.WatchPartyRooms.SingleOrDefaultAsync(r => r.RoomCode == roomCode.ToUpperInvariant() && r.IsActive, ct);
    if (room is null) return Results.NotFound(new { message = "Active watch party not found." });
    if (!await db.WatchPartyParticipants.AnyAsync(p => p.RoomId == room.Id && p.UserAccountId == userId, ct)) return Results.Forbid();
    room.PositionSeconds = position; room.IsPlaying = command == "play"; room.UpdatedAtUtc = DateTime.UtcNow;
    await db.SaveChangesAsync(ct);
    var state = new { room.RoomCode, room.MovieId, command, room.IsPlaying, room.PositionSeconds, room.UpdatedAtUtc, userId };
    await hub.Clients.Group(room.RoomCode).SendAsync("PlaybackState", state, ct);
    return Results.Ok(state);
}).RequireAuthorization();
app.MapDelete("/api/v1/watch-parties/{roomCode}", async (string roomCode, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    var room = await db.WatchPartyRooms.SingleOrDefaultAsync(r => r.RoomCode == roomCode.ToUpperInvariant() && r.IsActive, ct);
    if (room is null) return Results.NotFound();
    if (room.HostUserAccountId != userId) return Results.Forbid();
    room.IsActive = false; room.UpdatedAtUtc = DateTime.UtcNow; await db.SaveChangesAsync(ct); return Results.NoContent();
}).RequireAuthorization();

app.MapGet("/api/v1/admin/images/audit", async (CinemaDb db, CancellationToken ct) =>
{
    var items = await db.Movies.AsNoTracking().Where(m => m.IsPublished &&
        (string.IsNullOrWhiteSpace(m.PosterUrl) || m.PosterUrl.ToLower().Contains("placeholder") || m.PosterUrl.ToLower().Contains("mfb-poster-fallback")))
        .Select(m => new { m.Id, m.Title, m.Year, m.Kind, m.PosterUrl, suggestedFallback = $"/posters/{m.Id}.svg" }).ToListAsync(ct);
    return Results.Ok(new { scanned = await db.Movies.CountAsync(ct), candidates = items.Count, items, note = "This audit detects blank and known placeholder values. External URL reachability and TMDB matches require the separate fix-posters.mjs maintenance script and API credentials." });
}).RequireAuthorization("AdminOnly");


app.MapGet("/api/v1/users/me/watchlist", async (ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    return Results.Ok(await (from w in db.WatchlistEntries.AsNoTracking() join m in db.Movies.AsNoTracking() on w.MovieId equals m.Id where w.UserAccountId == userId orderby w.AddedAtUtc descending select new { w.MovieId, w.AddedAtUtc, movie = m }).ToListAsync(ct));
}).RequireAuthorization();
app.MapPost("/api/v1/users/me/watchlist/{movieId:int}", async (int movieId, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    if (!await db.Movies.AnyAsync(m => m.Id == movieId && m.IsPublished, ct)) return Results.NotFound(new { message = "Content not found." });
    if (!await db.WatchlistEntries.AnyAsync(w => w.UserAccountId == userId && w.MovieId == movieId, ct)) { db.WatchlistEntries.Add(new WatchlistEntry { UserAccountId = userId, MovieId = movieId }); await db.SaveChangesAsync(ct); }
    return Results.NoContent();
}).RequireAuthorization();
app.MapDelete("/api/v1/users/me/watchlist/{movieId:int}", async (int movieId, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    var entry = await db.WatchlistEntries.SingleOrDefaultAsync(w => w.UserAccountId == userId && w.MovieId == movieId, ct);
    if (entry is not null) { db.WatchlistEntries.Remove(entry); await db.SaveChangesAsync(ct); }
    return Results.NoContent();
}).RequireAuthorization();

app.MapPut("/api/v1/admin/seasons/{seasonId:int}", async (int seasonId, SeasonUpdateInput input, CinemaDb db, CancellationToken ct) =>
{
    if (input.SeasonNumber < 1 || (input.Title?.Length ?? 0) > 180) return Results.ValidationProblem(new Dictionary<string, string[]> { ["season"] = ["Season number and title are invalid."] });
    var season = await db.Seasons.SingleOrDefaultAsync(s => s.Id == seasonId, ct);
    if (season is null) return Results.NotFound();
    season.SeasonNumber = input.SeasonNumber; season.Title = input.Title?.Trim() ?? $"Season {input.SeasonNumber}"; season.PosterUrl = input.PosterUrl?.Trim() ?? string.Empty; season.ReleaseDate = input.ReleaseDate;
    try { await db.SaveChangesAsync(ct); } catch (DbUpdateException) { return Results.Conflict(new { message = "That season number already exists for this series." }); }
    return Results.Ok(season);
}).RequireAuthorization("AdminOnly");
app.MapDelete("/api/v1/admin/seasons/{seasonId:int}", async (int seasonId, CinemaDb db, CancellationToken ct) =>
{
    var season = await db.Seasons.SingleOrDefaultAsync(s => s.Id == seasonId, ct);
    if (season is null) return Results.NotFound();
    db.Seasons.Remove(season); await db.SaveChangesAsync(ct); return Results.NoContent();
}).RequireAuthorization("AdminOnly");

app.MapGet("/api/v1/movies/{movieId:int}/cast", async (int movieId, CinemaDb db, CancellationToken ct) =>
    Results.Ok(await (from credit in db.ContentCastCredits.AsNoTracking() join cast in db.CastMembers.AsNoTracking() on credit.CastMemberId equals cast.Id where credit.MovieId == movieId orderby credit.CreditOrder, cast.Name select new { cast.Id, cast.Name, profileUrl = string.IsNullOrWhiteSpace(cast.ProfileUrl) ? "/posters/cast-default.svg" : cast.ProfileUrl, cast.Biography, credit.CharacterName, credit.CreditOrder }).ToListAsync(ct)));
app.MapPost("/api/v1/admin/cast", async (CastMemberInput input, CinemaDb db, CancellationToken ct) =>
{
    if (!CatalogRules.IsValidTitle(input.Name)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name is required and must be at most 180 characters."] });
    if ((input.ProfileUrl?.Length ?? 0) > 2048 || (input.Biography?.Length ?? 0) > 10000) return Results.ValidationProblem(new Dictionary<string, string[]> { ["profile"] = ["Profile URL or biography is too long."] });
    var cast = new CastMember { Name = input.Name.Trim(), ProfileUrl = input.ProfileUrl?.Trim() ?? string.Empty, Biography = input.Biography?.Trim() ?? string.Empty };
    db.CastMembers.Add(cast); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/admin/cast/{cast.Id}", cast);
}).RequireAuthorization("AdminOnly");
app.MapPut("/api/v1/admin/cast/{castId:int}", async (int castId, CastMemberInput input, CinemaDb db, CancellationToken ct) =>
{
    if (!CatalogRules.IsValidTitle(input.Name)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name is required and must be at most 180 characters."] });
    var cast = await db.CastMembers.SingleOrDefaultAsync(c => c.Id == castId, ct);
    if (cast is null) return Results.NotFound();
    cast.Name = input.Name.Trim(); cast.ProfileUrl = input.ProfileUrl?.Trim() ?? string.Empty; cast.Biography = input.Biography?.Trim() ?? string.Empty;
    await db.SaveChangesAsync(ct); return Results.Ok(cast);
}).RequireAuthorization("AdminOnly");
app.MapDelete("/api/v1/admin/cast/{castId:int}", async (int castId, CinemaDb db, CancellationToken ct) =>
{
    var cast = await db.CastMembers.SingleOrDefaultAsync(c => c.Id == castId, ct);
    if (cast is null) return Results.NotFound();
    db.CastMembers.Remove(cast); await db.SaveChangesAsync(ct); return Results.NoContent();
}).RequireAuthorization("AdminOnly");
app.MapPost("/api/v1/admin/movies/{movieId:int}/cast", async (int movieId, CastCreditInput input, CinemaDb db, CancellationToken ct) =>
{
    if (input.CreditOrder < 0 || (input.CharacterName?.Length ?? 0) > 180) return Results.ValidationProblem(new Dictionary<string, string[]> { ["credit"] = ["Credit order and character name are invalid."] });
    if (!await db.Movies.AnyAsync(m => m.Id == movieId, ct) || !await db.CastMembers.AnyAsync(c => c.Id == input.CastMemberId, ct)) return Results.NotFound(new { message = "Movie or cast member not found." });
    var credit = new ContentCastCredit { MovieId = movieId, CastMemberId = input.CastMemberId, CharacterName = input.CharacterName?.Trim() ?? string.Empty, CreditOrder = input.CreditOrder };
    db.ContentCastCredits.Add(credit);
    try { await db.SaveChangesAsync(ct); } catch (DbUpdateException) { return Results.Conflict(new { message = "This cast member is already credited for the movie." }); }
    return Results.Created($"/api/v1/movies/{movieId}/cast", credit);
}).RequireAuthorization("AdminOnly");
app.MapDelete("/api/v1/admin/movies/{movieId:int}/cast/{castMemberId:int}", async (int movieId, int castMemberId, CinemaDb db, CancellationToken ct) =>
{
    var credit = await db.ContentCastCredits.SingleOrDefaultAsync(c => c.MovieId == movieId && c.CastMemberId == castMemberId, ct);
    if (credit is null) return Results.NotFound();
    db.ContentCastCredits.Remove(credit); await db.SaveChangesAsync(ct); return Results.NoContent();
}).RequireAuthorization("AdminOnly");

app.MapPost("/api/v1/watch-parties/{roomCode}/leave", async (string roomCode, ClaimsPrincipal principal, CinemaDb db, CancellationToken ct) =>
{
    if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Results.Unauthorized();
    var room = await db.WatchPartyRooms.SingleOrDefaultAsync(r => r.RoomCode == roomCode.ToUpperInvariant() && r.IsActive, ct);
    if (room is null) return Results.NotFound();
    if (room.HostUserAccountId == userId) return Results.Conflict(new { message = "The host must end the room rather than leave it." });
    var participant = await db.WatchPartyParticipants.SingleOrDefaultAsync(p => p.RoomId == room.Id && p.UserAccountId == userId, ct);
    if (participant is not null) { db.WatchPartyParticipants.Remove(participant); await db.SaveChangesAsync(ct); }
    return Results.NoContent();
}).RequireAuthorization();

app.MapHub<WatchPartyHub>("/hubs/watch-party");

app.Run();

static object CreateAuthResponse(UserAccount user, SymmetricSecurityKey key, bool isAdmin, string issuer, string audience)
{
    var claims = new[]
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new Claim(ClaimTypes.Name, user.Name),
        new Claim(ClaimTypes.Email, user.Email),
        new Claim("role", isAdmin ? "Admin" : "User")
    };
    var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
    var token = new JwtSecurityToken(issuer: issuer, audience: audience, claims: claims, expires: DateTime.UtcNow.AddHours(8), signingCredentials: credentials);
    return new { token = new JwtSecurityTokenHandler().WriteToken(token), name = user.Name, email = user.Email, expiresAtUtc = token.ValidTo };
}

public record MovieInput(string Title, string Genre, int Year, string? Synopsis, string? PosterUrl);
public record RegisterInput(string? Name, string? Email, string? Password);
public record LoginInput(string? Email, string? Password);
