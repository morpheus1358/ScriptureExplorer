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

        // GET: api/verses/Yaratılış/1 (CHAPTER ENDPOINT)
        [HttpGet("{bookName}/{chapterNumber}")]
        public async Task<ActionResult<List<VerseDto>>> GetChapter(string bookName, int chapterNumber)
        {
            try
            {
                _logger.LogInformation("Getting chapter: {Book} {Chapter}", bookName, chapterNumber);

                var verses = await _context.Verses
                    .Include(v => v.Chapter)
                        .ThenInclude(c => c.Book)
                            .ThenInclude(b => b.Names)
                    .Include(v => v.Translations)
                    .Where(v =>
                        v.Chapter.Book.Names.Any(n =>
                            n.Name.ToLower() == bookName.ToLower() && n.Lang == "tr") &&
                        v.Chapter.ChapterNumber == chapterNumber)
                    .OrderBy(v => v.VerseNumber)
                    .Select(v => new VerseDto
                    {
                        Id = v.Id,
                        VerseNumber = v.VerseNumber,
                        Text = v.Translations.FirstOrDefault(t => t.Lang == "tr").Text,
                        BookName = v.Chapter.Book.Names.FirstOrDefault(n => n.Lang == "tr").Name,
                        ChapterNumber = v.Chapter.ChapterNumber,
                        BookNumber = v.BookNumber,
                        Language = "tr"
                    })
                    .ToListAsync();

                if (!verses.Any())
                {
                    _logger.LogWarning("Chapter not found: {Book} {Chapter}", bookName, chapterNumber);
                    return NotFound($"Chapter not found: {bookName} {chapterNumber}");
                }

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting chapter: {Book} {Chapter}", bookName, chapterNumber);
                return StatusCode(500, "An error occurred while retrieving the chapter");
            }
        }

        [HttpGet("search")]
        public async Task<ActionResult<List<VerseDto>>> SearchVerses([FromQuery] string q, [FromQuery] int limit = 50)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(q))
                    return BadRequest("Search query is required");

                // 🆕 DETECT VERSE REFERENCE FORMAT
                var referenceResult = TryParseVerseReference(q);
                if (referenceResult.IsReference)
                {
                    _logger.LogInformation("Detected verse reference: {Reference}", q);
                    return await HandleVerseRange(referenceResult.BookName, referenceResult.Chapter, referenceResult.VerseRange);
                }

                // 🆕 DETECT CHAPTER REFERENCE FORMAT (e.g., "Yuhanna 1")
                var chapterResult = TryParseChapterReference(q);
                if (chapterResult.IsChapterReference)
                {
                    _logger.LogInformation("Detected chapter reference: {Reference}", q);
                    return await GetChapter(chapterResult.BookName, chapterResult.Chapter);
                }

                // Regular text search
                if (q.Length < 2)
                    return BadRequest("Search query must be at least 2 characters");

                if (limit > 100) limit = 100;

                _logger.LogInformation("Text searching verses for: {Query}", q);

                var searchTerm = $"%{q}%";

                var verses = await _context.VerseTranslations
                    .Where(vt => vt.Lang == "tr" && EF.Functions.Like(vt.Text, searchTerm))
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
                            .Where(n => n.Lang == "tr")
                            .Select(n => n.Name)
                            .FirstOrDefault() ?? "Unknown",
                        ChapterNumber = vt.Verse.Chapter.ChapterNumber,
                        BookNumber = vt.Verse.BookNumber,
                        Language = "tr"
                    })
                    .ToListAsync();

                return verses; // 🆕 ADD THIS RETURN STATEMENT
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching verses for: {Query}", q);
                return StatusCode(500, "An error occurred while searching verses");
            }
        }

        // 🆕 CREATE THE MISSING GetVerseRange METHOD (renamed to HandleVerseRange)
        private async Task<ActionResult<List<VerseDto>>> HandleVerseRange(string bookName, int chapterNumber, string verseRange)
        {
            try
            {
                _logger.LogInformation("Getting verse range: {Book} {Chapter}:{Range}", bookName, chapterNumber, verseRange);

                // Parse verse range (supports: "15", "15-19", "15,16,17", "15-19,21")
                var verseNumbers = ParseVerseRange(verseRange);

                if (!verseNumbers.Any())
                {
                    return BadRequest("Invalid verse range format. Use: '5', '5-8', or '5,6,7,8'");
                }

                var verses = await _context.Verses
                    .Include(v => v.Chapter)
                        .ThenInclude(c => c.Book)
                            .ThenInclude(b => b.Names)
                    .Include(v => v.Translations)
                    .Where(v =>
                        v.Chapter.Book.Names.Any(n =>
                            n.Name.ToLower() == bookName.ToLower() && n.Lang == "tr") &&
                        v.Chapter.ChapterNumber == chapterNumber &&
                        verseNumbers.Contains(v.VerseNumber))
                    .OrderBy(v => v.VerseNumber)
                    .Select(v => new VerseDto
                    {
                        Id = v.Id,
                        VerseNumber = v.VerseNumber,
                        Text = v.Translations.FirstOrDefault(t => t.Lang == "tr").Text,
                        BookName = v.Chapter.Book.Names.FirstOrDefault(n => n.Lang == "tr").Name,
                        ChapterNumber = v.Chapter.ChapterNumber,
                        BookNumber = v.BookNumber,
                        Language = "tr"
                    })
                    .ToListAsync();

                if (!verses.Any())
                {
                    return NotFound($"No verses found: {bookName} {chapterNumber}:{verseRange}");
                }

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting verse range: {Book} {Chapter}:{Range}", bookName, chapterNumber, verseRange);
                return StatusCode(500, "An error occurred while retrieving the verse range");
            }
        }

        // 🆕 HELPER: Parse verse references like "Yuhanna 1:15-19"
        private (bool IsReference, string BookName, int Chapter, string VerseRange) TryParseVerseReference(string input)
        {
            // Patterns: "Yuhanna 1:15-19", "Yaratılış 1:5", "Matta 3:1-5,7"
            var pattern = @"^(\w+)\s+(\d+):([\d\-,]+)$";
            var match = System.Text.RegularExpressions.Regex.Match(input.Trim(), pattern);

            if (match.Success)
            {
                return (true, match.Groups[1].Value,
                        int.Parse(match.Groups[2].Value),
                        match.Groups[3].Value);
            }

            return (false, "", 0, "");
        }

        // 🆕 HELPER: Parse chapter references like "Yuhanna 1"
        private (bool IsChapterReference, string BookName, int Chapter) TryParseChapterReference(string input)
        {
            // Patterns: "Yuhanna 1", "Yaratılış 1", "Matta 3"
            var pattern = @"^(\w+)\s+(\d+)$";
            var match = System.Text.RegularExpressions.Regex.Match(input.Trim(), pattern);

            if (match.Success)
            {
                return (true, match.Groups[1].Value, int.Parse(match.Groups[2].Value));
            }

            return (false, "", 0);
        }

        // 🆕 HELPER: Parse verse ranges (you might already have this)
        private List<int> ParseVerseRange(string verseRange)
        {
            var result = new List<int>();

            if (string.IsNullOrWhiteSpace(verseRange))
                return result;

            try
            {
                // Remove spaces and split by commas
                var parts = verseRange.Replace(" ", "").Split(',');

                foreach (var part in parts)
                {
                    if (part.Contains("-"))
                    {
                        // Handle range like "15-19"
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
                        // Handle single verse like "15"
                        if (int.TryParse(part, out int verse))
                        {
                            result.Add(verse);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error parsing verse range: {VerseRange}", verseRange);
            }

            return result.Distinct().OrderBy(v => v).ToList();
        }
        // GET: api/verses/books
        [HttpGet("books")]
        public async Task<ActionResult<List<BookDto>>> GetBooks()
        {
            try
            {
                var books = await _context.Books
                    .Include(b => b.Names)
                    .OrderBy(b => b.BookNumber)
                    .Select(b => new BookDto
                    {
                        Id = b.Id,
                        BookNumber = b.BookNumber,
                        Testament = b.Testament.ToString(),
                        TurkishName = b.Names.FirstOrDefault(n => n.Lang == "tr").Name,
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

        // GET: api/verses/random
        [HttpGet("random")]
        public async Task<ActionResult<VerseDto>> GetRandomVerse()
        {
            try
            {
                var random = new Random();
                var verseCount = await _context.Verses.CountAsync();

                if (verseCount == 0)
                    return NotFound("No verses available");

                var skip = random.Next(0, verseCount);

                var verse = await _context.Verses
                    .Include(v => v.Chapter)
                        .ThenInclude(c => c.Book)
                            .ThenInclude(b => b.Names)
                    .Include(v => v.Translations)
                    .Skip(skip)
                    .Take(1)
                    .Select(v => new VerseDto
                    {
                        Id = v.Id,
                        VerseNumber = v.VerseNumber,
                        Text = v.Translations.FirstOrDefault(t => t.Lang == "tr").Text,
                        BookName = v.Chapter.Book.Names.FirstOrDefault(n => n.Lang == "tr").Name,
                        ChapterNumber = v.Chapter.ChapterNumber,
                        BookNumber = v.BookNumber,
                        Language = "tr"
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