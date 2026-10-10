using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ripple.Data;

namespace Ripple.Api;

/// <summary>
/// The one outside number Ripple shows: the average credit card interest rate, from FRED
/// (Federal Reserve Bank of St. Louis). It is only ever shown if it was really imported.
/// With no API key, or before the first import, there is no rate and the app says so.
/// </summary>
public static class Fred
{
    /// <summary>Commercial bank interest rate on credit card plans, accounts assessed interest. Quarterly, percent.</summary>
    public const string CardRateSeries = "TERMCBCCINTNS";

    public const string CardRateLabel = "Average US credit card rate, accounts charged interest";
    public const string Source = "Board of Governors of the Federal Reserve System, via FRED, Federal Reserve Bank of St. Louis";
    public const string SourceUrl = "https://fred.stlouisfed.org/series/" + CardRateSeries;

    public static Uri ObservationsUrl(string seriesId, string apiKey) =>
        new($"https://api.stlouisfed.org/fred/series/observations?series_id={Uri.EscapeDataString(seriesId)}&api_key={Uri.EscapeDataString(apiKey)}&file_type=json&sort_order=desc&limit=24");

    /// <summary>
    /// The most recent observation that has a value. FRED writes "." when a period has no
    /// value yet; those are skipped. Returns null when nothing usable is in the response.
    /// </summary>
    public static (decimal Value, DateOnly Date)? LatestObservation(string json)
    {
        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("observations", out var observations) || observations.ValueKind != JsonValueKind.Array) return null;

        (decimal Value, DateOnly Date)? latest = null;
        foreach (var observation in observations.EnumerateArray())
        {
            if (!observation.TryGetProperty("value", out var value) || !observation.TryGetProperty("date", out var date)) continue;
            if (value.ValueKind != JsonValueKind.String || date.ValueKind != JsonValueKind.String) continue;
            if (!decimal.TryParse(value.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var number)) continue;
            if (!DateOnly.TryParseExact(date.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) continue;
            if (latest is null || day > latest.Value.Date) latest = (number, day);
        }
        return latest;
    }
}

public class ReferenceRateStore(RippleDb db, TimeProvider time)
{
    /// <summary>Stores an observation, or refreshes it if that date is already there.</summary>
    public async Task Store(string seriesId, decimal value, DateOnly observedDate, CancellationToken ct)
    {
        var rate = await db.ReferenceRates.FirstOrDefaultAsync(r => r.SeriesId == seriesId && r.ObservedDate == observedDate, ct);
        if (rate is null) db.ReferenceRates.Add(rate = new ReferenceRate { SeriesId = seriesId, ObservedDate = observedDate });
        rate.Value = value;
        rate.RetrievedAt = time.GetUtcNow();
        await db.SaveChangesAsync(ct);
    }

    /// <summary>The newest observation of each series. Empty until something has been imported.</summary>
    public async Task<List<ReferenceRateDto>> Latest(CancellationToken ct)
    {
        var latest = await db.ReferenceRates
            .Where(r => r.SeriesId == Fred.CardRateSeries)
            .OrderByDescending(r => r.ObservedDate)
            .FirstOrDefaultAsync(ct);
        return latest is null
            ? []
            : [new ReferenceRateDto(latest.SeriesId, Fred.CardRateLabel, latest.Value, "percent a year", latest.ObservedDate, latest.RetrievedAt, Fred.Source, Fred.SourceUrl)];
    }
}

/// <summary>
/// Fetches the card rate from FRED once a day. The key is read from configuration
/// (<c>FRED_API_KEY</c>) and never leaves the server. Without a key this does nothing.
/// </summary>
public class FredImportService(IServiceScopeFactory scopes, IHttpClientFactory http, IConfiguration configuration, TimeProvider time, ILogger<FredImportService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var key = configuration["FRED_API_KEY"];
        if (string.IsNullOrWhiteSpace(key))
        {
            logger.LogInformation("FRED_API_KEY is not set, so no card rate is imported and the app shows none");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var imported = await Import(key, stoppingToken);
                if (imported is null) logger.LogWarning("FRED returned no usable observation for {Series}", Fred.CardRateSeries);
                else logger.LogInformation("Imported {Series}: {Value}% for {Date}", Fred.CardRateSeries, imported.Value.Value, imported.Value.Date);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // The key is part of the request address, so log the kind of failure and not the exception text.
                logger.LogError("The FRED import failed ({Kind}); it will run again tomorrow", e.GetType().Name);
            }

            await Task.Delay(TimeSpan.FromDays(1), time, stoppingToken);
        }
    }

    private async Task<(decimal Value, DateOnly Date)?> Import(string key, CancellationToken ct)
    {
        using var client = http.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(20);
        using var response = await client.GetAsync(Fred.ObservationsUrl(Fred.CardRateSeries, key), ct);
        response.EnsureSuccessStatusCode();
        var latest = Fred.LatestObservation(await response.Content.ReadAsStringAsync(ct));
        if (latest is null) return null;

        using var scope = scopes.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ReferenceRateStore>().Store(Fred.CardRateSeries, latest.Value.Value, latest.Value.Date, ct);
        return latest;
    }
}
