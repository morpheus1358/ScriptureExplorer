using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace ScriptureExplorer.Models
{
    public class BookName
    {
        public int Id { get; set; }
        public int BookId { get; set; }
        public string Lang { get; set; } = "";   // "tr","en","ar"
        public string Name { get; set; } = string.Empty;  // Yaratılış / Genesis / التكوين
        public Book Book { get; set; } = null!;
    }
}