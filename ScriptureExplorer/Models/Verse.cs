using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace ScriptureExplorer.Models
{
    public class Verse
    {
        public int Id { get; set; }
        public int BookNumber { get; set; }        // denormalized for fast lookups
        public int ChapterNumber { get; set; }
        public int VerseNumber { get; set; }
        public int ChapterId { get; set; }
        public Chapter Chapter { get; set; } = null!;
        public ICollection<VerseTranslation> Translations { get; set; } = new List<VerseTranslation>();
    }
}