using ScriptureExplorer.Models;

namespace ScriptureExplorer.Services.Interfaces
{
    public interface IBibleImportService
    {
        Task<ImportResult> ImportTurkishBibleAsync(string csvPath, bool forceReimport = false);
        Task<ImportResult> ImportTurkishBibleAsync(Stream csvStream, bool forceReimport = false);

        Task<ImportResult> ImportBibleCsvAsync(
    string csvPath,
    string lang,
    string translationCode,
    string source,
    bool forceReimport = false,
    bool hasHeader = true,
    string delimiter = ",",
    int skipLinesBeforeHeader = 0);


        // ✅ match your controller + service (2 args)
        Task<ImportResult> ImportKjvBibleAsync(string filePath, bool forceReimport = false);


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