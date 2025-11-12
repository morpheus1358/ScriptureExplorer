namespace ScriptureExplorer.DTOs
{
    public class VerseDto
    {
        public int Id { get; set; }
        public int VerseNumber { get; set; }
        public string Text { get; set; } = string.Empty;
        public string BookName { get; set; } = string.Empty;
        public int ChapterNumber { get; set; }
        public int BookNumber { get; set; }
        public string Language { get; set; } = "tr";

        public string Reference => $"{BookName} {ChapterNumber}:{VerseNumber}";
        public string RangeUrl => $"/api/Verses/{BookName}/{ChapterNumber}/{VerseNumber}";
        public string ContextUrl => $"/api/Verses/{BookName}/{ChapterNumber}"; // Full chapter
    }
}