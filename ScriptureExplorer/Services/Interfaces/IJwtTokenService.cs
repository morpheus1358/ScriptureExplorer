using ScriptureExplorer.Models;

namespace ScriptureExplorer.Services.Interfaces
{
    public interface IJwtTokenService
    {
        string GenerateToken(ApplicationUser user, out DateTime expiresAt);
    }
}
