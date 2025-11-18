using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScriptureExplorer.Migrations
{
    /// <inheritdoc />
    public partial class AddTranslationCodeToVerseTranslations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TranslationCode",
                table: "VerseTranslations",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TranslationCode",
                table: "VerseTranslations");
        }
    }
}
