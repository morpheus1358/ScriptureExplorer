using Microsoft.EntityFrameworkCore;
using ScriptureExplorer.Data;
using ScriptureExplorer.Models;
using ScriptureExplorer.Services.Interfaces;
using System.Text;

namespace ScriptureExplorer.Services
{
    public class BibleImportService : IBibleImportService
    {
        private readonly AppDbContext _context;
        private readonly ILogger<BibleImportService> _logger;

        public BibleImportService(AppDbContext context, ILogger<BibleImportService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<ImportResult> ImportTurkishBibleAsync(string csvPath)
        {
            _logger.LogInformation("Starting Turkish Bible import from {CsvPath}", csvPath);

            if (!File.Exists(csvPath))
            {
                return new ImportResult
                {
                    Success = false,
                    Message = $"CSV file not found: {csvPath}"
                };
            }

            using var stream = File.OpenRead(csvPath);
            return await ImportTurkishBibleAsync(stream);
        }

        public async Task<ImportResult> ImportTurkishBibleAsync(Stream csvStream)
        {
            var result = new ImportResult();
            var importVerses = new List<ImportVerse>();

            try
            {
                // Read and parse CSV
                using var reader = new StreamReader(csvStream, Encoding.UTF8);
                var lines = new List<string>();
                while (!reader.EndOfStream)
                {
                    lines.Add(await reader.ReadLineAsync());
                }

                var verseLines = lines.Skip(7).Where(line => !string.IsNullOrWhiteSpace(line));

                foreach (var line in verseLines)
                {
                    if (TryParseLine(line, out var importVerse))
                    {
                        importVerses.Add(importVerse);
                    }
                    else
                    {
                        result.Errors.Add($"Failed to parse line: {line}");
                    }
                }

                _logger.LogInformation("Parsed {VerseCount} verses from CSV", importVerses.Count);

                // Import into database
                await ClearExistingDataAsync();
                var importStats = await ImportToDatabaseAsync(importVerses);

                result.Success = true;
                result.BooksImported = importStats.BookCount;
                result.ChaptersImported = importStats.ChapterCount;
                result.VersesImported = importStats.VerseCount;
                result.TranslationsImported = importStats.TranslationCount;
                result.Message = $"Successfully imported {importStats.VerseCount} Turkish Bible verses";

                _logger.LogInformation("Turkish Bible import completed: {Message}", result.Message);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = $"Import failed: {ex.Message}";
                _logger.LogError(ex, "Turkish Bible import failed");
            }

            return result;
        }

        public async Task<ImportResult> ImportKjvBibleAsync(string filePath)
        {
            var result = new ImportResult();

            if (!File.Exists(filePath))
            {
                result.Success = false;
                result.Message = $"File not found: {filePath}";
                return result;
            }

            int versesImported = 0;
            int booksImported = 0;
            int chaptersImported = 0;

            try
            {
                using var reader = new StreamReader(filePath, Encoding.UTF8);

                string? line;
                bool headerPassed = false;
                int lineNumber = 0;

                while ((line = await reader.ReadLineAsync()) != null)
                {
                    lineNumber++;
                    if (string.IsNullOrWhiteSpace(line))
                        continue;

                    // Skip metadata until we hit the real header line:
                    // Verse ID;Book Name;Book Number;Chapter;Verse;Text
                    if (!headerPassed)
                    {
                        if (line.StartsWith("Verse ID;"))
                            headerPassed = true;

                        continue;
                    }

                    var parts = line.Split(';');
                    if (parts.Length < 6)
                        continue;

                    // Columns: Verse ID;Book Name;Book Number;Chapter;Verse;Text
                    string bookName = parts[1].Trim();
                    if (!int.TryParse(parts[2], out int bookNumber)) continue;
                    if (!int.TryParse(parts[3], out int chapterNumber)) continue;
                    if (!int.TryParse(parts[4], out int verseNumber)) continue;

                    string text = CleanKjvText(parts[5]);

                    // --- get or create Book ---
                    var book = await _context.Books
                        .Include(b => b.Names)
                        .FirstOrDefaultAsync(b => b.BookNumber == bookNumber);

                    if (book == null)
                    {
                        book = new Book
                        {
                            BookNumber = bookNumber,
                            Testament = bookNumber <= 39 ? Testament.Old : Testament.New,
                            Names = new List<BookName>
                    {
                        new BookName { Lang = "en", Name = bookName }
                    }
                        };

                        _context.Books.Add(book);
                        booksImported++;
                        await _context.SaveChangesAsync();
                    }
                    else if (!book.Names.Any(n => n.Lang == "en"))
                    {
                        book.Names.Add(new BookName { Lang = "en", Name = bookName });
                        await _context.SaveChangesAsync();
                    }

                    // --- get or create Chapter ---
                    var chapter = await _context.Chapters
                        .FirstOrDefaultAsync(c => c.BookId == book.Id && c.ChapterNumber == chapterNumber);

                    if (chapter == null)
                    {
                        chapter = new Chapter
                        {
                            BookId = book.Id,
                            ChapterNumber = chapterNumber
                        };
                        _context.Chapters.Add(chapter);
                        chaptersImported++;
                        await _context.SaveChangesAsync();
                    }

                    // --- get or create Verse ---
                    var verse = await _context.Verses
                        .FirstOrDefaultAsync(v =>
                            v.ChapterId == chapter.Id &&
                            v.VerseNumber == verseNumber);

                    if (verse == null)
                    {
                        verse = new Verse
                        {
                            BookNumber = bookNumber,
                            ChapterNumber = chapterNumber,
                            VerseNumber = verseNumber,
                            ChapterId = chapter.Id
                        };
                        _context.Verses.Add(verse);
                        await _context.SaveChangesAsync();
                    }

                    // --- add translation (KJV) ---
                    if (!await _context.VerseTranslations
        .AnyAsync(t => t.VerseId == verse.Id && t.Lang == "en"))
                    {
                        var translation = new VerseTranslation
                        {
                            VerseId = verse.Id,
                            Lang = "en",
                            Text = text
                        };


                        _context.VerseTranslations.Add(translation);
                        versesImported++;
                        await _context.SaveChangesAsync();
                    }
                }

                result.Success = true;
                result.VersesImported = versesImported;
                result.BooksImported = booksImported;
                result.ChaptersImported = chaptersImported;
                result.TranslationsImported = versesImported;
                result.Message = $"Successfully imported {versesImported} KJV verses.";

                _logger.LogInformation("KJV import completed: {Verses} verses", versesImported);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error importing KJV Bible from {File}", filePath);
                result.Success = false;
                result.Message = $"Error importing KJV Bible: {ex.Message}";
            }

            return result;
        }

        private string CleanKjvText(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
                return string.Empty;

            text = text.Replace("\ufeff", "");   // remove BOM if present
            text = text.Replace("�", "");       // weird replacement char, if any
            text = text.Replace("¶", "");       // paragraph marker
            text = text.Trim();

            // If you *also* want to drop [bracketed] additions, uncomment:
            // text = Regex.Replace(text, @"\[(.*?)\]", "").Trim();

            return text;
        }

        private bool TryParseLine(string line, out ImportVerse importVerse)
        {
            importVerse = null;
            var columns = line.Split(';');

            if (columns.Length >= 6 && int.TryParse(columns[0], out var verseId))
            {
                importVerse = new ImportVerse
                {
                    VerseId = verseId,
                    BookName = columns[1].Trim(),
                    BookNumber = int.Parse(columns[2]),
                    Chapter = int.Parse(columns[3]),
                    Verse = int.Parse(columns[4]),
                    Text = CleanText(columns[5])
                };
                return true;
            }

            return false;
        }

        private string CleanText(string text)
        {
            return text.Trim()
                       .Trim('"')
                       .Replace("\"\"", "\"")
                       .Replace("\\\"", "\"")
                       .Replace("“", "\"")
                       .Replace("”", "\"");
        }

        private async Task ClearExistingDataAsync()
        {
            _logger.LogInformation("Clearing existing Bible data...");

            await _context.VerseTranslations.ExecuteDeleteAsync();
            await _context.Verses.ExecuteDeleteAsync();
            await _context.Chapters.ExecuteDeleteAsync();
            await _context.BookNames.ExecuteDeleteAsync();
            await _context.Books.ExecuteDeleteAsync();

            _logger.LogInformation("Existing Bible data cleared");
        }

        private async Task<ImportStats> ImportToDatabaseAsync(List<ImportVerse> importVerses)
        {
            var stats = new ImportStats();
            var bookGroups = importVerses.GroupBy(v => new { v.BookName, v.BookNumber });

            foreach (var bookGroup in bookGroups)
            {
                // Kitap yarat
                var book = new Book
                {
                    BookNumber = bookGroup.Key.BookNumber,
                    Testament = bookGroup.Key.BookNumber <= 39 ? Testament.Old : Testament.New
                };
                _context.Books.Add(book);
                await _context.SaveChangesAsync(); // Get Book ID

                // Add Turkish book name
                var bookName = new BookName
                {
                    BookId = book.Id,
                    Lang = "tr",
                    Name = bookGroup.Key.BookName.Trim()
                };
                _context.BookNames.Add(bookName);

                // Process chapters
                var chapterGroups = bookGroup.GroupBy(v => v.Chapter);

                foreach (var chapterGroup in chapterGroups)
                {
                    var chapter = new Chapter
                    {
                        BookId = book.Id,
                        ChapterNumber = chapterGroup.Key
                    };
                    _context.Chapters.Add(chapter);
                    await _context.SaveChangesAsync(); // Get Chapter ID

                    // Process verses
                    foreach (var importVerse in chapterGroup.OrderBy(v => v.Verse))
                    {
                        var verse = new Verse
                        {
                            BookNumber = bookGroup.Key.BookNumber,
                            ChapterNumber = chapterGroup.Key,
                            VerseNumber = importVerse.Verse,
                            ChapterId = chapter.Id
                        };
                        _context.Verses.Add(verse);
                        await _context.SaveChangesAsync(); // Get Verse ID

                        // Add Turkish translation
                        var translation = new VerseTranslation
                        {
                            VerseId = verse.Id,
                            Lang = "tr",
                            Text = importVerse.Text,
                            Source = "TurkishBible",
                            SourceKey = importVerse.VerseId.ToString()
                        };
                        _context.VerseTranslations.Add(translation);

                        stats.VerseCount++;
                        stats.TranslationCount++;
                    }
                    stats.ChapterCount++;
                }
                stats.BookCount++;

                _logger.LogInformation("Imported book: {BookName} ({VerseCount} verses)",
                    bookGroup.Key.BookName, bookGroup.Count());
            }

            return stats;
        }




        private class ImportVerse
        {
            public int VerseId { get; set; }
            public string BookName { get; set; } = string.Empty;
            public int BookNumber { get; set; }
            public int Chapter { get; set; }
            public int Verse { get; set; }
            public string Text { get; set; } = string.Empty;
        }

        private class ImportStats
        {
            public int BookCount { get; set; }
            public int ChapterCount { get; set; }
            public int VerseCount { get; set; }
            public int TranslationCount { get; set; }
        }
    }
}