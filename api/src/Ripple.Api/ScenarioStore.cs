using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Ripple.Data;
using Ripple.Domain;

namespace Ripple.Api;

/// <summary>The short code in a share link. Random, lower case, and without 0, 1, i, l and o.</summary>
public static class ShareCode
{
    public const int Length = 8;
    private const string Alphabet = "23456789abcdefghjkmnpqrstuvwxyz";

    public static string New() => RandomNumberGenerator.GetString(Alphabet, Length);

    public static bool LooksValid(string code) => code.Length == Length && code.All(Alphabet.Contains);
}

/// <summary>Shared scenarios. Nothing reaches the database until someone presses Share.</summary>
public class ScenarioStore(RippleDb db, TimeProvider time)
{
    /// <summary>Scenarios not opened for this long are deleted by the daily clean-up.</summary>
    public static readonly int KeepForMonths = 12;

    public async Task<string> Save(Scenario scenario, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        var input = JsonSerializer.Serialize(ScenarioInput.From(scenario), Examples.Json);
        // A clash between two random codes is very unlikely; if it happens, draw again.
        for (var attempt = 0; ; attempt++)
        {
            var saved = new SavedScenario { Code = ShareCode.New(), Input = input, EngineVersion = Simulator.EngineVersion, CreatedAt = now, LastOpenedAt = now };
            db.Scenarios.Add(saved);
            try
            {
                await db.SaveChangesAsync(ct);
                return saved.Code;
            }
            catch (DbUpdateException e) when (attempt < 3 && e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                db.Entry(saved).State = EntityState.Detached;
            }
        }
    }

    /// <summary>Loads a scenario and notes that it was opened, which keeps it from being cleaned up.</summary>
    public async Task<SavedScenarioDto?> Open(string code, CancellationToken ct)
    {
        if (!ShareCode.LooksValid(code)) return null;
        var saved = await db.Scenarios.FirstOrDefaultAsync(s => s.Code == code, ct);
        if (saved is null) return null;

        saved.LastOpenedAt = time.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return new SavedScenarioDto(saved.Code, JsonSerializer.Deserialize<ScenarioInput>(saved.Input, Examples.Json)!, saved.EngineVersion, saved.CreatedAt);
    }

    /// <summary>Deletes scenarios nobody has opened for twelve months. Returns how many went.</summary>
    public Task<int> DeleteStale(CancellationToken ct)
    {
        var cutoff = time.GetUtcNow().AddMonths(-KeepForMonths);
        return db.Scenarios.Where(s => s.LastOpenedAt < cutoff).ExecuteDeleteAsync(ct);
    }
}

/// <summary>Runs the clean-up once a day for as long as the API is up.</summary>
public class ScenarioCleanupService(IServiceScopeFactory scopes, TimeProvider time, ILogger<ScenarioCleanupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var deleted = await scope.ServiceProvider.GetRequiredService<ScenarioStore>().DeleteStale(stoppingToken);
                if (deleted > 0) logger.LogInformation("Deleted {Count} shared scenarios not opened for {Months} months", deleted, ScenarioStore.KeepForMonths);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                logger.LogError(e, "The scenario clean-up failed; it will run again tomorrow");
            }

            await Task.Delay(TimeSpan.FromDays(1), time, stoppingToken);
        }
    }
}
