using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

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