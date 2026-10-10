using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Ripple.Api;
using Ripple.Data;
using Ripple.Domain;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<RippleDb>(o => o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<ScenarioStore>();
builder.Services.AddScoped<ReferenceRateStore>();
builder.Services.AddHttpClient();
builder.Services.AddHostedService<ScenarioCleanupService>();
builder.Services.AddHostedService<FredImportService>();
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks().AddDbContextCheck<RippleDb>();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Requests arrive through the web app's /api rewrite, so the visitor's address is in the
// forwarded header. Without this every visitor would share one rate limit.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

// Nothing here is sensitive. The limits keep bots from running up the hosting bill or filling
// the database. The numbers are starting values, set in configuration.
var limits = builder.Configuration.GetSection("RateLimits");
var perMinute = limits.GetValue("PerMinute", 60);
var simulationsPerMinute = limits.GetValue("SimulationsPerMinute", 20);
var sharesPerHour = limits.GetValue("SharesPerHour", 10);
const int maxBodyBytes = 32 * 1024;
static string Client(HttpContext http) => http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
static RateLimitPartition<string> Window(HttpContext http, int permits, TimeSpan window) =>
    RateLimitPartition.GetFixedWindowLimiter(Client(http), _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = window });

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http => Window(http, perMinute, TimeSpan.FromMinutes(1)));
    // The simulation is the only real work the API does, so it has a tighter limit of its own.
    o.AddPolicy("simulations", http => Window(http, simulationsPerMinute, TimeSpan.FromMinutes(1)));
    // Sharing is the only thing that writes a row.
    o.AddPolicy("shares", http => Window(http, sharesPerHour, TimeSpan.FromHours(1)));
    o.OnRejected = async (context, ct) =>
    {
        var seconds = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry) ? Math.Max(1, (int)Math.Ceiling(retry.TotalSeconds)) : 60;
        context.HttpContext.Response.Headers.RetryAfter = seconds.ToString();
        await Results.Problem(title: "Too many requests", detail: $"Try again in {seconds} seconds.", statusCode: 429).ExecuteAsync(context.HttpContext);
    };
});
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = maxBodyBytes);

var app = builder.Build();

app.UseForwardedHeaders();
// A request that cannot be read (bad JSON, wrong types) is the caller's mistake: 400, not 500.
app.UseExceptionHandler(new ExceptionHandlerOptions { StatusCodeSelector = e => e is BadHttpRequestException bad ? bad.StatusCode : StatusCodes.Status500InternalServerError });
app.UseStatusCodePages();
app.UseRateLimiter();

// Kestrel enforces the body cap while reading. This turns an honest Content-Length into a
// readable answer before anything is read.
app.Use(async (http, next) =>
{
    if (http.Request.ContentLength > maxBodyBytes)
    {
        await Results.Problem(title: "That request is too large", detail: "Ripple accepts up to 32 KB. Remove some debts or one-off payments.", statusCode: 413).ExecuteAsync(http);
        return;
    }
    await next(http);
});

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<RippleDb>();
    await db.Database.MigrateAsync();
    await Examples.Seed(db);
}

app.MapHealthChecks("/healthz").DisableRateLimiting();
app.MapOpenApi();

var api = app.MapGroup("/api");

// Stateless: inputs in, all three strategies out. Nothing is stored.
api.MapPost("/simulations", (ScenarioInput input) =>
{
    var (scenario, errors) = Validation.Check(input);
    if (scenario is null) return Results.ValidationProblem(errors, title: "Check the highlighted fields");

    var (comparison, failure) = Planner.Compare(scenario);
    if (failure is null) return Results.Ok(SimulationDto.From(scenario, comparison!));
    // A payment too small to clear the debt is still an answer: show where it leads and what
    // would work, rather than refusing the numbers.
    if (failure.Error is PlanError.DebtNeverClears or PlanError.TooLong && Simulator.Stall(scenario) is { } stalled)
        return Results.Ok(SimulationDto.From(scenario, stalled));
    return Validation.Problem(failure);
}).RequireRateLimiting("simulations");

api.MapPost("/scenarios", async (ScenarioInput input, ScenarioStore store, CancellationToken ct) =>
{
    var (scenario, errors) = Validation.Check(input);
    if (scenario is null) return Results.ValidationProblem(errors, title: "Check the highlighted fields");

    var code = await store.Save(scenario, ct);
    return Results.Created($"/api/scenarios/{code}", new ShareDto(code));
}).RequireRateLimiting("shares");

api.MapGet("/scenarios/{code}", async (string code, ScenarioStore store, CancellationToken ct) =>
    await store.Open(code, ct) is { } saved
        ? Results.Ok(saved)
        : Results.Problem(title: "Shared plan not found", detail: "This link is wrong, or the plan was removed after 12 months without being opened.", statusCode: 404));

api.MapGet("/reference-rates", (ReferenceRateStore rates, CancellationToken ct) => rates.Latest(ct));

api.MapGet("/examples", async (RippleDb db, CancellationToken ct) =>
    (await db.ExampleHouseholds.AsNoTracking().OrderBy(e => e.SortOrder).ToListAsync(ct))
        .Select(e => new ExampleDto(e.Slug, e.Title, e.Summary, e.Source, e.Illustrative, JsonSerializer.Deserialize<ScenarioInput>(e.Input, Examples.Json)!)));

app.Run();

/// <summary>Exposed so the integration tests can start the API in-process.</summary>
public partial class Program;
