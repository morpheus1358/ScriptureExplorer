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
        public Verse Verse { get; set; } = null!;

        public string Lang { get; set; } = "";         // "tr","en","ar"
        public string TranslationCode { get; set; } = ""; // "TR_TBS","EN_KJV","AR_TANZIL"
        public string Text { get; set; } = string.Empty;

        public string Source { get; set; } = "";       // "BibleSuperSearch","Tanzil", etc.
        public string SourceKey { get; set; } = "";    // optional id in original dataset
        public string VerseRange { get; set; } = "";   // "14-15" when needed
    }

}