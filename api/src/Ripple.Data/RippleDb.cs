using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Ripple.Data;

/// <summary>A scenario someone chose to share. Nothing is stored until they press Share.</summary>
public class SavedScenario
{
    public long Id { get; set; }

    /// <summary>The short random code in the share link.</summary>
    public string Code { get; set; } = "";

    /// <summary>The inputs exactly as they were validated, as JSON.</summary>
    public string Input { get; set; } = "{}";

    /// <summary>The version of the engine rules when it was saved.</summary>
    public string EngineVersion { get; set; } = "";

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Scenarios not opened for twelve months are deleted.</summary>
    public DateTimeOffset LastOpenedAt { get; set; }
}

/// <summary>One observation of an outside series, such as the average credit card rate from FRED.</summary>
public class ReferenceRate
{
    public long Id { get; set; }
    public string SeriesId { get; set; } = "";
    public decimal Value { get; set; }
    public DateOnly ObservedDate { get; set; }
    public DateTimeOffset RetrievedAt { get; set; }
}

/// <summary>A starting point for the planner. Seeded on start-up from the list in the API project.</summary>
public class ExampleHousehold
{
    public int Id { get; set; }
    public string Slug { get; set; } = "";
    public string Title { get; set; } = "";
    public string Summary { get; set; } = "";

    /// <summary>Where the numbers come from, in words the app shows as written.</summary>
    public string Source { get; set; } = "";

    /// <summary>True when the numbers are made up for illustration rather than taken from data.</summary>
    public bool Illustrative { get; set; }

    public string Input { get; set; } = "{}";
    public int SortOrder { get; set; }
}

public class RippleDb(DbContextOptions<RippleDb> options) : DbContext(options)
{
    public DbSet<SavedScenario> Scenarios => Set<SavedScenario>();
    public DbSet<ReferenceRate> ReferenceRates => Set<ReferenceRate>();
    public DbSet<ExampleHousehold> ExampleHouseholds => Set<ExampleHousehold>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<SavedScenario>(e =>
        {
            e.ToTable("scenarios");
            e.Property(s => s.Id).HasColumnName("id");
            e.Property(s => s.Code).HasColumnName("code").HasMaxLength(16);
            e.Property(s => s.Input).HasColumnName("input").HasColumnType("jsonb");
            e.Property(s => s.EngineVersion).HasColumnName("engine_version").HasMaxLength(16);
            e.Property(s => s.CreatedAt).HasColumnName("created_at");
            e.Property(s => s.LastOpenedAt).HasColumnName("last_opened_at");
            e.HasIndex(s => s.Code).IsUnique();
            // The daily clean-up looks for the oldest of these.
            e.HasIndex(s => s.LastOpenedAt);
        });

        model.Entity<ReferenceRate>(e =>
        {
            e.ToTable("reference_rates");
            e.Property(r => r.Id).HasColumnName("id");
            e.Property(r => r.SeriesId).HasColumnName("series_id").HasMaxLength(64);
            e.Property(r => r.Value).HasColumnName("value").HasPrecision(12, 4);
            e.Property(r => r.ObservedDate).HasColumnName("observed_date");
            e.Property(r => r.RetrievedAt).HasColumnName("retrieved_at");
            e.HasIndex(r => new { r.SeriesId, r.ObservedDate }).IsUnique();
        });

        model.Entity<ExampleHousehold>(e =>
        {
            e.ToTable("example_households");
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Slug).HasColumnName("slug").HasMaxLength(64);
            e.Property(x => x.Title).HasColumnName("title").HasMaxLength(120);
            e.Property(x => x.Summary).HasColumnName("summary").HasMaxLength(400);
            e.Property(x => x.Source).HasColumnName("source").HasMaxLength(400);
            e.Property(x => x.Illustrative).HasColumnName("illustrative");
            e.Property(x => x.Input).HasColumnName("input").HasColumnType("jsonb");
            e.Property(x => x.SortOrder).HasColumnName("sort_order");
            e.HasIndex(x => x.Slug).IsUnique();
        });
    }
}

/// <summary>Lets `dotnet ef` build the model without starting the API.</summary>
public class RippleDbFactory : IDesignTimeDbContextFactory<RippleDb>
{
    public RippleDb CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<RippleDb>()
            .UseNpgsql("Host=localhost;Port=5435;Database=ripple;Username=ripple;Password=ripple")
            .Options);
}
