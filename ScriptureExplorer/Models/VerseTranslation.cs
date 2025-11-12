using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace ScriptureExplorer.Models
{
    public class VerseTranslation
    {
        public int Id { get; set; }
        public int VerseId { get; set; }
        public string Lang { get; set; } = "tr";   // "tr","en","ar"
        public string Text { get; set; } = string.Empty;
        public string Source { get; set; } = "";   // BibleSuperSearch, Tanzil, etc.
        public string SourceKey { get; set; } = ""; // optional original id
        public Verse Verse { get; set; } = null!;
        public string VerseRange { get; set; } = ""; // "14-15" for combined verses, in turkish translation
    }
}