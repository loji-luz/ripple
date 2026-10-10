namespace Ripple.Domain;

/// <summary>One debt as the person entered it. APR is a percentage: 22.5 means 22.5% a year.</summary>
public sealed record Debt(string Name, decimal Balance, decimal AprPercent, decimal MinimumPayment);

/// <summary>A single extra payment in one month. Month 1 is the first month of the plan.</summary>
public sealed record OneOffPayment(int Month, decimal Amount);

/// <summary>Everything the engine needs. All money is in US dollars.</summary>
public sealed record Scenario(
    IReadOnlyList<Debt> Debts,
    decimal Savings,
    decimal EmergencyFundGoal,
    decimal MonthlyBudget,
    decimal ExtraPerMonth = 0m,
    IReadOnlyList<OneOffPayment>? OneOffPayments = null)
{
    /// <summary>What is available each month once the what-if extra is added.</summary>
    public decimal BudgetWithExtra => MonthlyBudget + ExtraPerMonth;

    public decimal TotalMinimums => Debts.Where(d => d.Balance > 0).Sum(d => d.MinimumPayment);

    public decimal TotalDebt => Debts.Sum(d => d.Balance);
}

public enum Strategy
{
    /// <summary>Avalanche: the extra goes to the debt with the highest APR.</summary>
    HighestInterestFirst,

    /// <summary>Snowball: the extra goes to the debt with the smallest balance.</summary>
    SmallestDebtFirst,

    /// <summary>Half the extra goes to savings until the fund is full, the rest to the highest APR.</summary>
    HalfAndHalf,
}

/// <summary>Why a plan cannot be produced. Each one is shown to the person by name.</summary>
public enum PlanError
{
    /// <summary>The monthly budget does not cover the minimum payments.</summary>
    BudgetBelowMinimums,

    /// <summary>The debt is not shrinking: interest is being added as fast as it is paid.</summary>
    DebtNeverClears,

    /// <summary>The plan works but takes more than 600 months (50 years).</summary>
    TooLong,
}

public sealed record PlanFailure(PlanError Error, Strategy Strategy, decimal Budget, decimal TotalMinimums, string? DebtName = null);

/// <summary>One month of one strategy. Balances are after that month's interest and payments.</summary>
public sealed record MonthRow(
    int Month,
    decimal Interest,
    decimal DebtPayment,
    decimal SavingsContribution,
    decimal OneOffApplied,
    decimal DebtBalance,
    decimal SavingsBalance,
    IReadOnlyList<decimal> Balances,
    IReadOnlyList<decimal> Payments);

public sealed record DebtPayoff(string Name, int Month);

public sealed record StrategyResult(
    Strategy Strategy,
    int DebtFreeMonth,
    int FundReachedMonth,
    decimal TotalInterest,
    decimal TotalPaidToDebt,
    IReadOnlyList<DebtPayoff> Payoffs,
    IReadOnlyList<MonthRow> Months);

public enum RecommendationReason
{
    /// <summary>It costs the least interest.</summary>
    LowestInterest,

    /// <summary>Savings are thin and filling the fund first costs little time.</summary>
    BuildsCushionFirst,

    /// <summary>All three strategies come out identical.</summary>
    NoDifference,
}

/// <summary>
/// What happens when the payment does not clear the debt within fifty years. It is an answer,
/// not a refusal: where the balance goes, and what payment would turn it round.
/// </summary>
/// <param name="Budget">What is being paid each month, with the extra.</param>
/// <param name="MonthlyInterest">Interest added in the first month.</param>
/// <param name="Shrinking">True when the debt does come down, only too slowly to finish.</param>
/// <param name="BudgetToClear">The smallest whole-dollar monthly amount that clears the debt at all.</param>
/// <param name="BudgetForFiveYears">The smallest whole-dollar monthly amount that clears it in 60 months.</param>
/// <param name="Balances">Total debt at the end of each of the next 60 months at the current payment.</param>
public sealed record Stalled(decimal Budget, decimal MonthlyInterest, bool Shrinking, decimal BudgetToClear, decimal BudgetForFiveYears, IReadOnlyList<decimal> Balances);

public sealed record Recommendation(Strategy Strategy, RecommendationReason Reason, string Sentence);

public sealed record Comparison(IReadOnlyList<StrategyResult> Strategies, Recommendation Recommendation);
