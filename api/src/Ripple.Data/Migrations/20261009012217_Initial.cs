using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Ripple.Data.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "example_households",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    slug = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    summary = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    source = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    illustrative = table.Column<bool>(type: "boolean", nullable: false),
                    input = table.Column<string>(type: "jsonb", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_example_households", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "reference_rates",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    series_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    value = table.Column<decimal>(type: "numeric(12,4)", precision: 12, scale: 4, nullable: false),
                    observed_date = table.Column<DateOnly>(type: "date", nullable: false),
                    retrieved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reference_rates", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "scenarios",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    code = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    input = table.Column<string>(type: "jsonb", nullable: false),
                    engine_version = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_opened_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_scenarios", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_example_households_slug",
                table: "example_households",
                column: "slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_reference_rates_series_id_observed_date",
                table: "reference_rates",
                columns: new[] { "series_id", "observed_date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_scenarios_code",
                table: "scenarios",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_scenarios_last_opened_at",
                table: "scenarios",
                column: "last_opened_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "example_households");

            migrationBuilder.DropTable(
                name: "reference_rates");

            migrationBuilder.DropTable(
                name: "scenarios");
        }
    }
}
