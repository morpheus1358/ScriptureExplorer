using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;
using ScriptureExplorer.Models;
using ScriptureExplorer.Models.DTOs;
using ScriptureExplorer.Services.Interfaces;

namespace ScriptureExplorer.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly IJwtTokenService _jwtTokenService;
        private readonly ILogger<AuthController> _logger;

        public AuthController(
            UserManager<ApplicationUser> userManager,
            IJwtTokenService jwtTokenService,
            ILogger<AuthController> logger)
        {
            _userManager = userManager;
            _jwtTokenService = jwtTokenService;
            _logger = logger;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterDto model)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            if (model.Password != model.ConfirmPassword)
                return BadRequest("Şifre ve şifre tekrarı aynı olmalı.");

            // check if email or username already used
            var existingByEmail = await _userManager.FindByEmailAsync(model.Email);
            if (existingByEmail != null)
                return BadRequest("Bu e-posta zaten kayıtlı.");

            var existingByName = await _userManager.FindByNameAsync(model.UserName);
            if (existingByName != null)
                return BadRequest("Bu kullanıcı adı zaten kullanılıyor.");

            var user = new ApplicationUser
            {
                UserName = model.UserName,
                Email = model.Email
            };

            var result = await _userManager.CreateAsync(user, model.Password);

            if (!result.Succeeded)
            {
                var errors = result.Errors.Select(e => e.Description);
                _logger.LogWarning("Kullanıcı oluşturulamadı: {Errors}", string.Join(", ", errors));
                return BadRequest(new { errors });
            }

            // optionally auto-login: return token immediately
            var token = _jwtTokenService.GenerateToken(user, out var expiresAt);

            var response = new AuthResponseDto
            {
                Token = token,
                ExpiresAt = expiresAt,
                UserId = user.Id,
                UserName = user.UserName ?? "",
                Email = user.Email ?? ""
            };

            return Ok(response);
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto model)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            ApplicationUser? user;

            if (string.IsNullOrWhiteSpace(model.EmailOrUserName))
                return Unauthorized("Geçersiz kullanıcı adı / e-posta veya şifre.");


            // allow login with either email or username
            if (model.EmailOrUserName.Contains('@'))
            {
                user = await _userManager.FindByEmailAsync(model.EmailOrUserName);
            }
            else
            {
                user = await _userManager.FindByNameAsync(model.EmailOrUserName);
            }

            if (user == null)
                return Unauthorized("Geçersiz kullanıcı adı / e-posta veya şifre.");

            var validPassword = await _userManager.CheckPasswordAsync(user, model.Password);
            if (!validPassword)
                return Unauthorized("Geçersiz kullanıcı adı / e-posta veya şifre.");

            var token = _jwtTokenService.GenerateToken(user, out var expiresAt);

            var response = new AuthResponseDto
            {
                Token = token,
                ExpiresAt = expiresAt,
                UserId = user.Id,
                UserName = user.UserName ?? "",
                Email = user.Email ?? ""
            };

            return Ok(response);
        }
    }
}
