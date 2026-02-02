using System.Collections.Generic;

namespace ScriptureExplorer.Models
{
    public class Chapter
    {
        public int Id { get; set; }
        public int BookId { get; set; }

        public int ChapterNumber { get; set; }

        public Book Book { get; set; } = null!;
        public ICollection<Verse> Verses { get; set; } = new List<Verse>();
    }
}
