using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using ScriptureExplorer.Models;

namespace ScriptureExplorer.Data
{
    public class AppDbContext : IdentityDbContext<ApplicationUser>
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<Book> Books { get; set; }
        public DbSet<BookName> BookNames { get; set; }
        public DbSet<Chapter> Chapters { get; set; }
        public DbSet<Verse> Verses { get; set; }
        public DbSet<VerseTranslation> VerseTranslations { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {

            base.OnModelCreating(modelBuilder);
            // Configure enum conversion
            modelBuilder.Entity<Book>()
                .Property(b => b.Testament)
                .HasConversion<int>();

            // Book -> BookNames (one-to-many)
            modelBuilder.Entity<BookName>()
                .HasOne(bn => bn.Book)
                .WithMany(b => b.Names)
                .HasForeignKey(bn => bn.BookId)
                .OnDelete(DeleteBehavior.Cascade);

            // Book -> Chapters (one-to-many)
            modelBuilder.Entity<Chapter>()
                .HasOne(c => c.Book)
                .WithMany(b => b.Chapters)
                .HasForeignKey(c => c.BookId)
                .OnDelete(DeleteBehavior.Cascade);

            // Chapter -> Verses (one-to-many)
            modelBuilder.Entity<Verse>()
                .HasOne(v => v.Chapter)
                .WithMany(c => c.Verses)
                .HasForeignKey(v => v.ChapterId)
                .OnDelete(DeleteBehavior.Cascade);

            // Verse -> Translations (one-to-many)
            modelBuilder.Entity<VerseTranslation>()
                .HasOne(vt => vt.Verse)
                .WithMany(v => v.Translations)
                .HasForeignKey(vt => vt.VerseId)
                .OnDelete(DeleteBehavior.Cascade);

            // Configure primary keys (REMOVE the BookName.Id = Book.Id assignment)
            modelBuilder.Entity<Book>()
                .HasKey(b => b.Id);

            modelBuilder.Entity<BookName>()
                .HasKey(bn => bn.Id);  // Let EF generate this automatically

            modelBuilder.Entity<Chapter>()
                .HasKey(c => c.Id);

            modelBuilder.Entity<Verse>()
                .HasKey(v => v.Id);

            modelBuilder.Entity<VerseTranslation>()
                .HasKey(vt => vt.Id);

            // Configure auto-increment for IDs
            modelBuilder.Entity<Book>()
                .Property(b => b.Id)
                .ValueGeneratedOnAdd();

            modelBuilder.Entity<BookName>()
                .Property(bn => bn.Id)
                .ValueGeneratedOnAdd();

            modelBuilder.Entity<Chapter>()
                .Property(c => c.Id)
                .ValueGeneratedOnAdd();

            modelBuilder.Entity<Verse>()
                .Property(v => v.Id)
                .ValueGeneratedOnAdd();

            modelBuilder.Entity<VerseTranslation>()
                .Property(vt => vt.Id)
                .ValueGeneratedOnAdd();

            // Indexes for performance
            modelBuilder.Entity<BookName>()
                .HasIndex(bn => new { bn.Lang, bn.Name });

            modelBuilder.Entity<Verse>()
                .HasIndex(v => new { v.BookNumber, v.ChapterNumber, v.VerseNumber });

            modelBuilder.Entity<VerseTranslation>()
                .HasIndex(vt => new { vt.VerseId, vt.Lang });

        }
    }
}