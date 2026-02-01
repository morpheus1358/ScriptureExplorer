using Microsoft.EntityFrameworkCore;
using ScriptureExplorer.Data;
using ScriptureExplorer.Models;
using ScriptureExplorer.Services.Interfaces;
using System.Text;
using System.Text.RegularExpressions;
using CsvHelper;
using CsvHelper.Configuration;
using System.Globalization;

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

        public async Task<ImportResult> ImportTurkishBibleAsync(string csvPath, bool forceReimport = false)
        {
            _logger.LogInformation("Starting Turkish Bible import from {CsvPath}", csvPath);

            if (!File.Exists(csvPath))
                return new ImportResult { Success = false, Message = $"CSV file not found: {csvPath}" };

            using var stream = File.OpenRead(csvPath);
            return await ImportTurkishBibleAsync(stream, forceReimport);
        }


        public async Task<ImportResult> ImportTurkishBibleAsync(Stream csvStream, bool forceReimport = false)
        {
            var result = new ImportResult();

            try
            {
                if (forceReimport)
                {
                    // Only delete Turkish TR_TBS translations (do NOT delete Books/Chapters/Verses)
                    await _context.VerseTranslations
                        .Where(t => t.TranslationCode == "TR_TBS")
                        .ExecuteDeleteAsync();
                }
                else
                {
                    // If not forcing, block reimport if TR_TBS already exists
                    var exists = await _context.VerseTranslations.AnyAsync(t => t.TranslationCode == "TR_TBS");
                    if (exists)
                    {
                        return new ImportResult
                        {
                            Success = false,
                            Message = "TR_TBS already imported. Use ?force=true to reimport."
                        };
                    }
                }

                // Read file fully (we'll skip first 7 lines like your original code)
                using var sr = new StreamReader(csvStream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);

                var allLines = new List<string>();
                while (!sr.EndOfStream)
                    allLines.Add(await sr.ReadLineAsync() ?? "");

                var dataLines = allLines.Skip(7).Where(l => !string.IsNullOrWhiteSpace(l)).ToList();

                // Feed into CsvHelper
                using var reader = new StringReader(string.Join(Environment.NewLine, dataLines));

                var config = new CsvConfiguration(CultureInfo.InvariantCulture)
                {
                    Delimiter = ";",
                    HasHeaderRecord = false,
                    Quote = '"',
                    Escape = '"',
                    BadDataFound = null,
                    MissingFieldFound = null,
                    HeaderValidated = null,
                    DetectColumnCountChanges = false,
                    IgnoreBlankLines = true
                };

                using var csv = new CsvReader(reader, config);

                // Cache books/chapters/verses to avoid SaveChanges inside loops
                // We'll build the structure if missing, but NOT delete anything.
                var books = await _context.Books.Include(b => b.Names).ToListAsync();
                var chapters = await _context.Chapters.ToListAsync();
                var verses = await _context.Verses.ToListAsync();

                int versesImported = 0;
                int booksImported = 0;
                int chaptersImported = 0;

                while (await csv.ReadAsync())
                {
                    // Turkish CSV columns:
                    // 0 VerseId; 1 BookName; 2 BookNumber; 3 Chapter; 4 Verse; 5 Text
                    var verseIdStr = csv.GetField(0);
                    var bookName = (csv.GetField(1) ?? "").Trim();
                    var bookNumberStr = csv.GetField(2);
                    var chapterStr = csv.GetField(3);
                    var verseStr = csv.GetField(4);
                    var rawText = csv.GetField(5) ?? "";

                    if (!int.TryParse(bookNumberStr, out int bookNumber)) continue;
                    if (!int.TryParse(chapterStr, out int chapterNumber)) continue;
                    if (!int.TryParse(verseStr, out int verseNumber)) continue;

                    var text = CleanText(rawText);

                    // --- get or create Book ---
                    var book = books.FirstOrDefault(b => b.BookNumber == bookNumber);
                    if (book == null)
                    {
                        book = new Book
                        {
                            BookNumber = bookNumber,
                            Testament = bookNumber <= 39 ? Testament.Old : Testament.New,
                            Names = new List<BookName>()
                        };
                        _context.Books.Add(book);
                        await _context.SaveChangesAsync();

                        books.Add(book);
                        booksImported++;
                    }

                    if (!book.Names.Any(n => n.Lang == "tr"))
                    {
                        var bn = new BookName { BookId = book.Id, Lang = "tr", Name = bookName };
                        _context.BookNames.Add(bn);
                        book.Names.Add(bn);
                        await _context.SaveChangesAsync();
                    }

                    // --- get or create Chapter ---
                    var chapter = chapters.FirstOrDefault(c => c.BookId == book.Id && c.ChapterNumber == chapterNumber);
                    if (chapter == null)
                    {
                        chapter = new Chapter { BookId = book.Id, ChapterNumber = chapterNumber };
                        _context.Chapters.Add(chapter);
                        await _context.SaveChangesAsync();

                        chapters.Add(chapter);
                        chaptersImported++;
                    }

                    // --- get or create Verse ---
                    var verse = verses.FirstOrDefault(v => v.ChapterId == chapter.Id && v.VerseNumber == verseNumber);
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

                        verses.Add(verse);
                    }

                    // --- add translation (TR_TBS) ---
                    _context.VerseTranslations.Add(new VerseTranslation
                    {
                        VerseId = verse.Id,
                        Lang = "tr",
                        TranslationCode = "TR_TBS",
                        Text = text,
                        Source = "BibleSuperSearch",
                        SourceKey = verseIdStr ?? ""
                    });

                    versesImported++;
                    if (versesImported % 1000 == 0)
                        await _context.SaveChangesAsync();
                }

                await _context.SaveChangesAsync();

                result.Success = true;
                result.VersesImported = versesImported;
                result.BooksImported = booksImported;
                result.ChaptersImported = chaptersImported;
                result.TranslationsImported = versesImported;
                result.Message = $"Successfully imported {versesImported} TR_TBS verses.";
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Turkish Bible import failed");
                return new ImportResult { Success = false, Message = $"Import failed: {ex.Message}" };
            }
        }


        public async Task<ImportResult> ImportKjvBibleAsync(string filePath, bool forceReimport = false)
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
                // If you re-run import, you probably want to delete only KJV translations (not TR data)
                if (forceReimport)
                {
                    await _context.VerseTranslations
                        .Where(t => t.TranslationCode == "EN_KJV")
                        .ExecuteDeleteAsync();
                }

                // 1) Read until the real header line "Verse ID;Book Name;..."
                using var sr = new StreamReader(filePath, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);

                string? line;
                var remainder = new StringBuilder();
                bool headerFound = false;

                while ((line = await sr.ReadLineAsync()) != null)
                {
                    if (!headerFound)
                    {
                        if (line.StartsWith("Verse ID;", StringComparison.OrdinalIgnoreCase))
                        {
                            headerFound = true;
                            remainder.AppendLine(line);
                        }
                        continue;
                    }

                    remainder.AppendLine(line);
                }

                if (!headerFound)
                {
                    result.Success = false;
                    result.Message = "Could not find header line: 'Verse ID;Book Name;Book Number;Chapter;Verse;Text'";
                    return result;
                }

                // 2) Parse the remaining CSV properly (quotes + multiline supported)
                using var reader = new StringReader(remainder.ToString());
                var config = new CsvConfiguration(CultureInfo.InvariantCulture)
                {
                    Delimiter = ";",
                    HasHeaderRecord = true,
                    BadDataFound = null,
                    MissingFieldFound = null,
                    HeaderValidated = null,
                    DetectColumnCountChanges = false,
                    IgnoreBlankLines = true,
                    TrimOptions = TrimOptions.Trim
                };

                using var csv = new CsvReader(reader, config);

                while (await csv.ReadAsync())
                {
                    // Columns: Verse ID;Book Name;Book Number;Chapter;Verse;Text
                    var verseIdStr = csv.GetField(0);
                    var bookName = (csv.GetField(1) ?? "").Trim();
                    var bookNumberStr = csv.GetField(2);
                    var chapterNumberStr = csv.GetField(3);
                    var verseNumberStr = csv.GetField(4);
                    var rawText = csv.GetField(5) ?? "";

                    if (!int.TryParse(bookNumberStr, out int bookNumber)) continue;
                    if (!int.TryParse(chapterNumberStr, out int chapterNumber)) continue;
                    if (!int.TryParse(verseNumberStr, out int verseNumber)) continue;

                    var text = CleanKjvText(rawText);

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
                        .FirstOrDefaultAsync(v => v.ChapterId == chapter.Id && v.VerseNumber == verseNumber);

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
                    var hasKjv = await _context.VerseTranslations.AnyAsync(t =>
                        t.VerseId == verse.Id &&
                        t.TranslationCode == "EN_KJV"
                    );

                    if (!hasKjv)
                    {
                        _context.VerseTranslations.Add(new VerseTranslation
                        {
                            VerseId = verse.Id,
                            Lang = "en",
                            TranslationCode = "EN_KJV",
                            Source = "BibleSuperSearch",
                            SourceKey = verseIdStr ?? "",
                            Text = text
                        });

                        versesImported++;

                        // save in batches (much faster)
                        if (versesImported % 500 == 0)
                            await _context.SaveChangesAsync();
                    }
                }

                await _context.SaveChangesAsync();

                result.Success = true;
                result.VersesImported = versesImported;
                result.BooksImported = booksImported;
                result.ChaptersImported = chaptersImported;
                result.TranslationsImported = versesImported;
                result.Message = $"Successfully imported {versesImported} KJV verses.";
                _logger.LogInformation("KJV import completed: {Verses} verses", versesImported);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error importing KJV Bible from {File}", filePath);
                result.Success = false;
                result.Message = $"Error importing KJV Bible: {ex.Message}";
                return result;
            }
        }

        private string CleanKjvText(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
                return string.Empty;

            // Remove BOM / replacement artifacts
            text = text.Replace("\ufeff", "")
                       .Replace("ï»¿", "")
                       .Replace("�", "")
                       .Replace("¶", "");

            // Strip outer quotes + unescape double quotes
            text = text.Trim()
                       .Trim('"')
                       .Replace("\"\"", "\"");

            // ✅ Convert [That] -> That (keep content, drop brackets)
            text = Regex.Replace(text, @"\[(?<w>[^\]]+)\]", "${w}");

            // Normalize whitespace
            text = Regex.Replace(text, @"\s+", " ").Trim();

            return text;
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
                            TranslationCode = "TR_TBS",
                            Text = importVerse.Text,
                            Source = "BibleSuperSearch",
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

        public async Task<ImportResult> ImportBibleCsvAsync(
    string csvPath,
    string lang,
    string translationCode,
    string source,
    bool forceReimport = false,
    bool hasHeader = true,
    string delimiter = ",",
    int skipLinesBeforeHeader = 0)
        {
            _logger.LogInformation("Starting import {Code} ({Lang}) from {CsvPath}", translationCode, lang, csvPath);

            var result = new ImportResult();

            if (!File.Exists(csvPath))
                return new ImportResult { Success = false, Message = $"CSV file not found: {csvPath}" };

            lang = (lang ?? "").Trim().ToLowerInvariant();
            translationCode = (translationCode ?? "").Trim();

            if (string.IsNullOrWhiteSpace(lang) || string.IsNullOrWhiteSpace(translationCode))
                return new ImportResult { Success = false, Message = "lang and translationCode are required." };

            try
            {
                // If force: delete only that translationCode
                if (forceReimport)
                {
                    await _context.VerseTranslations
                        .Where(t => t.TranslationCode == translationCode)
                        .ExecuteDeleteAsync();
                }
                else
                {
                    var exists = await _context.VerseTranslations.AnyAsync(t => t.TranslationCode == translationCode);
                    if (exists)
                    {
                        return new ImportResult
                        {
                            Success = false,
                            Message = $"{translationCode} already imported. Use ?force=true to reimport."
                        };
                    }
                }

                // --- CSV Reader: UTF-8 + BOM detection ---
                using var fs = File.OpenRead(csvPath);
                using var sr = new StreamReader(fs, new UTF8Encoding(false, throwOnInvalidBytes: false), detectEncodingFromByteOrderMarks: true);

                // If you must skip lines before header (some files have license text)
                // we'll read into a buffer until we reach the "Verse ID" header if hasHeader,
                // or just skip N lines if no header.
                var textBuilder = new StringBuilder();
                if (skipLinesBeforeHeader > 0)
                {
                    for (int i = 0; i < skipLinesBeforeHeader && !sr.EndOfStream; i++)
                        await sr.ReadLineAsync();
                }

                if (hasHeader)
                {
                    string? line;
                    bool headerFound = false;

                    while ((line = await sr.ReadLineAsync()) != null)
                    {
                        if (!headerFound)
                        {
                            if (line.StartsWith("\"Verse ID\"", StringComparison.OrdinalIgnoreCase) ||
                                line.StartsWith("Verse ID", StringComparison.OrdinalIgnoreCase))
                            {
                                headerFound = true;
                                textBuilder.AppendLine(line);
                            }
                            continue;
                        }

                        textBuilder.AppendLine(line);
                    }

                    if (!headerFound)
                    {
                        return new ImportResult
                        {
                            Success = false,
                            Message = "Header not found. Expected: Verse ID, Book Name, Book Number, Chapter, Verse, Text"
                        };
                    }
                }
                else
                {
                    // No header: just read the rest
                    textBuilder.Append(await sr.ReadToEndAsync());
                }

                using var reader = new StringReader(textBuilder.ToString());

                var cfg = new CsvConfiguration(CultureInfo.InvariantCulture)
                {
                    Delimiter = delimiter,
                    HasHeaderRecord = hasHeader,
                    BadDataFound = null,
                    MissingFieldFound = null,
                    HeaderValidated = null,
                    DetectColumnCountChanges = false,
                    IgnoreBlankLines = true,
                    TrimOptions = TrimOptions.Trim
                };

                using var csv = new CsvReader(reader, cfg);
                if (hasHeader)
                    csv.Context.RegisterClassMap<ImportRowMap>(); // maps header names

                // --- Caches (no SaveChanges per row) ---
                var bookIdByNumber = await _context.Books.AsNoTracking()
                    .ToDictionaryAsync(b => b.BookNumber, b => b.Id);

                // Chapters cache: (BookId, ChapterNumber) -> ChapterId
                var chapterIdCache = await _context.Chapters.AsNoTracking()
                    .Select(c => new { c.BookId, c.ChapterNumber, c.Id })
                    .ToDictionaryAsync(x => (x.BookId, x.ChapterNumber), x => x.Id);

                // We’ll process in batches
                const int batchSize = 2000;
                var batch = new List<ImportRow>(batchSize);

                async Task FlushBatchAsync()
                {
                    if (batch.Count == 0) return;

                    // 1) Ensure missing Books (from this batch only)
                    var neededBookNums = batch.Select(b => b.BookNumber).Distinct().ToList();
                    var missingBookNums = neededBookNums.Where(bn => !bookIdByNumber.ContainsKey(bn)).ToList();

                    if (missingBookNums.Count > 0)
                    {
                        foreach (var bn in missingBookNums)
                        {
                            _context.Books.Add(new Book
                            {
                                BookNumber = bn,
                                Testament = bn <= 39 ? Testament.Old : Testament.New
                            });
                        }
                        await _context.SaveChangesAsync();

                        var insertedBooks = await _context.Books.AsNoTracking()
                            .Where(b => missingBookNums.Contains(b.BookNumber))
                            .ToListAsync();

                        foreach (var b in insertedBooks)
                            bookIdByNumber[b.BookNumber] = b.Id;

                        result.BooksImported += insertedBooks.Count;
                    }

                    // 2) Ensure BookName exists for that lang (optional but nice)
                    // This uses CSV book name as the localized name for that language.
                    // If you already have names, it won’t duplicate.
                    var bookNameAdds = new List<BookName>();
                    foreach (var g in batch.GroupBy(r => r.BookNumber))
                    {
                        var bookId = bookIdByNumber[g.Key];
                        var name = g.Select(x => x.BookName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? "";

                        if (string.IsNullOrWhiteSpace(name)) continue;

                        var exists = await _context.BookNames.AsNoTracking()
                            .AnyAsync(bn => bn.BookId == bookId && bn.Lang == lang);

                        if (!exists)
                        {
                            bookNameAdds.Add(new BookName { BookId = bookId, Lang = lang, Name = name });
                        }
                    }
                    if (bookNameAdds.Count > 0)
                    {
                        _context.BookNames.AddRange(bookNameAdds);
                        await _context.SaveChangesAsync();
                    }

                    // 3) Ensure Chapters exist
                    var neededChapters = batch.Select(r => (r.BookNumber, r.Chapter)).Distinct().ToList();

                    foreach (var group in neededChapters.GroupBy(x => x.BookNumber))
                    {
                        var bookId = bookIdByNumber[group.Key];
                        var chNums = group.Select(x => x.Chapter).Distinct().ToList();

                        // load existing chapters for these numbers
                        var existing = await _context.Chapters.AsNoTracking()
                            .Where(c => c.BookId == bookId && chNums.Contains(c.ChapterNumber))
                            .Select(c => new { c.Id, c.ChapterNumber })
                            .ToListAsync();

                        var existingSet = existing.Select(x => x.ChapterNumber).ToHashSet();
                        foreach (var c in existing)
                            chapterIdCache[(bookId, c.ChapterNumber)] = c.Id;

                        var missing = chNums.Where(n => !existingSet.Contains(n)).ToList();
                        if (missing.Count > 0)
                        {
                            foreach (var ch in missing)
                                _context.Chapters.Add(new Chapter { BookId = bookId, ChapterNumber = ch });

                            await _context.SaveChangesAsync();

                            var inserted = await _context.Chapters.AsNoTracking()
                                .Where(c => c.BookId == bookId && missing.Contains(c.ChapterNumber))
                                .Select(c => new { c.Id, c.ChapterNumber })
                                .ToListAsync();

                            foreach (var c in inserted)
                                chapterIdCache[(bookId, c.ChapterNumber)] = c.Id;

                            result.ChaptersImported += inserted.Count;
                        }
                    }

                    // 4) Load existing Verses for this batch
                    // Build a map from (BookNumber, Chapter, Verse) -> VerseId
                    var verseIdMap = new Dictionary<(int BookNumber, int Chapter, int Verse), int>();

                    foreach (var g in batch
                        .Select(r => (r.BookNumber, r.Chapter, r.Verse))
                        .Distinct()
                        .GroupBy(x => (x.BookNumber, x.Chapter)))
                    {
                        var verseNums = g.Select(x => x.Verse).ToList();
                        var loaded = await _context.Verses.AsNoTracking()
                            .Where(v => v.BookNumber == g.Key.BookNumber
                                     && v.ChapterNumber == g.Key.Chapter
                                     && verseNums.Contains(v.VerseNumber))
                            .Select(v => new { v.Id, v.BookNumber, v.ChapterNumber, v.VerseNumber })
                            .ToListAsync();

                        foreach (var v in loaded)
                            verseIdMap[(v.BookNumber, v.ChapterNumber, v.VerseNumber)] = v.Id;
                    }

                    // 5) Insert missing Verses (need ChapterId)
                    var missingVerseKeys = batch
                        .Select(r => (r.BookNumber, r.Chapter, r.Verse))
                        .Distinct()
                        .Where(k => !verseIdMap.ContainsKey(k))
                        .ToList();

                    if (missingVerseKeys.Count > 0)
                    {
                        foreach (var (bookNumber, chapterNumber, verseNumber) in missingVerseKeys)
                        {
                            var bookId = bookIdByNumber[bookNumber];
                            var chapterId = chapterIdCache[(bookId, chapterNumber)];

                            _context.Verses.Add(new Verse
                            {
                                BookNumber = bookNumber,
                                ChapterNumber = chapterNumber,
                                VerseNumber = verseNumber,
                                ChapterId = chapterId
                            });
                        }

                        await _context.SaveChangesAsync();
                        result.VersesImported += missingVerseKeys.Count;

                        // reload VerseIds for those missing keys
                        foreach (var g in missingVerseKeys.GroupBy(x => (x.BookNumber, x.Chapter)))
                        {
                            var verseNums = g.Select(x => x.Verse).ToList();
                            var loaded = await _context.Verses.AsNoTracking()
                                .Where(v => v.BookNumber == g.Key.BookNumber
                                         && v.ChapterNumber == g.Key.Chapter
                                         && verseNums.Contains(v.VerseNumber))
                                .Select(v => new { v.Id, v.BookNumber, v.ChapterNumber, v.VerseNumber })
                                .ToListAsync();

                            foreach (var v in loaded)
                                verseIdMap[(v.BookNumber, v.ChapterNumber, v.VerseNumber)] = v.Id;
                        }
                    }

                    // 6) Load existing VerseTranslations for this translationCode in this batch
                    var verseIds = verseIdMap.Values.Distinct().ToList();

                    var existingTranslations = await _context.VerseTranslations
                        .Where(vt => vt.TranslationCode == translationCode && verseIds.Contains(vt.VerseId))
                        .ToListAsync();

                    var existingByVerseId = existingTranslations.ToDictionary(x => x.VerseId);

                    // 7) Upsert translations
                    var toAdd = new List<VerseTranslation>();
                    int updated = 0;

                    foreach (var r in batch)
                    {
                        var key = (r.BookNumber, r.Chapter, r.Verse);
                        if (!verseIdMap.TryGetValue(key, out var verseId))
                            continue;

                        var text = FixMojibakeIfNeeded(CleanGenericText(r.Text));

                        if (existingByVerseId.TryGetValue(verseId, out var vt))
                        {
                            if (!string.Equals(vt.Text, text, StringComparison.Ordinal))
                            {
                                vt.Text = text;
                                vt.Lang = lang;
                                vt.Source = source;
                                vt.SourceKey = r.VerseId ?? "";
                                updated++;
                            }
                        }
                        else
                        {
                            toAdd.Add(new VerseTranslation
                            {
                                VerseId = verseId,
                                Lang = lang,
                                TranslationCode = translationCode,
                                Text = text,
                                Source = source,
                                SourceKey = r.VerseId ?? "",
                                VerseRange = ""
                            });
                        }
                    }

                    if (toAdd.Count > 0)
                    {
                        _context.VerseTranslations.AddRange(toAdd);
                        result.TranslationsImported += toAdd.Count;
                    }

                    result.TranslationsImported += updated;

                    await _context.SaveChangesAsync();
                    batch.Clear();
                }

                // Read records (streaming) and flush by batch
                if (hasHeader)
                {
                    await foreach (var row in csv.GetRecordsAsync<ImportRow>())
                    {
                        NormalizeRow(row);
                        batch.Add(row);
                        if (batch.Count >= batchSize)
                            await FlushBatchAsync();
                    }
                }
                else
                {
                    while (await csv.ReadAsync())
                    {
                        var row = new ImportRow
                        {
                            VerseId = csv.GetField(0),
                            BookName = csv.GetField(1),
                            BookNumber = int.Parse(csv.GetField(2) ?? "0"),
                            Chapter = int.Parse(csv.GetField(3) ?? "0"),
                            Verse = int.Parse(csv.GetField(4) ?? "0"),
                            Text = csv.GetField(5) ?? ""
                        };
                        NormalizeRow(row);
                        batch.Add(row);
                        if (batch.Count >= batchSize)
                            await FlushBatchAsync();
                    }
                }

                await FlushBatchAsync();

                result.Success = true;
                result.Message = $"Imported {translationCode} ({lang}). Books+={result.BooksImported}, Chapters+={result.ChaptersImported}, Verses+={result.VersesImported}, Translations~={result.TranslationsImported}.";
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Import failed for {TranslationCode}", translationCode);
                result.Success = false;
                result.Message = $"Import failed: {ex.Message}";
                return result;
            }

            void NormalizeRow(ImportRow row)
            {
                row.VerseId = (row.VerseId ?? "").Trim();
                row.BookName = FixMojibakeIfNeeded((row.BookName ?? "").Trim());
                row.Text = FixMojibakeIfNeeded(row.Text ?? "");
            }
        }

        private static string CleanGenericText(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return string.Empty;

            // remove BOM / weird artifacts + normalize quotes a bit
            text = text.Replace("\ufeff", "")
                       .Replace("ï»¿", "")
                       .Replace("�", "")
                       .Replace("¶", "");

            text = text.Trim()
                       .Trim('"')
                       .Replace("\"\"", "\"")
                       .Replace("\\\"", "\"")
                       .Replace("“", "\"")
                       .Replace("”", "\"");

            // whitespace normalize (keep line breaks out by collapsing)
            text = Regex.Replace(text, @"\s+", " ").Trim();
            return text;
        }

        // Fix GenÃ¨se -> Genèse, etc.
        private static string FixMojibakeIfNeeded(string input)
        {
            if (string.IsNullOrEmpty(input)) return input;

            if (input.Contains('Ã') || input.Contains('Â') || input.Contains("â"))
            {
                var bytes = Encoding.GetEncoding(1252).GetBytes(input);
                try { return Encoding.UTF8.GetString(bytes); } catch { return input; }
            }
            return input;
        }

        private sealed class ImportRow
        {
            public string? VerseId { get; set; }
            public string BookName { get; set; } = "";
            public int BookNumber { get; set; }
            public int Chapter { get; set; }
            public int Verse { get; set; }
            public string Text { get; set; } = "";
        }

        private sealed class ImportRowMap : CsvHelper.Configuration.ClassMap<ImportRow>
        {
            public ImportRowMap()
            {
                Map(m => m.VerseId).Name("Verse ID");
                Map(m => m.BookName).Name("Book Name");
                Map(m => m.BookNumber).Name("Book Number");
                Map(m => m.Chapter).Name("Chapter");
                Map(m => m.Verse).Name("Verse");
                Map(m => m.Text).Name("Text");
            }
        }

    }
}