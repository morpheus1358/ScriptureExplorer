using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace ScriptureExplorer.Models

{
    public class Book
    {
        public int Id { get; set; }
        public int BookNumber { get; set; }        // 1..66 for Bible
        public Testament Testament { get; set; }
        public ICollection<BookName> Names { get; set; } = new List<BookName>();
        public ICollection<Chapter> Chapters { get; set; } = new List<Chapter>();
    }
}