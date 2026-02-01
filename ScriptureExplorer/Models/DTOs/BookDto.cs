namespace ScriptureExplorer.DTOs
{
    public class BookDto
    {
        public int Id { get; set; }
        public int BookNumber { get; set; }
        public string Testament { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public int TotalChapters { get; set; }
    }
}