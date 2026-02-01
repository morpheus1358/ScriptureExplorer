using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ScriptureExplorer.Data;
using ScriptureExplorer.DTOs;
using ScriptureExplorer.Models;

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

        private static string NormalizeLang(string? lang)
            => string.IsNullOrWhiteSpace(lang) ? "tr" : lang.Trim().ToLowerInvariant();

        private static string TranslationCodeFor(string lang)
            => lang switch
            {
                "tr" => "TR_TBS",
                "en" => "EN_KJV",
                _ => lang // if you add more later, map them here
            };

        // GET: api/verses/Yaratılış/1?lang=tr
        // ✅ Hard filter by Lang + TranslationCode → NO mixed-language leakage.
        [HttpGet("{bookName}/{chapterNumber}")]
        public async Task<ActionResult<List<VerseDto>>> GetChapter(
            string bookName,
            int chapterNumber,
            [FromQuery] string lang = "tr")
        {
            try
            {
                lang = NormalizeLang(lang);
                var code = TranslationCodeFor(lang);

                _logger.LogInformation("Getting chapter: {Book} {Chapter} ({Lang}/{Code})", bookName, chapterNumber, lang, code);

                var verses = await _context.VerseTranslations
                    .Where(vt =>
                        vt.Lang == lang &&
                        vt.TranslationCode == code &&
                        vt.Verse.Chapter.ChapterNumber == chapterNumber &&
                        vt.Verse.Chapter.Book.Names.Any(n => n.Name.ToLower() == bookName.ToLower())
                    )
                    .OrderBy(vt => vt.Verse.VerseNumber)
                    .Select(vt => new VerseDto
                    {
                        Id = vt.Verse.Id,
                        VerseNumber = vt.Verse.VerseNumber,
                        Text = vt.Text,

                        BookName = vt.Verse.Chapter.Book.Names
                            .Where(n => n.Lang == lang)
                            .Select(n => n.Name)
                            .FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names
                                .Where(n => n.Lang == "tr")
                                .Select(n => n.Name)
                                .FirstOrDefault()
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

        [HttpGet("{bookName}/{chapterNumber:int}/{verseRange}")]
        public async Task<ActionResult<List<VerseDto>>> GetVerseRange(
            string bookName,
            int chapterNumber,
            string verseRange,
            [FromQuery] string lang = "tr")
        {
            lang = NormalizeLang(lang);
            return await HandleVerseRange(bookName, chapterNumber, verseRange, lang);
        }

        private async Task<ActionResult<List<VerseDto>>> HandleVerseRange(
            string bookName,
            int chapterNumber,
            string verseRange,
            string lang = "tr")
        {
            try
            {
                lang = NormalizeLang(lang);
                var code = TranslationCodeFor(lang);

                _logger.LogInformation("Getting verse range: {Book} {Chapter}:{Range} ({Lang}/{Code})",
                    bookName, chapterNumber, verseRange, lang, code);

                var verseNumbers = ParseVerseRange(verseRange);
                if (!verseNumbers.Any())
                    return BadRequest("Invalid verse range format. Use: '5', '5-8', or '5,6,7,8'");

                var verses = await _context.VerseTranslations
                    .Where(vt =>
                        vt.Lang == lang &&
                        vt.TranslationCode == code &&
                        vt.Verse.Chapter.ChapterNumber == chapterNumber &&
                        verseNumbers.Contains(vt.Verse.VerseNumber) &&
                        vt.Verse.Chapter.Book.Names.Any(n => n.Name.ToLower() == bookName.ToLower())
                    )
                    .OrderBy(vt => vt.Verse.VerseNumber)
                    .Select(vt => new VerseDto
                    {
                        Id = vt.Verse.Id,
                        VerseNumber = vt.Verse.VerseNumber,
                        Text = vt.Text,

                        BookName = vt.Verse.Chapter.Book.Names
                            .Where(n => n.Lang == lang)
                            .Select(n => n.Name)
                            .FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names
                                .Where(n => n.Lang == "tr")
                                .Select(n => n.Name)
                                .FirstOrDefault()
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

        [HttpGet("search")]
        public async Task<ActionResult<List<VerseDto>>> SearchVerses(
            [FromQuery] string q,
            [FromQuery] int limit = 25,
            [FromQuery] string lang = "tr")
        {
            try
            {
                lang = NormalizeLang(lang);
                var code = TranslationCodeFor(lang);

                if (string.IsNullOrWhiteSpace(q))
                    return BadRequest("Search query is required");

                var referenceResult = TryParseVerseReference(q);
                if (referenceResult.IsReference)
                {
                    _logger.LogInformation("Detected verse reference: {Reference}", q);
                    return await HandleVerseRange(
                        referenceResult.BookName,
                        referenceResult.Chapter,
                        referenceResult.VerseRange,
                        lang);
                }

                var chapterResult = TryParseChapterReference(q);
                if (chapterResult.IsChapterReference)
                {
                    _logger.LogInformation("Detected chapter reference: {Reference}", q);
                    return await GetChapter(chapterResult.BookName, chapterResult.Chapter, lang);
                }

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
                            .Where(n => n.Lang == lang)
                            .Select(n => n.Name)
                            .FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names
                                .Where(n => n.Lang == "tr")
                                .Select(n => n.Name)
                                .FirstOrDefault()
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

        // ✅ Random verse must come from the requested language + code only
        [HttpGet("random")]
        public async Task<ActionResult<VerseDto>> GetRandomVerse([FromQuery] string lang = "tr")
        {
            try
            {
                lang = NormalizeLang(lang);
                var code = TranslationCodeFor(lang);

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
                            .Where(n => n.Lang == lang)
                            .Select(n => n.Name)
                            .FirstOrDefault()
                            ?? vt.Verse.Chapter.Book.Names
                                .Where(n => n.Lang == "tr")
                                .Select(n => n.Name)
                                .FirstOrDefault()
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

        // Parse verse references like "Yuhanna 1:15-19"
        private (bool IsReference, string BookName, int Chapter, string VerseRange) TryParseVerseReference(string input)
        {
            var pattern = @"^\s*([\p{L}’' .-]+)\s+(\d+):([\d,\-– ]+)\s*$";
            var match = System.Text.RegularExpressions.Regex.Match(input.Trim(), pattern);

            if (match.Success)
            {
                return (true, match.Groups[1].Value,
                        int.Parse(match.Groups[2].Value),
                        match.Groups[3].Value);
            }

            return (false, "", 0, "");
        }

        // Parse chapter references like "Yuhanna 1"
        private (bool IsChapterReference, string BookName, int Chapter) TryParseChapterReference(string input)
        {
            var pattern = @"^\s*([\p{L}’' .-]+)\s+(\d+)\s*$";
            var match = System.Text.RegularExpressions.Regex.Match(input.Trim(), pattern);

            if (match.Success)
                return (true, match.Groups[1].Value, int.Parse(match.Groups[2].Value));

            return (false, "", 0);
        }

        private List<int> ParseVerseRange(string verseRange)
        {
            var result = new List<int>();
            if (string.IsNullOrWhiteSpace(verseRange))
                return result;

            try
            {
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
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error parsing verse range: {VerseRange}", verseRange);
            }

            return result.Distinct().OrderBy(v => v).ToList();
        }
    }
}
