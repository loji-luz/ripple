using Ripple.Api;

namespace Ripple.Api.Tests;

/// <summary>
/// Parsing FRED's response. Fixtures/fred-observations.json has the shape FRED returns for
/// series/observations with file_type=json. Its values are there to exercise the parser and
/// are not real observations.
/// </summary>
public class FredTests
{
    private static readonly string Fixture = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "fred-observations.json"));

    [Fact]
    public void The_latest_observation_with_a_value_is_used_and_missing_ones_are_skipped()
    {
        // The newest entry in the fixture, 2026-08-01, has the value "." and must not be picked.
        var latest = Fred.LatestObservation(Fixture);
        Assert.Equal((21.47m, new DateOnly(2026, 5, 1)), latest);
    }

    [Fact]
    public void The_order_of_the_observations_does_not_matter()
    {
        const string ascending = """{"observations":[{"date":"2025-02-01","value":"20.10"},{"date":"2025-05-01","value":"20.35"},{"date":"2025-08-01","value":"."}]}""";
        Assert.Equal((20.35m, new DateOnly(2025, 5, 1)), Fred.LatestObservation(ascending));
    }

    [Theory]
    [InlineData("""{"observations":[]}""")]
    [InlineData("""{"observations":[{"date":"2025-08-01","value":"."}]}""")]
    [InlineData("""{"observations":[{"date":"not a date","value":"20.1"},{"value":"20.1"},{"date":"2025-08-01","value":20.1}]}""")]
    [InlineData("""{"error_code":400,"error_message":"Bad Request. The value for variable api_key is not registered."}""")]
    public void With_nothing_usable_there_is_no_rate(string json) => Assert.Null(Fred.LatestObservation(json));

    [Fact]
    public void The_request_asks_for_the_card_rate_series_as_json()
    {
        var url = Fred.ObservationsUrl(Fred.CardRateSeries, "abc123").ToString();
        Assert.StartsWith("https://api.stlouisfed.org/fred/series/observations?", url);
        Assert.Contains("series_id=TERMCBCCINTNS", url);
        Assert.Contains("file_type=json", url);
        Assert.Contains("api_key=abc123", url);
    }
}

public class ShareCodeTests
{
    [Fact]
    public void Codes_are_eight_characters_from_an_alphabet_without_lookalikes()
    {
        var codes = Enumerable.Range(0, 200).Select(_ => ShareCode.New()).ToList();
        Assert.All(codes, code =>
        {
            Assert.Equal(8, code.Length);
            Assert.True(ShareCode.LooksValid(code));
            Assert.DoesNotContain(code, c => "01ilo".Contains(c) || char.IsUpper(c));
        });
        Assert.Equal(200, codes.Distinct().Count());
    }

    [Theory]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("abcdefg1")]
    [InlineData("ABCDEFGH")]
    [InlineData("abcdefghj")]
    [InlineData("abcd-fgh")]
    public void Anything_else_is_not_a_code(string code) => Assert.False(ShareCode.LooksValid(code));
}

public class ValidationTests
{
    private static ScenarioInput Valid => new([new DebtInput("Card", 1000m, 12m, 25m)], 0m, 500m, 300m, 0m, []);

    [Fact]
    public void A_complete_request_becomes_a_scenario()
    {
        var (scenario, errors) = Validation.Check(Valid);
        Assert.Empty(errors);
        Assert.Equal(1000m, scenario!.Debts[0].Balance);
        Assert.Equal(12m, scenario.Debts[0].AprPercent);
        Assert.Equal(300m, scenario.MonthlyBudget);
    }

    [Fact]
    public void Money_is_rounded_to_the_cent_and_names_are_trimmed()
    {
        var (scenario, _) = Validation.Check(Valid with { Debts = [new DebtInput("  Card  ", 1000.005m, 12.34567m, 25.004m)], Savings = 0.1m + 0.2m });
        Assert.Equal(new Ripple.Domain.Debt("Card", 1000.01m, 12.346m, 25.00m), scenario!.Debts[0]);
        Assert.Equal(0.30m, scenario.Savings);
    }

    [Fact]
    public void Missing_values_are_reported_by_field_with_what_to_do()
    {
        var (scenario, errors) = Validation.Check(new ScenarioInput([new DebtInput(" ", null, null, null)], null, null, null, null, null));
        Assert.Null(scenario);
        Assert.Equal(
            ["debts[0].apr", "debts[0].balance", "debts[0].minimumPayment", "debts[0].name", "emergencyFundGoal", "monthlyBudget", "savings"],
            errors.Keys.Order(StringComparer.Ordinal));
        Assert.Equal("Enter the balance owed.", errors["debts[0].balance"][0]);
        Assert.StartsWith("Enter the amount you can put towards debt and savings", errors["monthlyBudget"][0]);
    }

    [Fact]
    public void Out_of_range_values_are_refused()
    {
        var (_, errors) = Validation.Check(Valid with
        {
            Debts = [new DebtInput(new string('x', 41), 0m, 100.5m, -1m)],
            MonthlyBudget = 0m,
            EmergencyFundGoal = 10_000_000.01m,
            OneOffPayments = [new OneOffInput(0, 100m), new OneOffInput(601, 100m), new OneOffInput(3, 0m)],
        });
        Assert.Equal("Enter a balance above $0, or remove this debt.", errors["debts[0].balance"][0]);
        Assert.Equal("Enter an APR between 0 and 100%.", errors["debts[0].apr"][0]);
        Assert.Equal("Enter an amount of $0 or more.", errors["debts[0].minimumPayment"][0]);
        Assert.Equal("Shorten the name to 40 characters or fewer.", errors["debts[0].name"][0]);
        Assert.Equal("Enter a monthly amount above $0.", errors["monthlyBudget"][0]);
        Assert.Equal("Enter an amount of $10,000,000.00 or less.", errors["emergencyFundGoal"][0]);
        Assert.Contains("oneOffPayments[0].month", errors.Keys);
        Assert.Contains("oneOffPayments[1].month", errors.Keys);
        Assert.Contains("oneOffPayments[2].amount", errors.Keys);
    }

    [Fact]
    public void No_debts_and_too_many_debts_are_both_refused()
    {
        Assert.Equal("Add at least one debt.", Validation.Check(Valid with { Debts = [] }).Errors["debts"][0]);
        Assert.Equal("Add at least one debt.", Validation.Check(null).Errors["debts"][0]);

        var twentyOne = Enumerable.Range(1, 21).Select(i => new DebtInput($"Debt {i}", 100m, 10m, 10m)).ToList();
        Assert.Equal("Ripple compares up to 20 debts. Remove 1 or combine some.", Validation.Check(Valid with { Debts = twentyOne, MonthlyBudget = 500m }).Errors["debts"][0]);
        Assert.NotNull(Validation.Check(Valid with { Debts = twentyOne[..20], MonthlyBudget = 500m }).Scenario);
    }

    [Fact]
    public void Zero_is_fine_for_apr_minimum_savings_and_goal()
    {
        var (scenario, errors) = Validation.Check(new ScenarioInput([new DebtInput("Family loan", 500m, 0m, 0m)], 0m, 0m, 50m, null, null));
        Assert.Empty(errors);
        Assert.Equal(0m, scenario!.ExtraPerMonth);
        Assert.Empty(scenario.OneOffPayments!);
    }
}
