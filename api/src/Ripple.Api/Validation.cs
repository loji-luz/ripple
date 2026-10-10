using Ripple.Domain;

namespace Ripple.Api;

/// <summary>
/// Checks a request and turns it into a <see cref="Scenario"/>. Errors are keyed by the field's
/// path in the request ("debts[0].balance", "monthlyBudget") so the web app can show each one
/// beside its field, and every message says what to do next.
/// Money is rounded to the cent and APR to three decimal places before anything is calculated.
/// </summary>
public static class Validation
{
    public const int MaxDebts = 20;
    public const int MaxOneOffPayments = 24;
    public const int MaxNameLength = 40;
    public const decimal MaxMoney = 10_000_000m;
    public const decimal MaxApr = 100m;

    public static (Scenario? Scenario, Dictionary<string, string[]> Errors) Check(ScenarioInput? input)
    {
        var errors = new Dictionary<string, string[]>();
        void Error(string field, string message) => errors.TryAdd(field, [message]);

        if (input is null)
        {
            Error("debts", "Add at least one debt.");
            return (null, errors);
        }

        var debts = new List<Debt>();
        var debtInputs = input.Debts ?? [];
        if (debtInputs.Count == 0) Error("debts", "Add at least one debt.");
        if (debtInputs.Count > MaxDebts) Error("debts", $"Ripple compares up to {MaxDebts} debts. Remove {debtInputs.Count - MaxDebts} or combine some.");

        foreach (var (debt, i) in debtInputs.Take(MaxDebts).Select((d, i) => (d, i)))
        {
            var name = (debt.Name ?? "").Trim();
            if (name.Length == 0) Error($"debts[{i}].name", "Give this debt a name, such as \"Card 1\".");
            else if (name.Length > MaxNameLength) Error($"debts[{i}].name", $"Shorten the name to {MaxNameLength} characters or fewer.");

            var balance = Money(debt.Balance, $"debts[{i}].balance", "Enter the balance owed.", allowZero: false, zeroMessage: "Enter a balance above $0, or remove this debt.");
            var minimum = Money(debt.MinimumPayment, $"debts[{i}].minimumPayment", "Enter the minimum monthly payment. Use 0 if there is none.");

            decimal apr = 0;
            if (debt.Apr is null) Error($"debts[{i}].apr", "Enter the APR as a percentage. Use 0 for an interest-free debt.");
            else if (debt.Apr < 0 || debt.Apr > MaxApr) Error($"debts[{i}].apr", $"Enter an APR between 0 and {MaxApr:0}%.");
            else apr = Math.Round(debt.Apr.Value, 3, MidpointRounding.AwayFromZero);

            debts.Add(new Debt(name, balance, apr, minimum));
        }

        var savings = Money(input.Savings, "savings", "Enter your current savings. Use 0 if you have none.");
        var goal = Money(input.EmergencyFundGoal, "emergencyFundGoal", "Enter an emergency fund goal. Use 0 to leave savings out.");
        var budget = Money(input.MonthlyBudget, "monthlyBudget", "Enter the amount you can put towards debt and savings each month.", allowZero: false, zeroMessage: "Enter a monthly amount above $0.");
        var extra = Money(input.ExtraPerMonth ?? 0m, "extraPerMonth", "");

        var oneOffs = new List<OneOffPayment>();
        var oneOffInputs = input.OneOffPayments ?? [];
        if (oneOffInputs.Count > MaxOneOffPayments) Error("oneOffPayments", $"Ripple handles up to {MaxOneOffPayments} one-off payments. Remove {oneOffInputs.Count - MaxOneOffPayments}.");
        foreach (var (payment, i) in oneOffInputs.Take(MaxOneOffPayments).Select((p, i) => (p, i)))
        {
            if (payment.Month is null or < 1 or > Simulator.MaxMonths) Error($"oneOffPayments[{i}].month", $"Choose a month between 1 and {Simulator.MaxMonths} months from now.");
            var amount = Money(payment.Amount, $"oneOffPayments[{i}].amount", "Enter the amount of the one-off payment.", allowZero: false, zeroMessage: "Enter an amount above $0, or remove this payment.");
            oneOffs.Add(new OneOffPayment(payment.Month ?? 1, amount));
        }

        return errors.Count > 0 ? (null, errors) : (new Scenario(debts, savings, goal, budget, extra, oneOffs), errors);

        decimal Money(decimal? value, string field, string missing, bool allowZero = true, string? zeroMessage = null)
        {
            if (value is null) { Error(field, missing); return 0; }
            if (value < 0) { Error(field, "Enter an amount of $0 or more."); return 0; }
            if (value > MaxMoney) { Error(field, $"Enter an amount of {Planner.Dollars(MaxMoney)} or less."); return 0; }
            var rounded = Math.Round(value.Value, 2, MidpointRounding.AwayFromZero);
            if (rounded == 0 && !allowZero) { Error(field, zeroMessage ?? missing); return 0; }
            return rounded;
        }
    }

    /// <summary>The named engine errors, as a message beside the monthly amount.</summary>
    public static IResult Problem(PlanFailure failure)
    {
        var (title, message) = failure.Error switch
        {
            PlanError.BudgetBelowMinimums => (
                "The monthly amount does not cover the minimum payments",
                $"Your minimum payments add up to {Planner.Dollars(failure.TotalMinimums)} a month, but the monthly amount is {Planner.Dollars(failure.Budget)}. Raise it to at least {Planner.Dollars(failure.TotalMinimums)}, or check the minimums."),
            PlanError.DebtNeverClears => (
                "This debt would never clear",
                $"With {Planner.Dollars(failure.Budget)} a month{(failure.DebtName is null ? "" : $", {failure.DebtName}")} never clears: interest is added as fast as it is paid. Raise the monthly amount, or check the APRs."),
            _ => (
                "This plan takes more than 50 years",
                $"With {Planner.Dollars(failure.Budget)} a month this plan takes more than 50 years, which is further than Ripple looks. Raise the monthly amount, or lower the emergency fund goal."),
        };
        return Results.ValidationProblem(
            new Dictionary<string, string[]> { ["monthlyBudget"] = [message] },
            title: title,
            statusCode: StatusCodes.Status422UnprocessableEntity,
            extensions: new Dictionary<string, object?> { ["code"] = failure.Error.ToString() });
    }
}
