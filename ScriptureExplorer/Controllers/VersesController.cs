using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ScriptureExplorer.Data;
using ScriptureExplorer.DTOs;
using ScriptureExplorer.Models;
using ScriptureExplorer.Models.DTOs.ScriptureExplorer.DTOs;

namespace ScriptureExplorer.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class VersesController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<VersesController> _logger;

        public VersesController(AppDbContext context, ILogger<VersesController> logger)
        {
            _context = context;
            _logger = logger;
        }

        // --------------------
        // Helpers
        // --------------------
        private static string NormalizeLang(string? lang)
            => string.IsNullOrWhiteSpace(lang) ? "tr" : lang.Trim().ToLowerInvariant();

        private static string NormalizeTranslationCode(string? translationCode)
            => string.IsNullOrWhiteSpace(translationCode) ? "" : translationCode.Trim();

        // ✅ IMPORTANT:
        // This must map your "default translation per language"
        // so requests like ?lang=fr work without requiring translationCode every time.
        private static string TranslationCodeFor(string lang)
            => lang switch
            {
                "tr" => "TR_TBS",
                "en" => "EN_KJV",

                // ✅ your imported public-domain translations
                "fr" => "FR_LS1910",
                "es" => "ES_RV1909",
                "de" => "DE_ELB1905",
                "ru" => "RU_SYNODAL",
                "nl" => "NL_SV",

                // fallback: if you ever import something else and still pass ?translationCode=...
                _ => lang
            };

        private static string ResolveTranslationCode(string lang, string? translationCode)
        {
            var tc = NormalizeTranslationCode(translationCode);
            return !string.IsNullOrWhiteSpace(tc) ? tc : TranslationCodeFor(lang);
        }

        private static List<int> ParseVerseRangeStatic(string verseRange)
        {
            var result = new List<int>();
            if (string.IsNullOrWhiteSpace(verseRange))
                return result;

            var parts = verseRange.Replace(" ", "").Split(',');

            foreach (var part in parts)
            {
                if (part.Contains("-"))
                {
                    var rangeParts = part.Split('-');
                    if (rangeParts.Length == 2 &&
                        int.TryParse(rangeParts[0], out int start) &&
                        int.TryParse(rangeParts[1], out int end) &&
                        start <= end)
                    {
                        result.AddRange(Enumerable.Range(start, end - start + 1));
                    }
                }
                else
                {
                    if (int.TryParse(part, out int verse))
                        result.Add(verse);
                }
            }

            return result.Distinct().OrderBy(v => v).ToList();
        }

        // --------------------
        // Parallel endpoint (optional; your UI doesn't require it)
        // --------------------
        [HttpGet("{bookName}/{chapterNumber:int}/parallel")]
        public async Task<ActionResult<List<ParallelVerseDto>>> GetChapterParallel(
            string bookName,
            int chapterNumber,
            [FromQuery] string primary = "tr",
            [FromQuery] string secondary = "en",
            [FromQuery] string? primaryTranslationCode = null,
            [FromQuery] string? secondaryTranslationCode = null)
        {
            try
            {
                primary = NormalizeLang(primary);
                secondary = NormalizeLang(secondary);

                if (primary.Equals(secondary, StringComparison.OrdinalIgnoreCase))
                    return BadRequest("primary and secondary languages must be different.");

                var primaryCode = ResolveTranslationCode(primary, primaryTranslationCode);
                var secondaryCode = ResolveTranslationCode(secondary, secondaryTranslationCode);

                _logger.LogInformation("Getting parallel chapter: {Book} {Chapter} ({Primary}/{PrimaryCode}) vs ({Secondary}/{SecondaryCode})",
                    bookName, chapterNumber, primary, primaryCode, secondary, secondaryCode);

                var verses = await _context.Verses
                    .Include(v => v.Chapter)
                        .ThenInclude(c => c.Book)
                            .ThenInclude(b => b.Names)
                    .Include(v => v.Translations)
                    .Where(v =>
                        v.Chapter.Book.Names.Any(n => n.Name.ToLower() == bookName.ToLower()) &&
                        v.Chapter.ChapterNumber == chapterNumber)
                    .OrderBy(v => v.VerseNumber)
                    .Select(v => new ParallelVerseDto
                    {
                        VerseNumber = v.VerseNumber,

                        PrimaryText = v.Translations
                            .Where(t => t.Lang == primary && t.TranslationCode == primaryCode)
                            .Select(t => t.Text)
                            .FirstOrDefault() ?? "",

                        SecondaryText = v.Translations
                            .Where(t => t.Lang == secondary && t.TranslationCode == secondaryCode)
                            .Select(t => t.Text)
                            .FirstOrDefault() ?? "",

                        BookName =
                            v.Chapter.Book.Names.Where(n => n.Lang == primary).Select(n => n.Name).FirstOrDefault()
                            ?? v.Chapter.Book.Names.Where(n => n.Lang == "tr").Select(n => n.Name).FirstOrDefault()
                            ?? v.Chapter.Book.Names.Where(n => n.Lang == "en").Select(n => n.Name).FirstOrDefault()
                            ?? bookName,

                        ChapterNumber = v.Chapter.ChapterNumber,
                        BookNumber = v.BookNumber,

                        PrimaryLang = primary,
                        SecondaryLang = secondary
                    })
                    .ToListAsync();

                // Filter out rows where BOTH texts missing (optional)
                verses = verses.Where(v => !string.IsNullOrWhiteSpace(v.PrimaryText) || !string.IsNullOrWhiteSpace(v.SecondaryText)).ToList();

                if (!verses.Any())
                    return NotFound($"Chapter not found: {bookName} {chapterNumber}");

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting parallel chapter: {Book} {Chapter}", bookName, chapterNumber);
                return StatusCode(500, "An error occurred while retrieving the parallel chapter");
            }
        }

        // --------------------
        // GET: /api/verses/by-number/1/1?lang=fr&translationCode=FR_LS1910
        // --------------------
        [HttpGet("by-number/{bookNumber:int}/{chapterNumber:int}")]
        public async Task<ActionResult<List<VerseDto>>> GetChapterByNumber(
            int bookNumber,
            int chapterNumber,
            [FromQuery] string lang = "tr",
            [FromQuery] string? translationCode = null)
        {
            try
            {
                lang = NormalizeLang(lang);
                var code = ResolveTranslationCode(lang, translationCode);

                var verses = await _context.VerseTranslations
                    .Where(vt =>
                        vt.Lang == lang &&
                        vt.TranslationCode == code &&
                        vt.Verse.BookNumber == bookNumber &&
                        vt.Verse.ChapterNumber == chapterNumber)
                    .OrderBy(vt => vt.Verse.VerseNumber)
                    .Select(vt => new VerseDto
                    {
                        Id = vt.Verse.Id,
                        VerseNumber = vt.Verse.VerseNumber,
                        Text = vt.Text,
                        BookName =
                            vt.Verse.Chapter.Book.Names.Where(n => n.Lang == lang).Select(n => n.Name).FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names.Where(n => n.Lang == "en").Select(n => n.Name).FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names.Where(n => n.Lang == "tr").Select(n => n.Name).FirstOrDefault()
                            ?? "Unknown",
                        ChapterNumber = vt.Verse.ChapterNumber,
                        BookNumber = vt.Verse.BookNumber,
                        Language = lang
                    })
                    .ToListAsync();

                if (!verses.Any())
                    return NotFound($"No verses for book {bookNumber} chapter {chapterNumber} in '{lang}/{code}'");

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting chapter by-number: {Book} {Chapter}", bookNumber, chapterNumber);
                return StatusCode(500, "An error occurred while retrieving the chapter");
            }
        }

        // --------------------
        // GET: /api/verses/{bookName}/{chapterNumber}?lang=..&translationCode=..
        // --------------------
        [HttpGet("{bookName}/{chapterNumber:int}")]
        public async Task<ActionResult<List<VerseDto>>> GetChapter(
            string bookName,
            int chapterNumber,
            [FromQuery] string lang = "tr",
            [FromQuery] string? translationCode = null)
        {
            try
            {
                lang = NormalizeLang(lang);
                var code = ResolveTranslationCode(lang, translationCode);

                _logger.LogInformation("Getting chapter: {Book} {Chapter} ({Lang}/{Code})",
                    bookName, chapterNumber, lang, code);

                var verses = await _context.VerseTranslations
                    .Where(vt =>
                        vt.Lang == lang &&
                        vt.TranslationCode == code &&
                        vt.Verse.Chapter.ChapterNumber == chapterNumber &&
                        vt.Verse.Chapter.Book.Names.Any(n => n.Name.ToLower() == bookName.ToLower()))
                    .OrderBy(vt => vt.Verse.VerseNumber)
                    .Select(vt => new VerseDto
                    {
                        Id = vt.Verse.Id,
                        VerseNumber = vt.Verse.VerseNumber,
                        Text = vt.Text,
                        BookName = vt.Verse.Chapter.Book.Names
                            .Where(n => n.Lang == lang).Select(n => n.Name).FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names.Where(n => n.Lang == "tr").Select(n => n.Name).FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names.Where(n => n.Lang == "en").Select(n => n.Name).FirstOrDefault()
                            ?? bookName,
                        ChapterNumber = vt.Verse.Chapter.ChapterNumber,
                        BookNumber = vt.Verse.BookNumber,
                        Language = lang
                    })
                    .ToListAsync();

                if (!verses.Any())
                    return NotFound($"Chapter not found (or no verses in '{lang}/{code}'): {bookName} {chapterNumber}");

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting chapter: {Book} {Chapter}", bookName, chapterNumber);
                return StatusCode(500, "An error occurred while retrieving the chapter");
            }
        }

        // --------------------
        // GET: /api/verses/{bookName}/{chapterNumber}/{verseRange}?lang=..&translationCode=..
        // --------------------
        [HttpGet("{bookName}/{chapterNumber:int}/{verseRange}")]
        public async Task<ActionResult<List<VerseDto>>> GetVerseRange(
            string bookName,
            int chapterNumber,
            string verseRange,
            [FromQuery] string lang = "tr",
            [FromQuery] string? translationCode = null)
        {
            lang = NormalizeLang(lang);
            return await HandleVerseRange(bookName, chapterNumber, verseRange, lang, translationCode);
        }

        private async Task<ActionResult<List<VerseDto>>> HandleVerseRange(
            string bookName,
            int chapterNumber,
            string verseRange,
            string lang = "tr",
            string? translationCode = null)
        {
            try
            {
                lang = NormalizeLang(lang);
                var code = ResolveTranslationCode(lang, translationCode);

                _logger.LogInformation("Getting verse range: {Book} {Chapter}:{Range} ({Lang}/{Code})",
                    bookName, chapterNumber, verseRange, lang, code);

                var verseNumbers = ParseVerseRangeStatic(verseRange);
                if (!verseNumbers.Any())
                    return BadRequest("Invalid verse range format. Use: '5', '5-8', or '5,6,7,8'");

                var verses = await _context.VerseTranslations
                    .Where(vt =>
                        vt.Lang == lang &&
                        vt.TranslationCode == code &&
                        vt.Verse.Chapter.ChapterNumber == chapterNumber &&
                        verseNumbers.Contains(vt.Verse.VerseNumber) &&
                        vt.Verse.Chapter.Book.Names.Any(n => n.Name.ToLower() == bookName.ToLower()))
                    .OrderBy(vt => vt.Verse.VerseNumber)
                    .Select(vt => new VerseDto
                    {
                        Id = vt.Verse.Id,
                        VerseNumber = vt.Verse.VerseNumber,
                        Text = vt.Text,
                        BookName = vt.Verse.Chapter.Book.Names
                            .Where(n => n.Lang == lang).Select(n => n.Name).FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names.Where(n => n.Lang == "tr").Select(n => n.Name).FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names.Where(n => n.Lang == "en").Select(n => n.Name).FirstOrDefault()
                            ?? bookName,
                        ChapterNumber = vt.Verse.Chapter.ChapterNumber,
                        BookNumber = vt.Verse.BookNumber,
                        Language = lang
                    })
                    .ToListAsync();

                if (!verses.Any())
                    return NotFound($"No verses found (or none in '{lang}/{code}'): {bookName} {chapterNumber}:{verseRange}");

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting verse range: {Book} {Chapter}:{Range}", bookName, chapterNumber, verseRange);
                return StatusCode(500, "An error occurred while retrieving the verse range");
            }
        }

        // --------------------
        // GET: /api/verses/search?q=..&lang=..&translationCode=..
        // --------------------
        [HttpGet("search")]
        public async Task<ActionResult<List<VerseDto>>> SearchVerses(
            [FromQuery] string q,
            [FromQuery] int limit = 25,
            [FromQuery] string lang = "tr",
            [FromQuery] string? translationCode = null)
        {
            try
            {
                lang = NormalizeLang(lang);
                var code = ResolveTranslationCode(lang, translationCode);

                if (string.IsNullOrWhiteSpace(q))
                    return BadRequest("Search query is required");

                if (q.Length < 2)
                    return BadRequest("Search query must be at least 2 characters");

                if (limit > 100) limit = 100;

                _logger.LogInformation("Text searching verses for: {Query} ({Lang}/{Code})", q, lang, code);

                var searchTerm = $"%{q}%";

                var verses = await _context.VerseTranslations
                    .Where(vt =>
                        vt.Lang == lang &&
                        vt.TranslationCode == code &&
                        EF.Functions.Like(vt.Text, searchTerm))
                    .OrderBy(vt => vt.Verse.BookNumber)
                    .ThenBy(vt => vt.Verse.ChapterNumber)
                    .ThenBy(vt => vt.Verse.VerseNumber)
                    .Take(limit)
                    .Select(vt => new VerseDto
                    {
                        Id = vt.Verse.Id,
                        VerseNumber = vt.Verse.VerseNumber,
                        Text = vt.Text,
                        BookName = vt.Verse.Chapter.Book.Names
                            .Where(n => n.Lang == lang).Select(n => n.Name).FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names.Where(n => n.Lang == "tr").Select(n => n.Name).FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names.Where(n => n.Lang == "en").Select(n => n.Name).FirstOrDefault()
                            ?? "Unknown",
                        ChapterNumber = vt.Verse.Chapter.ChapterNumber,
                        BookNumber = vt.Verse.BookNumber,
                        Language = lang
                    })
                    .ToListAsync();

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching verses for: {Query}", q);
                return StatusCode(500, "An error occurred while searching verses");
            }
        }

        // --------------------
        // GET: /api/verses/books?lang=...
        // --------------------
        [HttpGet("books")]
        public async Task<ActionResult<List<BookDto>>> GetBooks([FromQuery] string lang = "tr")
        {
            try
            {
                lang = NormalizeLang(lang);

                var books = await _context.Books
                    .Include(b => b.Names)
                    .Include(b => b.Chapters)
                    .OrderBy(b => b.BookNumber)
                    .Select(b => new BookDto
                    {
                        Id = b.Id,
                        BookNumber = b.BookNumber,
                        Testament = b.Testament.ToString(),
                        Name =
                            b.Names.Where(n => n.Lang == lang).Select(n => n.Name).FirstOrDefault()
                            ?? b.Names.Where(n => n.Lang == "tr").Select(n => n.Name).FirstOrDefault()
                            ?? b.Names.Where(n => n.Lang == "en").Select(n => n.Name).FirstOrDefault()
                            ?? b.Names.Select(n => n.Name).FirstOrDefault()
                            ?? "Unknown",
                        TotalChapters = b.Chapters.Count
                    })
                    .ToListAsync();

                return books;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting books list");
                return StatusCode(500, "An error occurred while retrieving books");
            }
        }

        // --------------------
        // GET: /api/verses/random?lang=..&translationCode=..
        // --------------------
        [HttpGet("random")]
        public async Task<ActionResult<VerseDto>> GetRandomVerse(
            [FromQuery] string lang = "tr",
            [FromQuery] string? translationCode = null)
        {
            try
            {
                lang = NormalizeLang(lang);
                var code = ResolveTranslationCode(lang, translationCode);

                var random = new Random();

                var count = await _context.VerseTranslations.CountAsync(vt => vt.Lang == lang && vt.TranslationCode == code);
                if (count == 0)
                    return NotFound("No verses available");

                var skip = random.Next(0, count);

                var verse = await _context.VerseTranslations
                    .Where(vt => vt.Lang == lang && vt.TranslationCode == code)
                    .OrderBy(vt => vt.Verse.BookNumber)
                    .ThenBy(vt => vt.Verse.ChapterNumber)
                    .ThenBy(vt => vt.Verse.VerseNumber)
                    .Skip(skip)
                    .Select(vt => new VerseDto
                    {
                        Id = vt.Verse.Id,
                        VerseNumber = vt.Verse.VerseNumber,
                        Text = vt.Text,
                        BookName = vt.Verse.Chapter.Book.Names
                            .Where(n => n.Lang == lang).Select(n => n.Name).FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names.Where(n => n.Lang == "tr").Select(n => n.Name).FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names.Where(n => n.Lang == "en").Select(n => n.Name).FirstOrDefault()
                            ?? "Unknown",
                        ChapterNumber = vt.Verse.Chapter.ChapterNumber,
                        BookNumber = vt.Verse.BookNumber,
                        Language = lang
                    })
                    .FirstOrDefaultAsync();

                if (verse == null)
                    return NotFound("Random verse not found");

                return verse;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting random verse");
                return StatusCode(500, "An error occurred while retrieving random verse");
            }
        }
    }
}
