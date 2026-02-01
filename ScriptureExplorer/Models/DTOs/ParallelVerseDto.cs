using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace ScriptureExplorer.Models.DTOs
{
    namespace ScriptureExplorer.DTOs
    {
        public class ParallelVerseDto
        {
            public int Id { get; set; }
            public int VerseNumber { get; set; }

            public int BookNumber { get; set; }
            public int ChapterNumber { get; set; }

            public string BookName { get; set; } = "";

            public string PrimaryLang { get; set; } = "tr";
            public string SecondaryLang { get; set; } = "en";

            public string PrimaryText { get; set; } = "";
            public string SecondaryText { get; set; } = "";
        }
    }

}