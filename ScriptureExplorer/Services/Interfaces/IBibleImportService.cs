using ScriptureExplorer.Models;

namespace ScriptureExplorer.Services.Interfaces
{
    public interface IBibleImportService
    {
        Task<ImportResult> ImportTurkishBibleAsync(string csvPath);
        Task<ImportResult> ImportTurkishBibleAsync(Stream csvStream);
    }

    public class ImportResult
    {
        public bool Success { get; set; }
        public int BooksImported { get; set; }
        public int ChaptersImported { get; set; }
        public int VersesImported { get; set; }
        public int TranslationsImported { get; set; }
        public string Message { get; set; } = string.Empty;
        public List<string> Errors { get; set; } = new List<string>();
    }
}