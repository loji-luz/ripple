using Ripple.Domain;

namespace Ripple.Api;

// What goes over the wire. web/lib/api.ts mirrors these.
// Every input field is nullable so a missing value becomes a message beside its field
// instead of a failure to read the request.

public sealed record DebtInput(string? Name, decimal? Balance, decimal? Apr, decimal? MinimumPayment);

public sealed record OneOffInput(int? Month, decimal? Amount);

public sealed record ScenarioInput(
    List<DebtInput>? Debts,
    decimal? Savings,
    decimal? EmergencyFundGoal,
    decimal? MonthlyBudget,
    decimal? ExtraPerMonth,
    List<OneOffInput>? OneOffPayments)
{
    /// <summary>The checked and rounded scenario, in the shape it is saved and sent back.</summary>
    public static ScenarioInput From(Scenario scenario) => new(
        [.. scenario.Debts.Select(d => new DebtInput(d.Name, d.Balance, d.AprPercent, d.MinimumPayment))],
        scenario.Savings,
        scenario.EmergencyFundGoal,
        scenario.MonthlyBudget,
        scenario.ExtraPerMonth,
        [.. (scenario.OneOffPayments ?? []).Select(p => new OneOffInput(p.Month, p.Amount))]);
}

public sealed record MonthDto(int Month, decimal Interest, decimal DebtPayment, decimal SavingsContribution, decimal DebtBalance, decimal SavingsBalance);

public sealed record PayoffDto(string Name, int Month);

public sealed record StrategyDto(
    Strategy Strategy,
    string Label,
    bool Recommended,
    int DebtFreeMonth,
    int FundReachedMonth,
    decimal TotalInterest,
    decimal TotalPaidToDebt,
    List<PayoffDto> Payoffs,
    List<MonthDto> Months);

/// <summary>The answer when the payment does not clear the debt: see <see cref="Stalled"/>.</summary>
public sealed record StalledDto(decimal MonthlyInterest, bool Shrinking, decimal BudgetToClear, decimal BudgetForFiveYears, List<decimal> Balances);

public sealed record RecommendationDto(Strategy Strategy, string Label, RecommendationReason Reason, string Sentence);

/// <summary>All money is US dollars. Month 1 is the first month of the plan.</summary>
public sealed record SimulationDto(
    string EngineVersion,
    decimal TotalDebt,
    decimal TotalMinimums,
    decimal Budget,
    RecommendationDto? Recommendation,
    List<StrategyDto> Strategies,
    StalledDto? Stalled = null)
{
    /// <summary>No strategies to compare: the payment does not clear the debt, and this says what would.</summary>
    public static SimulationDto From(Scenario scenario, Stalled stalled) => new(
        Simulator.EngineVersion,
        scenario.TotalDebt,
        scenario.TotalMinimums,
        scenario.BudgetWithExtra,
        null,
        [],
        new StalledDto(stalled.MonthlyInterest, stalled.Shrinking, stalled.BudgetToClear, stalled.BudgetForFiveYears, [.. stalled.Balances]));

    public static SimulationDto From(Scenario scenario, Comparison comparison) => new(
        Simulator.EngineVersion,
        scenario.TotalDebt,
        scenario.TotalMinimums,
        scenario.BudgetWithExtra,
        new RecommendationDto(comparison.Recommendation.Strategy, Planner.Label(comparison.Recommendation.Strategy), comparison.Recommendation.Reason, comparison.Recommendation.Sentence),
        [.. comparison.Strategies.Select(s => new StrategyDto(
            s.Strategy,
            Planner.Label(s.Strategy),
            s.Strategy == comparison.Recommendation.Strategy,
            s.DebtFreeMonth,
            s.FundReachedMonth,
            s.TotalInterest,
            s.TotalPaidToDebt,
            [.. s.Payoffs.Select(p => new PayoffDto(p.Name, p.Month))],
            [.. s.Months.Select(m => new MonthDto(m.Month, m.Interest, m.DebtPayment, m.SavingsContribution, m.DebtBalance, m.SavingsBalance))]))]);
}

public sealed record ShareDto(string Code);

public sealed record SavedScenarioDto(string Code, ScenarioInput Input, string EngineVersion, DateTimeOffset CreatedAt);

/// <param name="Unit">Always "percent a year".</param>
public sealed record ReferenceRateDto(string SeriesId, string Label, decimal Value, string Unit, DateOnly ObservedDate, DateTimeOffset RetrievedAt, string Source, string SourceUrl);

/// <param name="Illustrative">True when the numbers are made up for illustration, not taken from data.</param>
public sealed record ExampleDto(string Slug, string Title, string Summary, string Source, bool Illustrative, ScenarioInput Input);
