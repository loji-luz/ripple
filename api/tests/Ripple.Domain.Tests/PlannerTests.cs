using Ripple.Domain;

namespace Ripple.Domain.Tests;

public class PlannerTests
{
    private static StrategyResult Result(Strategy strategy, decimal interest, int debtFree, int fund) =>
        new(strategy, debtFree, fund, interest, 0m, [], []);

    private static Scenario With(decimal savings, decimal goal = 5000m, decimal budget = 600m, decimal extra = 0m) =>
        new([new Debt("Card", 5000m, 22m, 150m)], savings, goal, budget, extra);

    [Fact]
    public void The_lowest_total_interest_is_recommended_and_the_sentence_says_what_it_saves()
    {
        var recommendation = Planner.Recommend(With(savings: 3000m),
        [
            Result(Strategy.HighestInterestFirst, 400m, 10, 14),
            Result(Strategy.SmallestDebtFirst, 460.50m, 10, 14),
            Result(Strategy.HalfAndHalf, 700m, 14, 12),
        ]);

        Assert.Equal(Strategy.HighestInterestFirst, recommendation.Strategy);
        Assert.Equal(RecommendationReason.LowestInterest, recommendation.Reason);
        Assert.Equal("it costs the least interest: $400.00 in total, $60.50 less than Smallest debt first.", recommendation.Sentence);
    }

    [Fact]
    public void Smallest_debt_first_is_recommended_when_it_is_the_cheapest()
    {
        var recommendation = Planner.Recommend(With(savings: 3000m),
        [
            Result(Strategy.HighestInterestFirst, 400m, 10, 14),
            Result(Strategy.SmallestDebtFirst, 399.99m, 10, 14),
            Result(Strategy.HalfAndHalf, 700m, 14, 12),
        ]);
        Assert.Equal(Strategy.SmallestDebtFirst, recommendation.Strategy);
    }

    [Fact]
    public void A_tie_on_interest_goes_to_the_earlier_debt_free_month()
    {
        var recommendation = Planner.Recommend(With(savings: 3000m),
        [
            Result(Strategy.HighestInterestFirst, 400m, 11, 14),
            Result(Strategy.SmallestDebtFirst, 400m, 10, 14),
            Result(Strategy.HalfAndHalf, 700m, 14, 12),
        ]);
        Assert.Equal(Strategy.SmallestDebtFirst, recommendation.Strategy);
        // The saving quoted is against a strategy that really costs more, never "$0.00 less".
        Assert.Contains("$300.00 less than 50/50", recommendation.Sentence);
    }

    [Fact]
    public void A_full_tie_between_two_goes_to_highest_interest_first()
    {
        var recommendation = Planner.Recommend(With(savings: 3000m),
        [
            Result(Strategy.SmallestDebtFirst, 400m, 10, 14),
            Result(Strategy.HighestInterestFirst, 400m, 10, 14),
            Result(Strategy.HalfAndHalf, 700m, 14, 12),
        ]);
        Assert.Equal(Strategy.HighestInterestFirst, recommendation.Strategy);
    }

    [Fact]
    public void When_all_three_are_identical_the_sentence_says_so()
    {
        var recommendation = Planner.Recommend(With(savings: 5000m),
        [
            Result(Strategy.HighestInterestFirst, 400m, 10, 0),
            Result(Strategy.SmallestDebtFirst, 400m, 10, 0),
            Result(Strategy.HalfAndHalf, 400m, 10, 0),
        ]);
        Assert.Equal(Strategy.HighestInterestFirst, recommendation.Strategy);
        Assert.Equal(RecommendationReason.NoDifference, recommendation.Reason);
        Assert.Contains("all three strategies give the same dates", recommendation.Sentence);
    }

    // ---- the thin-cushion exception

    private static readonly StrategyResult[] FundSoonerForAShortDelay =
    [
        Result(Strategy.HighestInterestFirst, 400m, 10, 12),
        Result(Strategy.SmallestDebtFirst, 400m, 10, 12),
        Result(Strategy.HalfAndHalf, 470m, 12, 4),
    ];

    [Fact]
    public void With_under_a_month_of_budget_saved_half_and_half_is_recommended_if_the_delay_is_short()
    {
        var recommendation = Planner.Recommend(With(savings: 599.99m, budget: 600m), FundSoonerForAShortDelay);

        Assert.Equal(Strategy.HalfAndHalf, recommendation.Strategy);
        Assert.Equal(RecommendationReason.BuildsCushionFirst, recommendation.Reason);
        Assert.Equal(
            "your savings are under one month of your budget, and it fills the emergency fund 8 months sooner for $70.00 more interest, and clears the debt only 2 months later.",
            recommendation.Sentence);
    }

    [Fact]
    public void A_month_of_budget_already_saved_is_not_a_thin_cushion()
    {
        var recommendation = Planner.Recommend(With(savings: 600m, budget: 600m), FundSoonerForAShortDelay);
        Assert.Equal(Strategy.HighestInterestFirst, recommendation.Strategy);
    }

    [Fact]
    public void The_extra_per_month_counts_as_budget_when_judging_the_cushion()
    {
        var recommendation = Planner.Recommend(With(savings: 600m, budget: 600m, extra: 50m), FundSoonerForAShortDelay);
        Assert.Equal(Strategy.HalfAndHalf, recommendation.Strategy);
    }

    [Theory]
    [InlineData(13, Strategy.HalfAndHalf)] // 3 months later: allowed
    [InlineData(14, Strategy.HighestInterestFirst)] // 4 months later: too long
    public void The_delay_to_being_debt_free_may_be_three_months_at_most(int halfDebtFree, Strategy expected)
    {
        var recommendation = Planner.Recommend(With(savings: 0m),
        [
            Result(Strategy.HighestInterestFirst, 400m, 10, 12),
            Result(Strategy.SmallestDebtFirst, 400m, 10, 12),
            Result(Strategy.HalfAndHalf, 520m, halfDebtFree, 4),
        ]);
        Assert.Equal(expected, recommendation.Strategy);
    }

    [Fact]
    public void Half_and_half_is_not_recommended_if_it_does_not_fill_the_fund_sooner()
    {
        var recommendation = Planner.Recommend(With(savings: 0m),
        [
            Result(Strategy.HighestInterestFirst, 400m, 10, 12),
            Result(Strategy.SmallestDebtFirst, 400m, 10, 12),
            Result(Strategy.HalfAndHalf, 470m, 12, 12),
        ]);
        Assert.Equal(Strategy.HighestInterestFirst, recommendation.Strategy);
    }

    [Fact]
    public void A_one_month_delay_reads_naturally()
    {
        var recommendation = Planner.Recommend(With(savings: 0m),
        [
            Result(Strategy.HighestInterestFirst, 400m, 10, 12),
            Result(Strategy.SmallestDebtFirst, 400m, 10, 12),
            Result(Strategy.HalfAndHalf, 430m, 11, 11),
        ]);
        Assert.Contains("1 month sooner for $30.00 more interest, and clears the debt only 1 month later.", recommendation.Sentence);
    }

    // ---- end to end

    [Fact]
    public void Compare_runs_all_three_strategies_in_a_fixed_order()
    {
        var (comparison, failure) = Planner.Compare(With(savings: 3000m));
        Assert.Null(failure);
        Assert.Equal(Planner.Strategies, comparison!.Strategies.Select(s => s.Strategy));
        Assert.Equal(Strategy.HighestInterestFirst, comparison.Recommendation.Strategy);
    }

    [Fact]
    public void Compare_recommends_half_and_half_for_a_thin_cushion_and_a_small_goal()
    {
        // $200 saved against a $600 budget, and a $1,000 goal that half the extra fills in four months.
        var (comparison, _) = Planner.Compare(With(savings: 200m, goal: 1000m));
        var half = comparison!.Strategies.Single(s => s.Strategy == Strategy.HalfAndHalf);
        var avalanche = comparison.Strategies.Single(s => s.Strategy == Strategy.HighestInterestFirst);

        Assert.Equal(4, half.FundReachedMonth);
        Assert.True(half.DebtFreeMonth - avalanche.DebtFreeMonth <= Planner.MaxDebtFreeDelayMonths);
        Assert.Equal(Strategy.HalfAndHalf, comparison.Recommendation.Strategy);
    }

    [Fact]
    public void Compare_returns_the_named_error_instead_of_a_result()
    {
        var (comparison, failure) = Planner.Compare(With(savings: 0m, budget: 100m));
        Assert.Null(comparison);
        Assert.Equal(PlanError.BudgetBelowMinimums, failure!.Error);
    }

    [Theory]
    [InlineData("0", "$0.00")]
    [InlineData("1234.5", "$1,234.50")]
    [InlineData("1000000", "$1,000,000.00")]
    public void Dollars_are_written_with_cents_and_thousands_separators(string amount, string expected) =>
        Assert.Equal(expected, Planner.Dollars(decimal.Parse(amount, System.Globalization.CultureInfo.InvariantCulture)));
}
