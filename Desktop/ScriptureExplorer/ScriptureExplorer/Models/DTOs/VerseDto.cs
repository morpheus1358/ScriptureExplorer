namespace ScriptureExplorer.DTOs
{
    public class VerseDto
    {
        public int Id { get; set; }
        public int Number { get; set; }
        public string Text { get; set; } = string.Empty;
        public string BookName { get; set; } = string.Empty;
        public int ChapterNumber { get; set; }
    }
}