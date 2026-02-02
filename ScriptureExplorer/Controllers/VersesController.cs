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

        private static Work NormalizeWork(string? work)
        {
            var w = (work ?? "bible").Trim().ToLowerInvariant();
            return w == "quran" ? Work.Quran : Work.Bible;
        }

        private static string NormalizeBookName(string s)
            => (s ?? "").Trim().ToLowerInvariant();

        // Default translation code depends on BOTH lang and work
        private static string TranslationCodeFor(string lang, Work work)
        {
            if (work == Work.Quran)
            {
                return lang switch
                {
                    "ar" => "AR_QURAN_UTHMANI",
                    "tr" => "TR_QURAN_DIYANET",
                    "en" => "EN_QURAN_SAHIH",
                    _ => lang
                };
            }

            // Bible
            return lang switch
            {
                "tr" => "TR_TBS",
                "en" => "EN_KJV",
                "fr" => "FR_LS1910",
                "es" => "ES_RV1909",
                "de" => "DE_ELB1905",
                "ru" => "RU_SYNODAL",
                "nl" => "NL_SV",
                "ar" => "AR_SVD",
                _ => lang
            };
        }

        private static string ResolveTranslationCode(string lang, Work work, string? translationCode)
        {
            var tc = NormalizeTranslationCode(translationCode);
            return !string.IsNullOrWhiteSpace(tc) ? tc : TranslationCodeFor(lang, work);
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
        // Parallel chapter (optional)
        // GET /api/verses/{bookName}/{chapter}/parallel?work=bible|quran&primary=tr&secondary=en...
        // --------------------
        [HttpGet("{bookName}/{chapterNumber:int}/parallel")]
        public async Task<ActionResult<List<ParallelVerseDto>>> GetChapterParallel(
            string bookName,
            int chapterNumber,
            [FromQuery] string primary = "tr",
            [FromQuery] string secondary = "en",
            [FromQuery] string? primaryTranslationCode = null,
            [FromQuery] string? secondaryTranslationCode = null,
            [FromQuery] string work = "bible")
        {
            try
            {
                var w = NormalizeWork(work);
                primary = NormalizeLang(primary);
                secondary = NormalizeLang(secondary);

                if (primary.Equals(secondary, StringComparison.OrdinalIgnoreCase))
                    return BadRequest("primary and secondary languages must be different.");

                var primaryCode = ResolveTranslationCode(primary, w, primaryTranslationCode);
                var secondaryCode = ResolveTranslationCode(secondary, w, secondaryTranslationCode);
                var bookNameNorm = NormalizeBookName(bookName);

                var verses = await _context.Verses
                    .AsNoTracking()
                    .Include(v => v.Chapter)
                        .ThenInclude(c => c.Book)
                            .ThenInclude(b => b.Names)
                    .Include(v => v.Translations)
                    .Where(v =>
                        v.Work == w &&
                        v.Chapter.Book.Work == w &&
                        v.Chapter.Book.Names.Any(n => n.Name.ToLower() == bookNameNorm) &&
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

                verses = verses
                    .Where(v => !string.IsNullOrWhiteSpace(v.PrimaryText) || !string.IsNullOrWhiteSpace(v.SecondaryText))
                    .ToList();

                if (!verses.Any())
                    return NotFound($"Chapter not found: {bookName} {chapterNumber} ({w})");

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error parallel chapter: {Book} {Chapter}", bookName, chapterNumber);
                return StatusCode(500, "An error occurred while retrieving the parallel chapter");
            }
        }

        // --------------------
        // GET: /api/verses/by-number/{bookNumber}/{chapterNumber}?lang=..&translationCode=..&work=bible|quran
        // --------------------
        [HttpGet("by-number/{bookNumber:int}/{chapterNumber:int}")]
        public async Task<ActionResult<List<VerseDto>>> GetChapterByNumber(
            int bookNumber,
            int chapterNumber,
            [FromQuery] string lang = "tr",
            [FromQuery] string? translationCode = null,
            [FromQuery] string work = "bible")
        {
            try
            {
                var w = NormalizeWork(work);
                lang = NormalizeLang(lang);
                var code = ResolveTranslationCode(lang, w, translationCode);

                var verses = await _context.VerseTranslations
                    .AsNoTracking()
                    .Where(vt =>
                        vt.Lang == lang &&
                        vt.TranslationCode == code &&
                        vt.Verse.Work == w &&
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
                    return NotFound($"No verses for book {bookNumber} chapter {chapterNumber} in '{lang}/{code}' ({w})");

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting by-number: {Book} {Chapter}", bookNumber, chapterNumber);
                return StatusCode(500, "An error occurred while retrieving the chapter");
            }
        }

        // --------------------
        // GET: /api/verses/{bookName}/{chapterNumber}?lang=..&translationCode=..&work=bible|quran
        // --------------------
        [HttpGet("{bookName}/{chapterNumber:int}")]
        public async Task<ActionResult<List<VerseDto>>> GetChapter(
            string bookName,
            int chapterNumber,
            [FromQuery] string lang = "tr",
            [FromQuery] string? translationCode = null,
            [FromQuery] string work = "bible")
        {
            try
            {
                var w = NormalizeWork(work);
                lang = NormalizeLang(lang);
                var code = ResolveTranslationCode(lang, w, translationCode);
                var bookNameNorm = NormalizeBookName(bookName);

                var verses = await _context.VerseTranslations
                    .AsNoTracking()
                    .Where(vt =>
                        vt.Lang == lang &&
                        vt.TranslationCode == code &&
                        vt.Verse.Work == w &&
                        vt.Verse.Chapter.ChapterNumber == chapterNumber &&
                        vt.Verse.Chapter.Book.Work == w &&
                        vt.Verse.Chapter.Book.Names.Any(n => n.Name.ToLower() == bookNameNorm))
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
                    return NotFound($"Chapter not found (or no verses in '{lang}/{code}'): {bookName} {chapterNumber} ({w})");

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting chapter: {Book} {Chapter}", bookName, chapterNumber);
                return StatusCode(500, "An error occurred while retrieving the chapter");
            }
        }

        // --------------------
        // GET: /api/verses/{bookName}/{chapterNumber}/{verseRange}?lang=..&translationCode=..&work=bible|quran
        // --------------------
        [HttpGet("{bookName}/{chapterNumber:int}/{verseRange}")]
        public async Task<ActionResult<List<VerseDto>>> GetVerseRange(
            string bookName,
            int chapterNumber,
            string verseRange,
            [FromQuery] string lang = "tr",
            [FromQuery] string? translationCode = null,
            [FromQuery] string work = "bible")
        {
            var w = NormalizeWork(work);
            lang = NormalizeLang(lang);
            return await HandleVerseRange(bookName, chapterNumber, verseRange, lang, translationCode, w);
        }

        private async Task<ActionResult<List<VerseDto>>> HandleVerseRange(
            string bookName,
            int chapterNumber,
            string verseRange,
            string lang,
            string? translationCode,
            Work work)
        {
            try
            {
                var code = ResolveTranslationCode(lang, work, translationCode);
                var bookNameNorm = NormalizeBookName(bookName);

                var verseNumbers = ParseVerseRangeStatic(verseRange);
                if (!verseNumbers.Any())
                    return BadRequest("Invalid verse range format. Use: '5', '5-8', or '5,6,7,8'");

                var verses = await _context.VerseTranslations
                    .AsNoTracking()
                    .Where(vt =>
                        vt.Lang == lang &&
                        vt.TranslationCode == code &&
                        vt.Verse.Work == work &&
                        vt.Verse.Chapter.ChapterNumber == chapterNumber &&
                        verseNumbers.Contains(vt.Verse.VerseNumber) &&
                        vt.Verse.Chapter.Book.Work == work &&
                        vt.Verse.Chapter.Book.Names.Any(n => n.Name.ToLower() == bookNameNorm))
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
                    return NotFound($"No verses found (or none in '{lang}/{code}'): {bookName} {chapterNumber}:{verseRange} ({work})");

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error verse range: {Book} {Chapter}:{Range}", bookName, chapterNumber, verseRange);
                return StatusCode(500, "An error occurred while retrieving the verse range");
            }
        }

        // --------------------
        // GET: /api/verses/search?q=..&lang=..&translationCode=..&work=bible|quran
        // --------------------
        [HttpGet("search")]
        public async Task<ActionResult<List<VerseDto>>> SearchVerses(
            [FromQuery] string q,
            [FromQuery] int limit = 25,
            [FromQuery] string lang = "tr",
            [FromQuery] string? translationCode = null,
            [FromQuery] string work = "bible")
        {
            try
            {
                var w = NormalizeWork(work);
                lang = NormalizeLang(lang);
                var code = ResolveTranslationCode(lang, w, translationCode);

                if (string.IsNullOrWhiteSpace(q))
                    return BadRequest("Search query is required");
                if (q.Length < 2)
                    return BadRequest("Search query must be at least 2 characters");
                if (limit > 100) limit = 100;

                var searchTerm = $"%{q}%";

                var verses = await _context.VerseTranslations
                    .AsNoTracking()
                    .Where(vt =>
                        vt.Lang == lang &&
                        vt.TranslationCode == code &&
                        vt.Verse.Work == w &&
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
        // GET: /api/verses/books?lang=...&work=bible|quran
        // --------------------
        [HttpGet("books")]
        public async Task<ActionResult<List<BookDto>>> GetBooks(
            [FromQuery] string lang = "tr",
            [FromQuery] string work = "bible")
        {
            try
            {
                var w = NormalizeWork(work);
                lang = NormalizeLang(lang);

                var books = await _context.Books
                    .AsNoTracking()
                    .Where(b => b.Work == w)
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
        // GET: /api/verses/random?lang=..&translationCode=..&work=bible|quran
        // --------------------
        [HttpGet("random")]
        public async Task<ActionResult<VerseDto>> GetRandomVerse(
            [FromQuery] string lang = "tr",
            [FromQuery] string? translationCode = null,
            [FromQuery] string work = "bible")
        {
            try
            {
                var w = NormalizeWork(work);
                lang = NormalizeLang(lang);
                var code = ResolveTranslationCode(lang, w, translationCode);

                var count = await _context.VerseTranslations.CountAsync(vt =>
                    vt.Lang == lang && vt.TranslationCode == code && vt.Verse.Work == w);

                if (count == 0)
                    return NotFound("No verses available");

                var skip = new Random().Next(0, count);

                var verse = await _context.VerseTranslations
                    .AsNoTracking()
                    .Where(vt => vt.Lang == lang && vt.TranslationCode == code && vt.Verse.Work == w)
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
