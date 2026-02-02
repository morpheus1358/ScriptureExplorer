using System.Collections.Generic;

namespace ScriptureExplorer.Models
{
    public class Book
    {
        public int Id { get; set; }

        public Work Work { get; set; } = Work.Bible;

        public int BookNumber { get; set; } // Bible: 1..66, Quran: 1..114

        // Bible only (ignored for Quran)
        public Testament Testament { get; set; }

        public ICollection<BookName> Names { get; set; } = new List<BookName>();
        public ICollection<Chapter> Chapters { get; set; } = new List<Chapter>();
    }
}
