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

            // --------------------
            // Enum conversions
            // --------------------
            modelBuilder.Entity<Book>()
                .Property(b => b.Testament)
                .HasConversion<int>();

            modelBuilder.Entity<Book>()
                .Property(b => b.Work)
                .HasConversion<int>();

            modelBuilder.Entity<Verse>()
                .Property(v => v.Work)
                .HasConversion<int>();

            // If VerseTranslation has Work too, uncomment:
            // modelBuilder.Entity<VerseTranslation>()
            //     .Property(vt => vt.Work)
            //     .HasConversion<int>();

            // --------------------
            // Relationships
            // --------------------
            modelBuilder.Entity<BookName>()
                .HasOne(bn => bn.Book)
                .WithMany(b => b.Names)
                .HasForeignKey(bn => bn.BookId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Chapter>()
                .HasOne(c => c.Book)
                .WithMany(b => b.Chapters)
                .HasForeignKey(c => c.BookId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Verse>()
                .HasOne(v => v.Chapter)
                .WithMany(c => c.Verses)
                .HasForeignKey(v => v.ChapterId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<VerseTranslation>()
                .HasOne(vt => vt.Verse)
                .WithMany(v => v.Translations)
                .HasForeignKey(vt => vt.VerseId)
                .OnDelete(DeleteBehavior.Cascade);

            // --------------------
            // Primary keys
            // --------------------
            modelBuilder.Entity<Book>().HasKey(b => b.Id);
            modelBuilder.Entity<BookName>().HasKey(bn => bn.Id);
            modelBuilder.Entity<Chapter>().HasKey(c => c.Id);
            modelBuilder.Entity<Verse>().HasKey(v => v.Id);
            modelBuilder.Entity<VerseTranslation>().HasKey(vt => vt.Id);

            // --------------------
            // Auto increment IDs
            // --------------------
            modelBuilder.Entity<Book>().Property(b => b.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<BookName>().Property(bn => bn.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<Chapter>().Property(c => c.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<Verse>().Property(v => v.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<VerseTranslation>().Property(vt => vt.Id).ValueGeneratedOnAdd();

            // --------------------
            // Indexes (IMPORTANT)
            // --------------------

            // ✅ This must include Work to avoid Bible/Quran collisions
            modelBuilder.Entity<Verse>()
                .HasIndex(v => new { v.Work, v.BookNumber, v.ChapterNumber, v.VerseNumber })
                .IsUnique();

            // Keep only ONE index; don't duplicate a non-unique version.
            // (So remove any other HasIndex on BookNumber/ChapterNumber/VerseNumber)

            modelBuilder.Entity<VerseTranslation>()
                .HasIndex(vt => new { vt.VerseId, vt.TranslationCode })
                .IsUnique();

            modelBuilder.Entity<BookName>()
                .HasIndex(bn => new { bn.Lang, bn.Name });

            modelBuilder.Entity<VerseTranslation>()
                .HasIndex(vt => new { vt.VerseId, vt.Lang });

            // Optional: faster queries by lang/code
            modelBuilder.Entity<VerseTranslation>()
                .HasIndex(vt => new { vt.Lang, vt.TranslationCode });
        }
    }
}
