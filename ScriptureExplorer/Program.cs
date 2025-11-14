using Microsoft.EntityFrameworkCore;
using ScriptureExplorer.Data;
using ScriptureExplorer.Services;
using ScriptureExplorer.Services.Interfaces;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.Cookies;

var builder = WebApplication.CreateBuilder(args);

// Add services to container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
.AddJwtBearer(JwtBearerDefaults.AuthenticationScheme,
options => builder.Configuration.Bind("JwtSettings", options))
.AddCookie(CookieAuthenticationDefaults.AuthenticationScheme,
options => builder.Configuration.Bind("CookieSettings", options));

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"),
    sqlOptions => sqlOptions.CommandTimeout(120)));

// 🆕 REGISTER OUR SERVICES
builder.Services.AddScoped<IBibleImportService, BibleImportService>();

var app = builder.Build();

app.UseDefaultFiles(); // INDEX HTML AS DEFAULT
app.UseStaticFiles();

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();