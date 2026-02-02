using System.Collections.Generic;

namespace ScriptureExplorer.Models
{
    public class Verse
    {
        public int Id { get; set; }

        public Work Work { get; set; } = Work.Bible;

        public int BookNumber { get; set; }
        public int ChapterNumber { get; set; }
        public int VerseNumber { get; set; }

        public int ChapterId { get; set; }
        public Chapter Chapter { get; set; } = null!;

        public ICollection<VerseTranslation> Translations { get; set; } = new List<VerseTranslation>();
    }
}
