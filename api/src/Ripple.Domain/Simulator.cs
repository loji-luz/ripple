namespace Ripple.Domain;

/// <summary>
/// The month-by-month simulation. Everything is <see cref="decimal"/>; no floating point.
///
/// Each month, in this order:
///  1. Interest is added to every open debt: balance x APR / 12, rounded to the cent with
///     halves rounded away from zero (0.505 becomes 0.51), the way a statement shows it.
///  2. Every open debt gets its minimum payment, or its whole balance if that is smaller.
///  3. Whatever is left of the budget is the "extra". Because the budget is fixed, a cleared
///     debt's minimum is part of the extra from the next month on. In the month a debt clears,
///     any part of its minimum that was not needed joins the extra straight away.
///  4. Half and half only: while savings are below the goal and a debt is still open, half the
///     extra (rounded down to the cent) goes to savings, never more than the fund still needs.
///  5. The rest of the extra, plus any one-off payment for the month, goes to the strategy's
///     target debt. If that clears the target, the remainder moves to the next target.
///  6. Anything still left once every debt is clear goes to savings, up to the goal. So after
///     the last debt the whole budget goes to savings until the fund is full, and every
///     strategy reports a month for it.
///
/// Targets are chosen from balances after step 2:
///  - Highest interest first, and Half and half: highest APR; ties go to the smaller balance,
///    then to the order the debts were entered.
///  - Smallest debt first: smallest balance; ties go to the higher APR, then to entry order.
///
/// The simulation ends in the month the debts are clear and the fund is full.
/// </summary>
public static class Simulator
{
    /// <summary>Saved with each shared scenario so old links can be told apart if the rules change.</summary>
    public const string EngineVersion = "1";

    /// <summary>Fifty years. A plan longer than this is reported as an error, not a result.</summary>
    public const int MaxMonths = 600;

    /// <summary>If debt reaches this many times its starting total, it is not going to clear.</summary>
    private const decimal RunawayMultiple = 10m;

    /// <summary>One month of interest, rounded to the cent, halves away from zero.</summary>
    public static decimal MonthlyInterest(decimal balance, decimal aprPercent) =>
        Math.Round(balance * aprPercent / 100m / 12m, 2, MidpointRounding.AwayFromZero);

    public static (StrategyResult? Result, PlanFailure? Failure) Run(Scenario scenario, Strategy strategy)
    {
        var debts = scenario.Debts;
        var budget = scenario.BudgetWithExtra;
        PlanFailure Fail(PlanError error, string? debtName = null) => new(error, strategy, budget, scenario.TotalMinimums, debtName);

        if (budget < scenario.TotalMinimums) return (null, Fail(PlanError.BudgetBelowMinimums));

        var balances = debts.Select(d => d.Balance).ToArray();
        var savings = scenario.Savings;
        var goal = scenario.EmergencyFundGoal;
        var startingDebt = balances.Sum();
        var oneOffs = (scenario.OneOffPayments ?? [])
            .GroupBy(p => p.Month)
            .ToDictionary(g => g.Key, g => g.Sum(p => p.Amount));

        var months = new List<MonthRow>();
        var payoffs = new List<DebtPayoff>();
        int? debtFreeMonth = balances.All(b => b == 0) ? 0 : null;
        int? fundReachedMonth = savings >= goal ? 0 : null;
        decimal totalInterest = 0, totalPaid = 0;

        for (var month = 1; month <= MaxMonths && (debtFreeMonth is null || fundReachedMonth is null); month++)
        {
            var payments = new decimal[debts.Count];
            decimal interestThisMonth = 0, savingsIn = 0;

            // 1. Interest.
            for (var i = 0; i < debts.Count; i++)
            {
                if (balances[i] == 0) continue;
                var interest = MonthlyInterest(balances[i], debts[i].AprPercent);
                balances[i] += interest;
                interestThisMonth += interest;
            }

            // 2. Minimums.
            var extra = budget;
            for (var i = 0; i < debts.Count; i++)
            {
                if (balances[i] == 0) continue;
                var payment = Math.Min(debts[i].MinimumPayment, balances[i]);
                Pay(i, payment);
                extra -= payment;
            }

            // 4. Half and half: half the extra to savings while the fund is short.
            if (strategy == Strategy.HalfAndHalf && savings < goal && balances.Any(b => b > 0))
            {
                var half = Math.Floor(extra * 100m / 2m) / 100m;
                var share = Math.Min(half, goal - savings);
                savings += share;
                savingsIn += share;
                extra -= share;
            }

            // 5. The rest, and any one-off, to the target debt, then the next one.
            var oneOff = oneOffs.GetValueOrDefault(month);
            var toDebt = extra + oneOff;
            while (toDebt > 0 && Target(strategy, debts, balances) is { } target)
            {
                var payment = Math.Min(toDebt, balances[target]);
                Pay(target, payment);
                toDebt -= payment;
            }

            // 6. With no debt left, what remains goes to savings, up to the goal.
            if (toDebt > 0 && savings < goal)
            {
                var share = Math.Min(toDebt, goal - savings);
                savings += share;
                savingsIn += share;
                toDebt -= share;
            }

            var debtPayment = payments.Sum();
            totalInterest += interestThisMonth;
            totalPaid += debtPayment;
            // A one-off counts as used only for the part that did not fit in the regular budget.
            var oneOffApplied = Math.Max(0, debtPayment + savingsIn - budget);
            months.Add(new MonthRow(month, interestThisMonth, debtPayment, savingsIn, oneOffApplied, balances.Sum(), savings, [.. balances], payments));

            if (debtFreeMonth is null && balances.All(b => b == 0)) debtFreeMonth = month;
            if (fundReachedMonth is null && savings >= goal) fundReachedMonth = month;

            if (balances.Sum() > Math.Max(startingDebt, 1m) * RunawayMultiple)
                return (null, Fail(PlanError.DebtNeverClears, LargestOpenDebt()));

            void Pay(int index, decimal amount)
            {
                if (amount == 0) return;
                balances[index] -= amount;
                payments[index] += amount;
                if (balances[index] == 0) payoffs.Add(new DebtPayoff(debts[index].Name, month));
            }
        }

        if (debtFreeMonth is null)
        {
            // Out of time. If the total has not come down over the last year it never will.
            var yearAgo = months[MaxMonths - 13].DebtBalance;
            var shrinking = months[^1].DebtBalance < yearAgo;
            return (null, Fail(shrinking ? PlanError.TooLong : PlanError.DebtNeverClears, LargestOpenDebt()));
        }

        if (fundReachedMonth is null) return (null, Fail(PlanError.TooLong));

        return (new StrategyResult(strategy, debtFreeMonth.Value, fundReachedMonth.Value, totalInterest, totalPaid, payoffs, months), null);

        string? LargestOpenDebt()
        {
            var largest = Array.IndexOf(balances, balances.Max());
            return balances[largest] > 0 ? debts[largest].Name : null;
        }
    }

    /// <summary>How far ahead a stalled debt is projected: five years.</summary>
    public const int StallMonths = 60;

    /// <summary>
    /// Describes a payment that does not clear the debt within <see cref="MaxMonths"/>, or returns
    /// null when it does. The emergency fund is left out, so a fund that is merely out of reach
    /// is not mistaken for a debt that will not clear. Payments follow highest interest first.
    /// </summary>
    public static Stalled? Stall(Scenario scenario)
    {
        var debtOnly = scenario with { EmergencyFundGoal = 0m };
        var budget = scenario.BudgetWithExtra;
        if (budget < scenario.TotalMinimums) return null;
        var (_, failure) = Run(debtOnly, Strategy.HighestInterestFirst);
        if (failure is null) return null;

        // The next five years at this payment, by the same monthly steps as Run.
        var debts = scenario.Debts;
        var balances = debts.Select(d => d.Balance).ToArray();
        var oneOffs = (scenario.OneOffPayments ?? []).GroupBy(p => p.Month).ToDictionary(g => g.Key, g => g.Sum(p => p.Amount));
        var projection = new List<decimal>(StallMonths);
        decimal firstInterest = 0;
        for (var month = 1; month <= StallMonths; month++)
        {
            for (var i = 0; i < debts.Count; i++)
            {
                if (balances[i] == 0) continue;
                var interest = MonthlyInterest(balances[i], debts[i].AprPercent);
                balances[i] += interest;
                if (month == 1) firstInterest += interest;
            }

            var left = budget;
            for (var i = 0; i < debts.Count; i++)
            {
                var payment = Math.Min(debts[i].MinimumPayment, balances[i]);
                balances[i] -= payment;
                left -= payment;
            }

            left += oneOffs.GetValueOrDefault(month);
            while (left > 0 && Target(Strategy.HighestInterestFirst, debts, balances) is { } target)
            {
                var payment = Math.Min(left, balances[target]);
                balances[target] -= payment;
                left -= payment;
            }

            projection.Add(balances.Sum());
        }

        // The extra is counted in the monthly amount, so the answer is one figure to aim for.
        Scenario At(decimal amount) => debtOnly with { MonthlyBudget = amount, ExtraPerMonth = 0m };
        bool Clears(decimal amount) => Run(At(amount), Strategy.HighestInterestFirst).Failure is null;
        bool ClearsInFiveYears(decimal amount) => Run(At(amount), Strategy.HighestInterestFirst).Result is { DebtFreeMonth: <= StallMonths };

        // Paying everything owed plus a year of interest in one month always clears it.
        var ceiling = Math.Ceiling(Math.Max(budget, scenario.TotalDebt * 2m + scenario.TotalMinimums)) + 1m;
        var toClear = Smallest(Math.Floor(budget), ceiling, Clears);
        var forFiveYears = Smallest(toClear, ceiling, ClearsInFiveYears);

        return new Stalled(budget, firstInterest, failure.Error == PlanError.TooLong, toClear, forFiveYears, projection);
    }

    /// <summary>
    /// The smallest whole number above <paramref name="fails"/> and no greater than
    /// <paramref name="works"/> for which <paramref name="test"/> holds, given that it holds at
    /// <paramref name="works"/> and keeps holding as the amount rises.
    /// </summary>
    private static decimal Smallest(decimal fails, decimal works, Func<decimal, bool> test)
    {
        if (test(fails)) return fails;
        while (works - fails > 1m)
        {
            var middle = Math.Floor((fails + works) / 2m);
            if (test(middle)) works = middle;
            else fails = middle;
        }

        return works;
    }

    /// <summary>The index of the open debt the strategy pays next, or null when none are open.</summary>
    public static int? Target(Strategy strategy, IReadOnlyList<Debt> debts, IReadOnlyList<decimal> balances)
    {
        var open = Enumerable.Range(0, debts.Count).Where(i => balances[i] > 0);
        var ordered = strategy == Strategy.SmallestDebtFirst
            ? open.OrderBy(i => balances[i]).ThenByDescending(i => debts[i].AprPercent).ThenBy(i => i)
            : open.OrderByDescending(i => debts[i].AprPercent).ThenBy(i => balances[i]).ThenBy(i => i);
        return ordered.Cast<int?>().FirstOrDefault();
    }
}
