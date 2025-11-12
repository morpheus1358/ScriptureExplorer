using Microsoft.AspNetCore.Mvc;
using ScriptureExplorer.Services.Interfaces;

namespace ScriptureExplorer.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ImportController : ControllerBase
    {
        private readonly IBibleImportService _importService;
        private readonly ILogger<ImportController> _logger;

        public ImportController(IBibleImportService importService, ILogger<ImportController> logger)
        {
            _importService = importService;
            _logger = logger;
        }

        [HttpPost("turkish-bible")]
        public async Task<ActionResult<ImportResult>> ImportTurkishBible()
        {
            try
            {
                var csvPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "turkish_bible.csv");
                var result = await _importService.ImportTurkishBibleAsync(csvPath);

                if (result.Success)
                {
                    _logger.LogInformation("Turkish Bible import completed via API");
                    return Ok(result);
                }
                else
                {
                    _logger.LogWarning("Turkish Bible import failed via API: {Message}", result.Message);
                    return BadRequest(result);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during Turkish Bible import via API");
                return StatusCode(500, new ImportResult
                {
                    Success = false,
                    Message = $"Internal server error: {ex.Message}"
                });
            }
        }

        [HttpPost("turkish-bible/upload")]
        public async Task<ActionResult<ImportResult>> ImportTurkishBibleFromUpload(IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new ImportResult
                {
                    Success = false,
                    Message = "No file uploaded"
                });
            }

            if (Path.GetExtension(file.FileName).ToLower() != ".csv")
            {
                return BadRequest(new ImportResult
                {
                    Success = false,
                    Message = "Only CSV files are supported"
                });
            }

            try
            {
                using var stream = file.OpenReadStream();
                var result = await _importService.ImportTurkishBibleAsync(stream);

                if (result.Success)
                {
                    return Ok(result);
                }
                else
                {
                    return BadRequest(result);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during Turkish Bible import from upload");
                return StatusCode(500, new ImportResult
                {
                    Success = false,
                    Message = $"Import failed: {ex.Message}"
                });
            }
        }
    }
}