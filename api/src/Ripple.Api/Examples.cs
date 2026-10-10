using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ripple.Data;

namespace Ripple.Api;

/// <summary>
/// The example households the planner opens on.
///
/// Where the numbers come from: balances, savings and the loan payments are weighted medians
/// from the Federal Reserve's 2022 Survey of Consumer Finances (summary extract public data),
/// worked out by scripts/scf-examples.mjs. Each median is taken on its own across the group,
/// so an example is a typical household for that group and not one family's record.
///
/// What the survey extract does not have: interest rates, credit card minimum payments, an
/// emergency fund goal, or how much a household can put towards debt each month. Those are
/// assumptions, and <see cref="Assumed"/> says so in the app next to every example.
/// </summary>
public static class Examples
{
    private const string Assumed = "The interest rates, the card's minimum payment, the fund goal and the monthly amount are assumptions, not survey data.";

    private static string Source(string group) =>
        $"Balances, savings and the loan payment are medians for {group} in the Federal Reserve's 2022 Survey of Consumer Finances. {Assumed}";

    public static readonly IReadOnlyList<(string Slug, string Title, string Summary, string Source, ScenarioInput Input)> All =
    [
        (
            "under-35-card-and-student-loan",
            "Under 35 with a card and a student loan",
            "A small card balance at a high rate next to a much larger student loan at a low one.",
            Source("households under 35 with a card balance and a student loan"),
            new ScenarioInput(
                [new DebtInput("Credit card", 2200m, 22m, 55m), new DebtInput("Student loan", 20000m, 5.5m, 330m)],
                Savings: 5300m, EmergencyFundGoal: 8000m, MonthlyBudget: 600m, ExtraPerMonth: 0m, OneOffPayments: [])
        ),
        (
            "35-to-54-card-and-car-loan",
            "35 to 54 with a card and a car loan",
            "A car payment takes most of the monthly amount, leaving little extra for the card.",
            Source("households aged 35 to 54 with a card balance and a car loan"),
            new ScenarioInput(
                [new DebtInput("Credit card", 3300m, 22m, 85m), new DebtInput("Car loan", 16000m, 7.5m, 480m)],
                Savings: 6000m, EmergencyFundGoal: 10000m, MonthlyBudget: 800m, ExtraPerMonth: 0m, OneOffPayments: [])
        ),
        (
            "card-and-personal-loan",
            "A card and a smaller personal loan",
            "The smaller debt is not the expensive one, so the two pay-down orders give different answers.",
            Source("households with a card balance and another instalment loan"),
            new ScenarioInput(
                [new DebtInput("Credit card", 3500m, 22m, 90m), new DebtInput("Personal loan", 2100m, 11m, 200m)],
                Savings: 3340m, EmergencyFundGoal: 6000m, MonthlyBudget: 450m, ExtraPerMonth: 0m, OneOffPayments: [])
        ),
    ];

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Makes the table match the list above. Runs on every start-up.</summary>
    public static async Task Seed(RippleDb db, CancellationToken ct = default)
    {
        var existing = await db.ExampleHouseholds.ToListAsync(ct);
        foreach (var (example, order) in All.Select((e, i) => (e, i)))
        {
            var row = existing.FirstOrDefault(x => x.Slug == example.Slug);
            if (row is null) db.ExampleHouseholds.Add(row = new ExampleHousehold { Slug = example.Slug });
            row.Title = example.Title;
            row.Summary = example.Summary;
            row.Source = example.Source;
            row.Illustrative = false;
            row.Input = JsonSerializer.Serialize(example.Input, Json);
            row.SortOrder = order;
        }
        db.ExampleHouseholds.RemoveRange(existing.Where(x => All.All(e => e.Slug != x.Slug)));
        await db.SaveChangesAsync(ct);
    }
}
