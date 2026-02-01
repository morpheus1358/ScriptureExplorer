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

        [HttpPost("kjv")]
        public async Task<ActionResult<ImportResult>> ImportKjv([FromQuery] bool force = false)
        {
            try
            {
                var csvPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "kjv.csv");
                var result = await _importService.ImportKjvBibleAsync(csvPath, force);

                if (result.Success) return Ok(result);
                return BadRequest(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during KJV import via API");
                return StatusCode(500, new ImportResult
                {
                    Success = false,
                    Message = $"Internal server error: {ex.Message}"
                });
            }
        }




    }
}