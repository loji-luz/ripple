using System.Globalization;

namespace Ripple.Domain;

/// <summary>
/// Runs all three strategies and picks the one marked Recommended.
///
/// How the recommendation is chosen:
///  1. The cheapest strategy is the one with the lowest total interest. Ties go to the earlier
///     debt-free month, then the earlier fund month, then the order Highest interest first,
///     Smallest debt first, Half and half.
///  2. One exception, for a thin cushion. Half and half is recommended instead when all of
///     these hold:
///       - savings are below the emergency fund goal,
///       - savings are less than one month of the budget (<see cref="ThinCushionMonths"/>),
///       - Half and half fills the fund sooner than the cheapest strategy, and
///       - it leaves the debt at most <see cref="MaxDebtFreeDelayMonths"/> months later.
///     With almost nothing saved, one surprise bill goes back on a card, so a short delay is
///     treated as worth it. A longer delay is not, and the cheapest strategy stands.
///
/// The sentence that goes in the heading is written here too, so the reason and the rule can
/// never disagree.
/// </summary>
public static class Planner
{
    public const int ThinCushionMonths = 1;
    public const int MaxDebtFreeDelayMonths = 3;

    public static readonly IReadOnlyList<Strategy> Strategies = [Strategy.HighestInterestFirst, Strategy.SmallestDebtFirst, Strategy.HalfAndHalf];

    public static string Label(Strategy strategy) => strategy switch
    {
        Strategy.HighestInterestFirst => "Highest interest first",
        Strategy.SmallestDebtFirst => "Smallest debt first",
        _ => "50/50",
    };

    public static (Comparison? Comparison, PlanFailure? Failure) Compare(Scenario scenario)
    {
        var results = new List<StrategyResult>();
        foreach (var strategy in Strategies)
        {
            var (result, failure) = Simulator.Run(scenario, strategy);
            if (failure is not null) return (null, failure);
            results.Add(result!);
        }

        return (new Comparison(results, Recommend(scenario, results)), null);
    }

    public static Recommendation Recommend(Scenario scenario, IReadOnlyList<StrategyResult> results)
    {
        var ranked = results
            .OrderBy(r => r.TotalInterest)
            .ThenBy(r => r.DebtFreeMonth)
            .ThenBy(r => r.FundReachedMonth)
            .ThenBy(r => r.Strategy)
            .ToList();
        var cheapest = ranked[0];

        var half = results.FirstOrDefault(r => r.Strategy == Strategy.HalfAndHalf);
        var thinCushion = scenario.Savings < scenario.EmergencyFundGoal && scenario.Savings < scenario.BudgetWithExtra * ThinCushionMonths;
        if (half is not null && cheapest.Strategy != Strategy.HalfAndHalf && thinCushion
            && half.FundReachedMonth < cheapest.FundReachedMonth
            && half.DebtFreeMonth - cheapest.DebtFreeMonth <= MaxDebtFreeDelayMonths)
        {
            var sooner = cheapest.FundReachedMonth - half.FundReachedMonth;
            var later = half.DebtFreeMonth - cheapest.DebtFreeMonth;
            var delay = later == 0 ? "without pushing back the debt-free date" : $"and clears the debt only {Months(later)} later";
            return new Recommendation(Strategy.HalfAndHalf, RecommendationReason.BuildsCushionFirst,
                $"your savings are under one month of your budget, and it fills the emergency fund {Months(sooner)} sooner for {Dollars(half.TotalInterest - cheapest.TotalInterest)} more interest, {delay}.");
        }

        if (results.All(r => r.TotalInterest == cheapest.TotalInterest && r.DebtFreeMonth == cheapest.DebtFreeMonth && r.FundReachedMonth == cheapest.FundReachedMonth))
            return new Recommendation(cheapest.Strategy, RecommendationReason.NoDifference,
                "all three strategies give the same dates and the same interest with these numbers.");

        // Compare with the next strategy that actually costs more, so the saving is never "$0.00".
        var dearer = ranked.FirstOrDefault(r => r.TotalInterest > cheapest.TotalInterest);
        var sentence = dearer is null
            ? $"it costs the same interest as the others, {Dollars(cheapest.TotalInterest)} in total, and finishes soonest."
            : $"it costs the least interest: {Dollars(cheapest.TotalInterest)} in total, {Dollars(dearer.TotalInterest - cheapest.TotalInterest)} less than {Label(dearer.Strategy)}.";
        return new Recommendation(cheapest.Strategy, RecommendationReason.LowestInterest, sentence);
    }

    /// <summary>US dollars with cents, written the same way on every machine.</summary>
    public static string Dollars(decimal amount) => amount.ToString("$#,##0.00", CultureInfo.InvariantCulture);

    private static string Months(int count) => count == 1 ? "1 month" : $"{count} months";
}
