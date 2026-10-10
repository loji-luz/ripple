using Ripple.Domain;

namespace Ripple.Domain.Tests;

public class SimulatorTests
{
    private static StrategyResult Run(Scenario scenario, Strategy strategy)
    {
        var (result, failure) = Simulator.Run(scenario, strategy);
        Assert.Null(failure);
        return result!;
    }

    private static PlanFailure Fail(Scenario scenario, Strategy strategy = Strategy.HighestInterestFirst)
    {
        var (result, failure) = Simulator.Run(scenario, strategy);
        Assert.Null(result);
        return failure!;
    }

    // ---- interest

    [Theory]
    [InlineData("1000", "12", "10.00")]
    [InlineData("417.10", "12", "4.17")] // 4.171 rounds down
    [InlineData("100", "6.06", "0.51")] // 0.505 exactly: halves round away from zero, not to even
    [InlineData("300", "6.06", "1.52")] // 1.515 exactly
    [InlineData("2500", "0", "0.00")]
    public void A_months_interest_is_balance_times_apr_over_twelve_rounded_half_up(string balance, string apr, string expected) =>
        Assert.Equal(decimal.Parse(expected, System.Globalization.CultureInfo.InvariantCulture), Simulator.MonthlyInterest(decimal.Parse(balance, System.Globalization.CultureInfo.InvariantCulture), decimal.Parse(apr, System.Globalization.CultureInfo.InvariantCulture)));

    // ---- one debt against a schedule worked out by hand
    //
    // $1,000.00 at 12% APR (1% a month), $25 minimum, $300 a month, nothing saved, $500 goal.
    //   Month 1: interest 10.00 -> 1,010.00; pay 300.00 -> 710.00
    //   Month 2: interest  7.10 ->   717.10; pay 300.00 -> 417.10
    //   Month 3: interest  4.17 ->   421.27; pay 300.00 -> 121.27   (4.171 rounded)
    //   Month 4: interest  1.21 ->   122.48; pay 122.48 ->   0.00   (1.2127 rounded)
    //            the other 177.52 of the budget goes to savings   -> 177.52
    //   Month 5: 300.00 to savings                                -> 477.52
    //   Month 6:  22.48 to savings, the fund is full              -> 500.00
    //   Interest: 10.00 + 7.10 + 4.17 + 1.21 = 22.48. Paid: 1,022.48.

    private static readonly Scenario OneDebt = new([new Debt("Card", 1000m, 12m, 25m)], Savings: 0m, EmergencyFundGoal: 500m, MonthlyBudget: 300m);

    [Fact]
    public void One_debt_matches_the_hand_worked_schedule_to_the_cent()
    {
        var result = Run(OneDebt, Strategy.HighestInterestFirst);

        Assert.Equal([10.00m, 7.10m, 4.17m, 1.21m, 0m, 0m], result.Months.Select(m => m.Interest));
        Assert.Equal([300.00m, 300.00m, 300.00m, 122.48m, 0m, 0m], result.Months.Select(m => m.DebtPayment));
        Assert.Equal([710.00m, 417.10m, 121.27m, 0m, 0m, 0m], result.Months.Select(m => m.DebtBalance));
        Assert.Equal([0m, 0m, 0m, 177.52m, 300.00m, 22.48m], result.Months.Select(m => m.SavingsContribution));
        Assert.Equal([0m, 0m, 0m, 177.52m, 477.52m, 500.00m], result.Months.Select(m => m.SavingsBalance));

        Assert.Equal(4, result.DebtFreeMonth);
        Assert.Equal(6, result.FundReachedMonth);
        Assert.Equal(22.48m, result.TotalInterest);
        Assert.Equal(1022.48m, result.TotalPaidToDebt);
        Assert.Equal([new DebtPayoff("Card", 4)], result.Payoffs);
    }

    [Fact]
    public void After_the_last_debt_the_whole_budget_goes_to_savings_until_the_fund_is_full()
    {
        var result = Run(OneDebt, Strategy.SmallestDebtFirst);
        Assert.Equal(300m, result.Months[4].SavingsContribution);
        Assert.Equal(6, result.Months.Count);
        Assert.Equal(500m, result.Months[^1].SavingsBalance);
    }

    // ---- roll-over
    //
    // Card $300 at 24% (min $50) and Loan $2,000 at 6% (min $100), $250 a month: $100 extra.
    //   Month 1: Card 306.00 -> min 50 -> extra 100 -> 156.00.   Loan 2,010.00 -> min 100 -> 1,910.00
    //   Month 2: Card 159.12 -> min 50 -> extra 100 ->   9.12.   Loan 1,919.55 -> min 100 -> 1,819.55
    //   Month 3: Card   9.30 -> pays 9.30 and clears.            Loan 1,828.65 -> min 100, then the
    //            140.70 left of the budget -> 1,587.95
    //   Month 4: the Card's $50 minimum has rolled over: the Loan gets the full 250.00.

    [Fact]
    public void When_a_debt_clears_its_minimum_rolls_into_the_extra()
    {
        var scenario = new Scenario([new Debt("Card", 300m, 24m, 50m), new Debt("Loan", 2000m, 6m, 100m)], 0m, 0m, 250m);
        var result = Run(scenario, Strategy.HighestInterestFirst);

        Assert.Equal([150m, 100m], result.Months[0].Payments);
        Assert.Equal([150m, 100m], result.Months[1].Payments);
        Assert.Equal([9.30m, 240.70m], result.Months[2].Payments);
        Assert.Equal([0m, 250m], result.Months[3].Payments);
        Assert.Equal([0m, 1587.95m], result.Months[2].Balances);
        Assert.Equal(new DebtPayoff("Card", 3), result.Payoffs[0]);
    }

    // ---- ordering

    private static readonly Scenario SmallCheapAndBigDear = new(
        [new Debt("Small cheap", 500m, 5m, 25m), new Debt("Big dear", 3000m, 25m, 60m)], 0m, 0m, 400m);

    [Fact]
    public void Highest_interest_first_sends_the_extra_to_the_highest_apr()
    {
        var result = Run(SmallCheapAndBigDear, Strategy.HighestInterestFirst);
        Assert.Equal([25m, 375m], result.Months[0].Payments);
        Assert.Equal("Big dear", result.Payoffs[0].Name);
    }

    [Fact]
    public void Smallest_debt_first_sends_the_extra_to_the_smallest_balance()
    {
        var result = Run(SmallCheapAndBigDear, Strategy.SmallestDebtFirst);
        Assert.Equal([340m, 60m], result.Months[0].Payments);
        Assert.Equal("Small cheap", result.Payoffs[0].Name);
    }

    [Fact]
    public void Highest_interest_first_never_costs_more_interest_than_smallest_debt_first_here()
    {
        var avalanche = Run(SmallCheapAndBigDear, Strategy.HighestInterestFirst);
        var snowball = Run(SmallCheapAndBigDear, Strategy.SmallestDebtFirst);
        Assert.True(avalanche.TotalInterest < snowball.TotalInterest);
    }

    [Fact]
    public void Extra_that_overflows_a_cleared_target_moves_to_the_next_target()
    {
        var scenario = new Scenario([new Debt("Tiny", 40m, 20m, 10m), new Debt("Next", 1000m, 10m, 20m)], 0m, 0m, 200m);
        var first = Run(scenario, Strategy.HighestInterestFirst).Months[0];
        // Tiny: 40 + 0.67 interest = 40.67, all paid. Next gets its 20 minimum plus the 139.33 left.
        Assert.Equal([40.67m, 159.33m], first.Payments);
        Assert.Equal(200m, first.DebtPayment);
    }

    [Fact]
    public void Ties_are_broken_the_same_way_every_time()
    {
        Debt[] sameApr = [new("A", 900m, 20m, 10m), new("B", 400m, 20m, 10m), new("C", 400m, 20m, 10m)];
        decimal[] balances = [900m, 400m, 400m];
        // Same APR: the smaller balance, then the one entered first.
        Assert.Equal(1, Simulator.Target(Strategy.HighestInterestFirst, sameApr, balances));
        Assert.Equal(1, Simulator.Target(Strategy.HalfAndHalf, sameApr, balances));

        Debt[] sameBalance = [new("A", 400m, 10m, 10m), new("B", 400m, 30m, 10m), new("C", 400m, 30m, 10m)];
        // Same balance: the higher APR, then the one entered first.
        Assert.Equal(1, Simulator.Target(Strategy.SmallestDebtFirst, sameBalance, [400m, 400m, 400m]));

        Assert.Null(Simulator.Target(Strategy.SmallestDebtFirst, sameBalance, [0m, 0m, 0m]));
    }

    // ---- half and half

    [Fact]
    public void Half_and_half_splits_the_extra_until_the_fund_is_full_then_sends_it_all_to_debt()
    {
        // $500 budget, $100 minimum: $400 extra, so $200 a month to savings. The $600 goal is met in month 3.
        var scenario = new Scenario([new Debt("Card", 5000m, 18m, 100m)], 0m, 600m, 500m);
        var result = Run(scenario, Strategy.HalfAndHalf);

        Assert.All(result.Months.Take(3), m =>
        {
            Assert.Equal(200m, m.SavingsContribution);
            Assert.Equal(300m, m.DebtPayment);
        });
        Assert.Equal(3, result.FundReachedMonth);
        Assert.Equal(0m, result.Months[3].SavingsContribution);
        Assert.Equal(500m, result.Months[3].DebtPayment);
    }

    [Fact]
    public void Half_and_half_never_saves_more_than_the_fund_still_needs()
    {
        // The $500 goal needs only $100 in month 3, so the other $100 goes to the debt.
        var scenario = new Scenario([new Debt("Card", 5000m, 18m, 100m)], 0m, 500m, 500m);
        var third = Run(scenario, Strategy.HalfAndHalf).Months[2];
        Assert.Equal(100m, third.SavingsContribution);
        Assert.Equal(400m, third.DebtPayment);
        Assert.Equal(500m, third.SavingsBalance);
    }

    [Fact]
    public void Half_and_half_rounds_the_savings_half_down_so_no_cent_is_lost()
    {
        var scenario = new Scenario([new Debt("Card", 5000m, 18m, 100m)], 0m, 5000m, 200.01m);
        var first = Run(scenario, Strategy.HalfAndHalf).Months[0];
        Assert.Equal(50.00m, first.SavingsContribution);
        Assert.Equal(150.01m, first.DebtPayment);
    }

    [Fact]
    public void Half_and_half_targets_the_highest_apr()
    {
        var first = Run(SmallCheapAndBigDear with { EmergencyFundGoal = 10000m }, Strategy.HalfAndHalf).Months[0];
        // $315 extra: 157.50 to savings, 157.50 on top of Big dear's minimum.
        Assert.Equal(157.50m, first.SavingsContribution);
        Assert.Equal([25m, 217.50m], first.Payments);
    }

    [Fact]
    public void With_the_fund_already_full_half_and_half_is_the_same_as_highest_interest_first()
    {
        var scenario = SmallCheapAndBigDear with { Savings = 2000m, EmergencyFundGoal = 2000m };
        var half = Run(scenario, Strategy.HalfAndHalf);
        var avalanche = Run(scenario, Strategy.HighestInterestFirst);
        Assert.Equal(avalanche.TotalInterest, half.TotalInterest);
        Assert.Equal(avalanche.DebtFreeMonth, half.DebtFreeMonth);
        Assert.Equal(0, half.FundReachedMonth);
    }

    // ---- what-if

    [Fact]
    public void A_one_off_payment_goes_to_the_target_debt_in_its_month()
    {
        // The hand-worked debt with $200 more in month 2:
        //   Month 2: 717.10 - 500.00 = 217.10.  Month 3: + 2.17 interest = 219.27, paid off.
        var result = Run(OneDebt with { OneOffPayments = [new OneOffPayment(2, 200m)] }, Strategy.HighestInterestFirst);

        Assert.Equal(300m, result.Months[0].DebtPayment);
        Assert.Equal(500m, result.Months[1].DebtPayment);
        Assert.Equal(200m, result.Months[1].OneOffApplied);
        Assert.Equal(217.10m, result.Months[1].DebtBalance);
        Assert.Equal(3, result.DebtFreeMonth);
        Assert.Equal(19.27m, result.TotalInterest);
    }

    [Fact]
    public void A_one_off_is_not_halved_by_half_and_half()
    {
        var scenario = new Scenario([new Debt("Card", 5000m, 18m, 100m)], 0m, 5000m, 500m, OneOffPayments: [new OneOffPayment(1, 1000m)]);
        var first = Run(scenario, Strategy.HalfAndHalf).Months[0];
        Assert.Equal(200m, first.SavingsContribution);
        Assert.Equal(1300m, first.DebtPayment);
    }

    [Fact]
    public void Two_one_offs_in_the_same_month_add_up()
    {
        var result = Run(OneDebt with { OneOffPayments = [new OneOffPayment(1, 100m), new OneOffPayment(1, 50m)] }, Strategy.HighestInterestFirst);
        Assert.Equal(450m, result.Months[0].DebtPayment);
    }

    [Fact]
    public void Extra_per_month_is_the_same_as_a_bigger_budget()
    {
        var withExtra = Run(OneDebt with { ExtraPerMonth = 100m }, Strategy.HighestInterestFirst);
        var biggerBudget = Run(OneDebt with { MonthlyBudget = 400m }, Strategy.HighestInterestFirst);
        Assert.Equal(biggerBudget.Months, withExtra.Months.Select(m => m with { }), new MonthComparer());
        Assert.True(withExtra.DebtFreeMonth < Run(OneDebt, Strategy.HighestInterestFirst).DebtFreeMonth);
    }

    private sealed class MonthComparer : IEqualityComparer<MonthRow>
    {
        public bool Equals(MonthRow? a, MonthRow? b) =>
            a!.Month == b!.Month && a.Interest == b.Interest && a.DebtPayment == b.DebtPayment && a.SavingsContribution == b.SavingsContribution
            && a.DebtBalance == b.DebtBalance && a.SavingsBalance == b.SavingsBalance;

        public int GetHashCode(MonthRow row) => row.Month;
    }

    // ---- guard rails

    [Fact]
    public void A_budget_below_the_minimums_is_a_named_error()
    {
        var failure = Fail(new Scenario([new Debt("Card", 2000m, 20m, 90m), new Debt("Loan", 5000m, 6m, 60m)], 0m, 0m, 100m));
        Assert.Equal(PlanError.BudgetBelowMinimums, failure.Error);
        Assert.Equal(150m, failure.TotalMinimums);
        Assert.Equal(100m, failure.Budget);
    }

    [Fact]
    public void The_extra_per_month_counts_towards_covering_the_minimums()
    {
        var scenario = new Scenario([new Debt("Card", 2000m, 20m, 150m)], 0m, 0m, 100m, ExtraPerMonth: 50m);
        Assert.Null(Simulator.Run(scenario, Strategy.HighestInterestFirst).Failure);
    }

    [Fact]
    public void A_debt_that_grows_every_month_is_a_named_error()
    {
        // $200 of interest a month against $150 of payments.
        var failure = Fail(new Scenario([new Debt("Card", 10000m, 24m, 100m)], 0m, 0m, 150m));
        Assert.Equal(PlanError.DebtNeverClears, failure.Error);
        Assert.Equal("Card", failure.DebtName);
    }

    [Fact]
    public void A_debt_that_stands_still_is_the_same_named_error()
    {
        // Exactly $100 of interest and $100 of payment, forever.
        var failure = Fail(new Scenario([new Debt("Loan", 10000m, 12m, 100m)], 0m, 0m, 100m));
        Assert.Equal(PlanError.DebtNeverClears, failure.Error);
    }

    [Fact]
    public void A_debt_that_shrinks_too_slowly_stops_at_600_months()
    {
        // Ten cents more than the interest: it does come down, but not within fifty years.
        var failure = Fail(new Scenario([new Debt("Loan", 10000m, 12m, 100m)], 0m, 0m, 100.10m));
        Assert.Equal(PlanError.TooLong, failure.Error);
    }

    [Fact]
    public void A_fund_that_cannot_be_filled_in_600_months_is_too_long()
    {
        var failure = Fail(new Scenario([new Debt("Card", 100m, 10m, 25m)], 0m, 1_000_000m, 100m));
        Assert.Equal(PlanError.TooLong, failure.Error);
    }

    [Fact]
    public void A_plan_of_exactly_600_months_is_allowed()
    {
        // No interest: $6,000 at $10 a month is 600 months to the day.
        var result = Run(new Scenario([new Debt("Family loan", 6000m, 0m, 10m)], 0m, 0m, 10m), Strategy.HighestInterestFirst);
        Assert.Equal(600, result.DebtFreeMonth);
        Assert.Equal(0m, result.TotalInterest);
    }

    [Fact]
    public void Nothing_owed_and_a_full_fund_is_a_plan_of_no_months()
    {
        var result = Run(new Scenario([], 800m, 500m, 100m), Strategy.HalfAndHalf);
        Assert.Equal(0, result.DebtFreeMonth);
        Assert.Equal(0, result.FundReachedMonth);
        Assert.Empty(result.Months);
    }

    // ---- invariants, over a few hundred generated scenarios

    public static TheoryData<int> Seeds => [.. Enumerable.Range(1, 60)];

    [Theory]
    [MemberData(nameof(Seeds))]
    public void Every_plan_keeps_its_promises(int seed)
    {
        var random = new Random(seed);
        decimal Money(int min, int max) => random.Next(min * 100, max * 100) / 100m;

        var debts = Enumerable.Range(0, random.Next(1, 7))
            .Select(i => new Debt($"Debt {i + 1}", Money(50, 20000), random.Next(0, 3000) / 100m, Money(10, 300)))
            .ToList();
        // Enough budget to cover twice the first month's interest, so the plan clears even when half the extra is saved.
        var budget = debts.Sum(d => d.MinimumPayment) + 2 * debts.Sum(d => Simulator.MonthlyInterest(d.Balance, d.AprPercent)) + Money(20, 900);
        var oneOffs = Enumerable.Range(0, random.Next(0, 4)).Select(_ => new OneOffPayment(random.Next(1, 30), Money(10, 2000))).ToList();
        var scenario = new Scenario(debts, Money(0, 3000), Money(0, 12000), budget, Money(0, 200), oneOffs);
        var principal = debts.Sum(d => d.Balance);

        foreach (var strategy in Planner.Strategies)
        {
            var result = Run(scenario, strategy);
            var savings = scenario.Savings;

            Assert.Equal(Enumerable.Range(1, result.Months.Count), result.Months.Select(m => m.Month));
            foreach (var month in result.Months)
            {
                // No balance below zero.
                Assert.All(month.Balances, b => Assert.True(b >= 0, $"negative balance in month {month.Month}"));
                Assert.Equal(month.Balances.Sum(), month.DebtBalance);
                Assert.Equal(month.Payments.Sum(), month.DebtPayment);

                // No month spends more than the budget plus that month's one-offs.
                var oneOff = oneOffs.Where(p => p.Month == month.Month).Sum(p => p.Amount);
                Assert.True(month.DebtPayment + month.SavingsContribution <= scenario.BudgetWithExtra + oneOff,
                    $"month {month.Month} spent {month.DebtPayment + month.SavingsContribution} of {scenario.BudgetWithExtra + oneOff}");
                Assert.True(month.OneOffApplied <= oneOff);

                // Savings only ever go up, by exactly what was put in, and never past the goal.
                Assert.True(month.SavingsContribution >= 0);
                savings += month.SavingsContribution;
                Assert.Equal(savings, month.SavingsBalance);
                Assert.True(month.SavingsBalance <= Math.Max(scenario.Savings, scenario.EmergencyFundGoal));

                // Until the debts are clear the whole budget is used.
                if (month.Month < result.DebtFreeMonth)
                    Assert.True(month.DebtPayment + month.SavingsContribution >= scenario.BudgetWithExtra);
            }

            // Everything paid is the principal plus the interest, to the cent.
            Assert.Equal(principal + result.TotalInterest, result.TotalPaidToDebt);
            Assert.Equal(result.Months.Sum(m => m.Interest), result.TotalInterest);
            Assert.Equal(0m, result.Months[result.DebtFreeMonth - 1].DebtBalance);
            Assert.True(result.Months[^1].SavingsBalance >= scenario.EmergencyFundGoal);
            Assert.Equal(Math.Max(result.DebtFreeMonth, result.FundReachedMonth), result.Months.Count);

            // Every debt is paid off once, and the last payoff is the debt-free month.
            Assert.Equal(debts.Select(d => d.Name).Order(), result.Payoffs.Select(p => p.Name).Order());
            Assert.Equal(result.DebtFreeMonth, result.Payoffs.Max(p => p.Month));
        }
    }
}
