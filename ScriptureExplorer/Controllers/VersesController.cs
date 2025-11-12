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

        // GET: api/verses/Yaratılış/1/1
        [HttpGet("{bookName}/{chapterNumber}/{verseNumber}")]
        public async Task<ActionResult<VerseDto>> GetVerse(string bookName, int chapterNumber, int verseNumber)
        {
            try
            {
                _logger.LogInformation("Getting verse: {Book} {Chapter}:{Verse}", bookName, chapterNumber, verseNumber);

                var verse = await _context.Verses
                    .Include(v => v.Chapter)
                        .ThenInclude(c => c.Book)
                            .ThenInclude(b => b.Names)
                    .Include(v => v.Translations)
                    .FirstOrDefaultAsync(v =>
                        v.Chapter.Book.Names.Any(n =>
                            n.Name.ToLower() == bookName.ToLower() && n.Lang == "tr") &&
                        v.Chapter.ChapterNumber == chapterNumber &&
                        v.VerseNumber == verseNumber);

                if (verse == null)
                {
                    _logger.LogWarning("Verse not found: {Book} {Chapter}:{Verse}", bookName, chapterNumber, verseNumber);
                    return NotFound($"Verse not found: {bookName} {chapterNumber}:{verseNumber}");
                }

                var turkishTranslation = verse.Translations.FirstOrDefault(t => t.Lang == "tr");
                var bookTurkishName = verse.Chapter.Book.Names.FirstOrDefault(n => n.Lang == "tr")?.Name ?? "Unknown";

                var result = new VerseDto
                {
                    Id = verse.Id,
                    VerseNumber = verse.VerseNumber,
                    Text = turkishTranslation?.Text ?? "Translation not available",
                    BookName = bookTurkishName,
                    ChapterNumber = verse.Chapter.ChapterNumber,
                    BookNumber = verse.BookNumber,
                    Language = "tr"
                };

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting verse: {Book} {Chapter}:{Verse}", bookName, chapterNumber, verseNumber);
                return StatusCode(500, "An error occurred while retrieving the verse");
            }
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

        // GET: api/verses/search?q=tanrı
        [HttpGet("search")]

        public async Task<ActionResult<List<VerseDto>>> SearchVerses([FromQuery] string q, [FromQuery] int limit = 25)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(q))
                    return BadRequest("Search query is required");

                if (limit > 25) limit = 25;

                _logger.LogInformation("Searching verses for: {Query}", q);

                var verses = await _context.VerseTranslations
                    .Include(vt => vt.Verse)
                        .ThenInclude(v => v.Chapter)
                            .ThenInclude(c => c.Book)
                                .ThenInclude(b => b.Names)
                    .Where(vt =>
                        vt.Lang == "tr" &&
                        vt.Text.ToLower().Contains(q.ToLower()))
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

                return verses;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching verses for: {Query}", q);
                return StatusCode(500, "An error occurred while searching verses");
            }
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