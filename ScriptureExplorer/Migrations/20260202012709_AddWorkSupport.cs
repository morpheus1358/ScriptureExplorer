using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScriptureExplorer.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkSupport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Verses_BookNumber_ChapterNumber_VerseNumber",
                table: "Verses");

            migrationBuilder.AlterColumn<string>(
                name: "TranslationCode",
                table: "VerseTranslations",
                type: "nvarchar(450)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AddColumn<int>(
                name: "Work",
                table: "Verses",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Work",
                table: "Books",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_VerseTranslations_Lang_TranslationCode",
                table: "VerseTranslations",
                columns: new[] { "Lang", "TranslationCode" });

            migrationBuilder.CreateIndex(
                name: "IX_VerseTranslations_VerseId_TranslationCode",
                table: "VerseTranslations",
                columns: new[] { "VerseId", "TranslationCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Verses_Work_BookNumber_ChapterNumber_VerseNumber",
                table: "Verses",
                columns: new[] { "Work", "BookNumber", "ChapterNumber", "VerseNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_VerseTranslations_Lang_TranslationCode",
                table: "VerseTranslations");

            migrationBuilder.DropIndex(
                name: "IX_VerseTranslations_VerseId_TranslationCode",
                table: "VerseTranslations");

            migrationBuilder.DropIndex(
                name: "IX_Verses_Work_BookNumber_ChapterNumber_VerseNumber",
                table: "Verses");

            migrationBuilder.DropColumn(
                name: "Work",
                table: "Verses");

            migrationBuilder.DropColumn(
                name: "Work",
                table: "Books");

            migrationBuilder.AlterColumn<string>(
                name: "TranslationCode",
                table: "VerseTranslations",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)");

            migrationBuilder.CreateIndex(
                name: "IX_Verses_BookNumber_ChapterNumber_VerseNumber",
                table: "Verses",
                columns: new[] { "BookNumber", "ChapterNumber", "VerseNumber" });
        }
    }
}
