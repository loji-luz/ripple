using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using Ripple.Api;
using Ripple.Data;
using Ripple.Domain;
using Testcontainers.PostgreSql;

namespace Ripple.Api.Tests;

/// <summary>The real API against a real Postgres in a container, with a clock the tests control.</summary>
public class ApiFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18-alpine").Build();
    public FakeTimeProvider Clock { get; } = new(new DateTimeOffset(2026, 10, 8, 15, 0, 0, TimeSpan.Zero));
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(host =>
        {
            host.UseSetting("ConnectionStrings:Default", _postgres.GetConnectionString());
            host.UseSetting("RateLimits:PerMinute", "100000");
            host.UseSetting("RateLimits:SimulationsPerMinute", "100000");
            host.UseSetting("RateLimits:SharesPerHour", "100000");
            // Whatever is in this machine's environment, the tests never call FRED.
            host.UseSetting("FRED_API_KEY", "");
            host.ConfigureServices(services =>
            {
                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(Clock);
            });
        });
    }

    /// <summary>The same API and database with different settings, for the rate limit tests.</summary>
    public WebApplicationFactory<Program> With(params (string Key, string Value)[] settings) =>
        Factory.WithWebHostBuilder(host =>
        {
            foreach (var (key, value) in settings) host.UseSetting(key, value);
        });

    public async Task<T> Db<T>(Func<IServiceProvider, Task<T>> work)
    {
        using var scope = Factory.Services.CreateScope();
        return await work(scope.ServiceProvider);
    }

    public async Task DisposeAsync()
    {
        await Factory.DisposeAsync();
        await _postgres.DisposeAsync();
    }
}

public class ApiTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private sealed record Problem(string? Title, string? Detail, int? Status, string? Code, Dictionary<string, string[]>? Errors);

    private HttpClient Client => fixture.Factory.CreateClient();

    /// <summary>The debt from the domain's hand-worked schedule: $1,000 at 12%, $300 a month, $500 goal.</summary>
    private static ScenarioInput OneDebt => new([new DebtInput("Card", 1000m, 12m, 25m)], 0m, 500m, 300m, 0m, []);

    private static async Task<T> Read<T>(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"{(int)response.StatusCode}: {body}");
        return JsonSerializer.Deserialize<T>(body, Json)!;
    }

    private static Task<HttpResponseMessage> Post(HttpClient client, string url, object body) => client.PostAsJsonAsync(url, body, Json);

    private async Task<string> Share(ScenarioInput input) =>
        (await Read<ShareDto>(await Post(Client, "/api/scenarios", input), HttpStatusCode.Created)).Code;

    // ---- health

    [Fact]
    public async Task The_health_check_reaches_the_database()
    {
        var response = await Client.GetAsync("/healthz");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    // ---- simulations

    [Fact]
    public async Task A_simulation_returns_all_three_strategies_month_by_month()
    {
        var simulation = await Read<SimulationDto>(await Post(Client, "/api/simulations", OneDebt));

        Assert.Equal(Simulator.EngineVersion, simulation.EngineVersion);
        Assert.Equal(1000m, simulation.TotalDebt);
        Assert.Equal(25m, simulation.TotalMinimums);
        Assert.Equal(300m, simulation.Budget);
        Assert.Equal(
            [Strategy.HighestInterestFirst, Strategy.SmallestDebtFirst, Strategy.HalfAndHalf],
            simulation.Strategies.Select(s => s.Strategy));
        Assert.Equal(["Highest interest first", "Smallest debt first", "50/50"], simulation.Strategies.Select(s => s.Label));

        // The same cents as the hand-worked schedule in the domain tests.
        var avalanche = simulation.Strategies[0];
        Assert.Equal(4, avalanche.DebtFreeMonth);
        Assert.Equal(6, avalanche.FundReachedMonth);
        Assert.Equal(22.48m, avalanche.TotalInterest);
        Assert.Equal(1022.48m, avalanche.TotalPaidToDebt);
        Assert.Equal([710.00m, 417.10m, 121.27m, 0m, 0m, 0m], avalanche.Months.Select(m => m.DebtBalance));
        Assert.Equal(new PayoffDto("Card", 4), avalanche.Payoffs.Single());

        Assert.Single(simulation.Strategies, s => s.Recommended);
        Assert.Equal(simulation.Recommendation.Strategy, simulation.Strategies.Single(s => s.Recommended).Strategy);
        Assert.False(string.IsNullOrWhiteSpace(simulation.Recommendation.Sentence));
    }

    [Fact]
    public async Task Strategies_go_over_the_wire_as_names_not_numbers()
    {
        var body = await (await Post(Client, "/api/simulations", OneDebt)).Content.ReadAsStringAsync();
        Assert.Contains("\"strategy\":\"HighestInterestFirst\"", body);
    }

    [Fact]
    public async Task The_what_if_extra_and_one_off_payments_change_the_answer()
    {
        var plain = await Read<SimulationDto>(await Post(Client, "/api/simulations", OneDebt));
        var withExtra = await Read<SimulationDto>(await Post(Client, "/api/simulations", OneDebt with { ExtraPerMonth = 100m }));
        var withOneOff = await Read<SimulationDto>(await Post(Client, "/api/simulations", OneDebt with { OneOffPayments = [new OneOffInput(2, 200m)] }));

        Assert.Equal(400m, withExtra.Budget);
        Assert.True(withExtra.Strategies[0].DebtFreeMonth < plain.Strategies[0].DebtFreeMonth);
        Assert.Equal(3, withOneOff.Strategies[0].DebtFreeMonth);
        Assert.Equal(19.27m, withOneOff.Strategies[0].TotalInterest);
    }

    [Fact]
    public async Task Invalid_input_comes_back_as_problem_details_with_an_error_per_field()
    {
        var response = await Post(Client, "/api/simulations", new { debts = new[] { new { name = "Card", balance = -5, apr = 250 } }, savings = 0, emergencyFundGoal = 0 });
        var problem = await Read<Problem>(response, HttpStatusCode.BadRequest);

        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal("Check the highlighted fields", problem.Title);
        Assert.Equal(
            ["debts[0].apr", "debts[0].balance", "debts[0].minimumPayment", "monthlyBudget"],
            problem.Errors!.Keys.Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task A_request_that_is_not_json_is_a_problem_too()
    {
        var response = await Client.PostAsync("/api/simulations", new StringContent("{ not json", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task A_budget_below_the_minimums_is_a_named_error_on_the_monthly_amount()
    {
        var input = new ScenarioInput([new DebtInput("Card", 2000m, 20m, 90m), new DebtInput("Loan", 5000m, 6m, 60m)], 0m, 0m, 100m, 0m, []);
        var problem = await Read<Problem>(await Post(Client, "/api/simulations", input), HttpStatusCode.UnprocessableEntity);

        Assert.Equal("BudgetBelowMinimums", problem.Code);
        Assert.Equal(
            "Your minimum payments add up to $150.00 a month, but the monthly amount is $100.00. Raise it to at least $150.00, or check the minimums.",
            problem.Errors!["monthlyBudget"].Single());
    }

    [Fact]
    public async Task A_payment_that_does_not_clear_the_debt_is_an_answer_not_an_error()
    {
        var growing = new ScenarioInput([new DebtInput("Card", 10000m, 24m, 100m)], 0m, 0m, 150m, 0m, []);
        var never = await Read<SimulationDto>(await Post(Client, "/api/simulations", growing));
        Assert.Empty(never.Strategies);
        Assert.Null(never.Recommendation);
        Assert.Equal(200.00m, never.Stalled!.MonthlyInterest);
        Assert.False(never.Stalled.Shrinking);
        Assert.Equal(60, never.Stalled.Balances.Count);
        Assert.Equal(10050.00m, never.Stalled.Balances[0]);
        Assert.True(never.Stalled.BudgetToClear > 200m);
        Assert.True(never.Stalled.BudgetForFiveYears >= never.Stalled.BudgetToClear);

        // Paying what it asks for gives a real comparison.
        var enough = await Read<SimulationDto>(await Post(Client, "/api/simulations", growing with { MonthlyBudget = never.Stalled.BudgetForFiveYears }));
        Assert.Null(enough.Stalled);
        Assert.All(enough.Strategies, s => Assert.True(s.DebtFreeMonth <= 60));

        var slow = new ScenarioInput([new DebtInput("Loan", 10000m, 12m, 100m)], 0m, 0m, 100.10m, 0m, []);
        var tooLong = await Read<SimulationDto>(await Post(Client, "/api/simulations", slow));
        Assert.True(tooLong.Stalled!.Shrinking);
    }

    [Fact]
    public async Task A_fund_that_cannot_be_filled_in_fifty_years_is_still_a_named_error()
    {
        var input = new ScenarioInput([new DebtInput("Card", 100m, 10m, 25m)], 0m, 1_000_000m, 100m, 0m, []);
        var tooLong = await Read<Problem>(await Post(Client, "/api/simulations", input), HttpStatusCode.UnprocessableEntity);
        Assert.Equal("TooLong", tooLong.Code);
        Assert.Contains("more than 50 years", tooLong.Errors!["monthlyBudget"].Single());
    }

    [Fact]
    public async Task More_than_twenty_debts_are_refused()
    {
        var debts = Enumerable.Range(1, 21).Select(i => new DebtInput($"Debt {i}", 100m, 10m, 10m)).ToList();
        var problem = await Read<Problem>(await Post(Client, "/api/simulations", OneDebt with { Debts = debts }), HttpStatusCode.BadRequest);
        Assert.StartsWith("Ripple compares up to 20 debts.", problem.Errors!["debts"].Single());
    }

    [Fact]
    public async Task A_simulation_stores_nothing()
    {
        var before = await fixture.Db(s => s.GetRequiredService<RippleDb>().Scenarios.CountAsync());
        await Read<SimulationDto>(await Post(Client, "/api/simulations", OneDebt));
        Assert.Equal(before, await fixture.Db(s => s.GetRequiredService<RippleDb>().Scenarios.CountAsync()));
    }

    // ---- sharing

    [Fact]
    public async Task A_shared_scenario_comes_back_exactly_as_it_was_saved()
    {
        var input = new ScenarioInput(
            [new DebtInput("Card", 2200m, 22m, 55m), new DebtInput("Student loan", 20000m, 5.5m, 330m)],
            5300m, 8000m, 600m, 75m, [new OneOffInput(3, 500m)]);

        var response = await Post(Client, "/api/scenarios", input);
        var code = (await Read<ShareDto>(response, HttpStatusCode.Created)).Code;
        Assert.True(ShareCode.LooksValid(code));
        Assert.Equal($"/api/scenarios/{code}", response.Headers.Location!.ToString());

        var saved = await Read<SavedScenarioDto>(await Client.GetAsync($"/api/scenarios/{code}"));
        Assert.Equal(code, saved.Code);
        Assert.Equal(Simulator.EngineVersion, saved.EngineVersion);
        Assert.Equal(fixture.Clock.GetUtcNow(), saved.CreatedAt);
        Assert.Equal(input.Debts, saved.Input.Debts);
        Assert.Equal(input.OneOffPayments, saved.Input.OneOffPayments);
        Assert.Equal(input with { Debts = null, OneOffPayments = null }, saved.Input with { Debts = null, OneOffPayments = null });
    }

    [Fact]
    public async Task The_input_is_stored_as_jsonb_with_the_engine_version()
    {
        var code = await Share(OneDebt);
        var (type, version) = await fixture.Db(async s =>
        {
            var db = s.GetRequiredService<RippleDb>();
            var row = await db.Scenarios.SingleAsync(x => x.Code == code);
            var columnType = await db.Database.SqlQuery<string>($"select pg_typeof(input)::text as \"Value\" from scenarios where code = {code}").SingleAsync();
            return (columnType, row.EngineVersion);
        });
        Assert.Equal("jsonb", type);
        Assert.Equal(Simulator.EngineVersion, version);
    }

    [Fact]
    public async Task Invalid_input_is_not_saved()
    {
        var before = await fixture.Db(s => s.GetRequiredService<RippleDb>().Scenarios.CountAsync());
        var problem = await Read<Problem>(await Post(Client, "/api/scenarios", OneDebt with { MonthlyBudget = null }), HttpStatusCode.BadRequest);
        Assert.Contains("monthlyBudget", problem.Errors!.Keys);
        Assert.Equal(before, await fixture.Db(s => s.GetRequiredService<RippleDb>().Scenarios.CountAsync()));
    }

    [Theory]
    [InlineData("zzzzzzzz")] // well formed, never issued
    [InlineData("nope")]
    [InlineData("ABCDEFGH")]
    public async Task An_unknown_code_is_not_found_and_says_why(string code)
    {
        var problem = await Read<Problem>(await Client.GetAsync($"/api/scenarios/{code}"), HttpStatusCode.NotFound);
        Assert.Equal("Shared plan not found", problem.Title);
        Assert.Contains("12 months", problem.Detail);
    }

    [Fact]
    public async Task Opening_a_scenario_keeps_it_and_twelve_months_unopened_removes_it()
    {
        var opened = await Share(OneDebt);
        var forgotten = await Share(OneDebt);

        fixture.Clock.Advance(TimeSpan.FromDays(200));
        await Read<SavedScenarioDto>(await Client.GetAsync($"/api/scenarios/{opened}"));
        var lastOpened = await fixture.Db(s => s.GetRequiredService<RippleDb>().Scenarios.Where(x => x.Code == opened).Select(x => x.LastOpenedAt).SingleAsync());
        Assert.Equal(fixture.Clock.GetUtcNow(), lastOpened);

        // 366 days after sharing: one was opened 166 days ago, the other never.
        fixture.Clock.Advance(TimeSpan.FromDays(166));
        await fixture.Db(s => s.GetRequiredService<ScenarioStore>().DeleteStale(CancellationToken.None));

        Assert.Equal(HttpStatusCode.NotFound, (await Client.GetAsync($"/api/scenarios/{forgotten}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client.GetAsync($"/api/scenarios/{opened}")).StatusCode);
    }

    [Fact]
    public async Task A_scenario_opened_eleven_months_ago_is_kept()
    {
        var code = await Share(OneDebt);
        fixture.Clock.Advance(TimeSpan.FromDays(330));
        await fixture.Db(s => s.GetRequiredService<ScenarioStore>().DeleteStale(CancellationToken.None));
        Assert.Equal(HttpStatusCode.OK, (await Client.GetAsync($"/api/scenarios/{code}")).StatusCode);
    }

    // ---- examples

    [Fact]
    public async Task The_examples_say_where_their_numbers_come_from_and_every_one_can_be_simulated()
    {
        var examples = await Read<List<ExampleDto>>(await Client.GetAsync("/api/examples"));

        Assert.Equal(Examples.All.Select(e => e.Slug), examples.Select(e => e.Slug));
        Assert.Equal(3, examples.Count);
        foreach (var example in examples)
        {
            Assert.Contains("2022 Survey of Consumer Finances", example.Source);
            Assert.Contains("assumptions, not survey data", example.Source);
            Assert.False(example.Illustrative);
            var simulation = await Read<SimulationDto>(await Post(Client, "/api/simulations", example.Input));
            Assert.All(simulation.Strategies, s => Assert.True(s.DebtFreeMonth > 0));
        }
    }

    [Fact]
    public async Task Seeding_twice_does_not_duplicate_the_examples()
    {
        await fixture.Db(async s => { await Examples.Seed(s.GetRequiredService<RippleDb>()); return 0; });
        Assert.Equal(Examples.All.Count, await fixture.Db(s => s.GetRequiredService<RippleDb>().ExampleHouseholds.CountAsync()));
    }

    // ---- reference rates

    [Fact]
    public async Task There_is_no_rate_until_one_is_imported_and_then_the_newest_is_returned()
    {
        // No key and no import: an empty list, never a made-up figure.
        Assert.Empty(await Read<List<ReferenceRateDto>>(await Client.GetAsync("/api/reference-rates")));

        var fredJson = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Fixtures", "fred-observations.json"));
        var (value, date) = Fred.LatestObservation(fredJson)!.Value;
        await fixture.Db(async s =>
        {
            var store = s.GetRequiredService<ReferenceRateStore>();
            await store.Store(Fred.CardRateSeries, 22.25m, new DateOnly(2025, 8, 1), CancellationToken.None);
            await store.Store(Fred.CardRateSeries, value, date, CancellationToken.None);
            // Importing the same date again refreshes the row instead of adding one.
            await store.Store(Fred.CardRateSeries, value, date, CancellationToken.None);
            return 0;
        });

        var rate = Assert.Single(await Read<List<ReferenceRateDto>>(await Client.GetAsync("/api/reference-rates")));
        Assert.Equal("TERMCBCCINTNS", rate.SeriesId);
        Assert.Equal(21.47m, rate.Value);
        Assert.Equal("percent a year", rate.Unit);
        Assert.Equal(new DateOnly(2026, 5, 1), rate.ObservedDate);
        Assert.Equal(fixture.Clock.GetUtcNow(), rate.RetrievedAt);
        Assert.Equal(2, await fixture.Db(s => s.GetRequiredService<RippleDb>().ReferenceRates.CountAsync()));
    }

    // ---- limits

    private static HttpRequestMessage From(string address, HttpMethod method, string url, object? body = null) =>
        new(method, url) { Headers = { { "X-Forwarded-For", address } }, Content = body is null ? null : JsonContent.Create(body, options: Json) };

    [Fact]
    public async Task Simulations_are_limited_per_visitor_and_the_refusal_says_when_to_retry()
    {
        using var api = fixture.With(("RateLimits:SimulationsPerMinute", "2"));
        var client = api.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(From("203.0.113.7", HttpMethod.Post, "/api/simulations", OneDebt))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(From("203.0.113.7", HttpMethod.Post, "/api/simulations", OneDebt))).StatusCode);

        var refused = await client.SendAsync(From("203.0.113.7", HttpMethod.Post, "/api/simulations", OneDebt));
        var problem = await Read<Problem>(refused, HttpStatusCode.TooManyRequests);
        Assert.Equal("Too many requests", problem.Title);
        Assert.InRange(int.Parse(refused.Headers.GetValues("Retry-After").Single()), 1, 60);

        // The visitor's address comes from the forwarded header, so someone else is not affected.
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(From("203.0.113.8", HttpMethod.Post, "/api/simulations", OneDebt))).StatusCode);
        // Other endpoints have their own allowance.
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(From("203.0.113.7", HttpMethod.Get, "/api/examples"))).StatusCode);
    }

    [Fact]
    public async Task Sharing_is_limited_per_hour()
    {
        using var api = fixture.With(("RateLimits:SharesPerHour", "1"));
        var client = api.CreateClient();

        Assert.Equal(HttpStatusCode.Created, (await client.SendAsync(From("203.0.113.20", HttpMethod.Post, "/api/scenarios", OneDebt))).StatusCode);
        var refused = await client.SendAsync(From("203.0.113.20", HttpMethod.Post, "/api/scenarios", OneDebt));
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.InRange(int.Parse(refused.Headers.GetValues("Retry-After").Single()), 1, 3600);
    }

    [Fact]
    public async Task Every_endpoint_shares_the_general_limit()
    {
        using var api = fixture.With(("RateLimits:PerMinute", "3"));
        var client = api.CreateClient();
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(From("203.0.113.30", HttpMethod.Get, "/api/examples"))).StatusCode);

        var refused = await client.SendAsync(From("203.0.113.30", HttpMethod.Get, "/api/reference-rates"));
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.True(refused.Headers.Contains("Retry-After"));
        // The health check is never limited.
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(From("203.0.113.30", HttpMethod.Get, "/healthz"))).StatusCode);
    }

    [Fact]
    public async Task A_body_over_32_kb_is_refused()
    {
        var huge = OneDebt with { Debts = [new DebtInput(new string('x', 40_000), 1000m, 12m, 25m)] };
        // StringContent sends a Content-Length, as a browser does.
        var body = new StringContent(JsonSerializer.Serialize(huge, Json), Encoding.UTF8, "application/json");
        var problem = await Read<Problem>(await Client.PostAsync("/api/simulations", body), HttpStatusCode.RequestEntityTooLarge);
        Assert.Equal("That request is too large", problem.Title);
    }
}
