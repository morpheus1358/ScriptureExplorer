using Microsoft.EntityFrameworkCore;
using ScriptureExplorer.Data;
using ScriptureExplorer.Services;
using ScriptureExplorer.Services.Interfaces;

var builder = WebApplication.CreateBuilder(args);

// Add services to container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"),
    sqlOptions => sqlOptions.CommandTimeout(120)));

// 🆕 REGISTER OUR SERVICES
builder.Services.AddScoped<IBibleImportService, BibleImportService>();

var app = builder.Build();

// Configure pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();