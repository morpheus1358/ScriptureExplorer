using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScriptureExplorer.Migrations
{
    /// <inheritdoc />
    public partial class InitialProductionSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Books",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BookNumber = table.Column<int>(type: "int", nullable: false),
                    Testament = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Books", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BookNames",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BookId = table.Column<int>(type: "int", nullable: false),
                    Lang = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(450)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BookNames", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BookNames_Books_BookId",
                        column: x => x.BookId,
                        principalTable: "Books",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Chapters",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BookId = table.Column<int>(type: "int", nullable: false),
                    ChapterNumber = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Chapters", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Chapters_Books_BookId",
                        column: x => x.BookId,
                        principalTable: "Books",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Verses",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BookNumber = table.Column<int>(type: "int", nullable: false),
                    ChapterNumber = table.Column<int>(type: "int", nullable: false),
                    VerseNumber = table.Column<int>(type: "int", nullable: false),
                    ChapterId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Verses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Verses_Chapters_ChapterId",
                        column: x => x.ChapterId,
                        principalTable: "Chapters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VerseTranslations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    VerseId = table.Column<int>(type: "int", nullable: false),
                    Lang = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Text = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SourceKey = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    VerseRange = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VerseTranslations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VerseTranslations_Verses_VerseId",
                        column: x => x.VerseId,
                        principalTable: "Verses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BookNames_BookId",
                table: "BookNames",
                column: "BookId");

            migrationBuilder.CreateIndex(
                name: "IX_BookNames_Lang_Name",
                table: "BookNames",
                columns: new[] { "Lang", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_Chapters_BookId",
                table: "Chapters",
                column: "BookId");

            migrationBuilder.CreateIndex(
                name: "IX_Verses_BookNumber_ChapterNumber_VerseNumber",
                table: "Verses",
                columns: new[] { "BookNumber", "ChapterNumber", "VerseNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_Verses_ChapterId",
                table: "Verses",
                column: "ChapterId");

            migrationBuilder.CreateIndex(
                name: "IX_VerseTranslations_VerseId_Lang",
                table: "VerseTranslations",
                columns: new[] { "VerseId", "Lang" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BookNames");

            migrationBuilder.DropTable(
                name: "VerseTranslations");

            migrationBuilder.DropTable(
                name: "Verses");

            migrationBuilder.DropTable(
                name: "Chapters");

            migrationBuilder.DropTable(
                name: "Books");
        }
    }
}
