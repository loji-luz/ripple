using Ripple.Domain;

namespace Ripple.Domain.Tests;

/// <summary>
/// A payment that does not clear the debt is still an answer worth showing: where the balance
/// goes, what interest adds each month, and what payment would turn it round.
/// </summary>
public class StallTests
{
    // $200.00 of interest a month against $150 of payments.
    private static readonly Scenario Growing = new([new Debt("Card", 10000m, 24m, 100m)], 0m, 0m, 150m);

    [Fact]
    public void A_plan_that_clears_is_not_stalled()
    {
        Assert.Null(Simulator.Stall(new Scenario([new Debt("Card", 1000m, 12m, 25m)], 0m, 0m, 300m)));
    }

    [Fact]
    public void A_growing_debt_reports_the_interest_added_in_the_first_month()
    {
        var stalled = Simulator.Stall(Growing)!;
        Assert.Equal(200.00m, stalled.MonthlyInterest);
        Assert.False(stalled.Shrinking);
    }

    [Fact]
    public void The_projection_is_five_years_of_balances_worked_month_by_month()
    {
        var stalled = Simulator.Stall(Growing)!;
        Assert.Equal(60, stalled.Balances.Count);
        // Month 1: 10,000.00 + 200.00 - 150.00. Month 2: 10,050.00 + 201.00 - 150.00.
        Assert.Equal(10050.00m, stalled.Balances[0]);
        Assert.Equal(10101.00m, stalled.Balances[1]);
        // Month 3: 10,101.00 + 202.02 - 150.00.
        Assert.Equal(10153.02m, stalled.Balances[2]);
        Assert.True(stalled.Balances[59] > stalled.Balances[58]);
    }

    [Fact]
    public void The_payment_that_clears_it_is_the_smallest_whole_dollar_amount_that_does()
    {
        var stalled = Simulator.Stall(Growing)!;
        Assert.Null(Simulator.Run(Growing with { MonthlyBudget = stalled.BudgetToClear }, Strategy.HighestInterestFirst).Failure);
        Assert.NotNull(Simulator.Run(Growing with { MonthlyBudget = stalled.BudgetToClear - 1m }, Strategy.HighestInterestFirst).Failure);
        Assert.Equal(stalled.BudgetToClear, Math.Floor(stalled.BudgetToClear));
        // Interest is $200.00 in the first month, so anything at or under that can never work.
        Assert.True(stalled.BudgetToClear > 200m);
    }

    [Fact]
    public void The_payment_for_five_years_clears_in_sixty_months_and_one_dollar_less_does_not()
    {
        var stalled = Simulator.Stall(Growing)!;
        var (atIt, _) = Simulator.Run(Growing with { MonthlyBudget = stalled.BudgetForFiveYears }, Strategy.HighestInterestFirst);
        Assert.True(atIt!.DebtFreeMonth <= 60);
        var (under, failure) = Simulator.Run(Growing with { MonthlyBudget = stalled.BudgetForFiveYears - 1m }, Strategy.HighestInterestFirst);
        Assert.True(failure is not null || under!.DebtFreeMonth > 60);
        Assert.True(stalled.BudgetForFiveYears >= stalled.BudgetToClear);
    }

    [Fact]
    public void The_payment_asked_for_counts_the_extra_already_being_paid()
    {
        // The same $150 a month, as $100 plus $50 extra: the answers are the same.
        var split = new Scenario(Growing.Debts, 0m, 0m, 100m, ExtraPerMonth: 50m);
        var stalled = Simulator.Stall(split)!;
        Assert.Equal(Simulator.Stall(Growing)!.BudgetToClear, stalled.BudgetToClear);
        Assert.Equal(150m, stalled.Budget);
    }

    [Fact]
    public void A_debt_that_shrinks_but_takes_more_than_fifty_years_is_stalled_and_says_it_is_shrinking()
    {
        // Ten cents more than the interest.
        var stalled = Simulator.Stall(new Scenario([new Debt("Loan", 10000m, 12m, 100m)], 0m, 0m, 100.10m))!;
        Assert.True(stalled.Shrinking);
        Assert.Equal(100.00m, stalled.MonthlyInterest);
        Assert.Equal(9999.90m, stalled.Balances[0]);
    }

    [Fact]
    public void A_fund_that_cannot_be_filled_is_not_a_stalled_debt()
    {
        // The debt clears; only the emergency fund is out of reach. That stays a named error.
        Assert.Null(Simulator.Stall(new Scenario([new Debt("Card", 100m, 10m, 25m)], 0m, 1_000_000m, 100m)));
    }
}
