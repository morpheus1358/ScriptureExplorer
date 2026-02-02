/* app.js — ScriptureExplorer (FULL, Work-aware)
   ✅ Includes everything you already had +
   ✅ Adds FULL Bible/Quran switching via `work=bible|quran` on every API call
   ✅ Deep-linking preserves work
   ✅ Books cache is safe when switching work
   ✅ TranslationCode defaults per work (Bible vs Quran)
   ✅ Parallel still works (by-number merging) for both works
*/

const API_BASE = '/api/verses';
const APP_NAME = 'ScriptureExplorer';

// -------------------- App State --------------------
let currentLang = 'tr';

// ✅ NEW: Work state
let currentWork = 'bible'; // 'bible' | 'quran'

let parallelMode = false;
let parallelSecondaryLang = 'en';

// -------------------- Work helpers --------------------
function normalizeWork(w) {
  w = String(w || 'bible')
    .trim()
    .toLowerCase();
  return w === 'quran' ? 'quran' : 'bible';
}

// -------------------- Translation registries --------------------
// Bible translation options (what you already had)
const TRANSLATIONS_BIBLE = [
  { lang: 'tr', code: 'TR_TBS', label: 'Türkçe (TBS)' },
  { lang: 'en', code: 'EN_KJV', label: 'English (KJV)' },

  { lang: 'fr', code: 'FR_LS1910', label: 'Français (Louis Segond 1910)' },
  { lang: 'es', code: 'ES_RV1909', label: 'Español (Reina-Valera 1909)' },
  { lang: 'de', code: 'DE_ELB1905', label: 'Deutsch (Elberfelder 1905)' },
  { lang: 'ru', code: 'RU_SYNODAL', label: 'Русский (Synodal)' },
  { lang: 'nl', code: 'NL_SV', label: 'Nederlands (Statenvertaling)' },

  { lang: 'ar', code: 'AR_SVD', label: 'العربية (Smith Van Dyke)' },
];

// Quran translation options (match your controller defaults; change codes if your DB differs)
// Quran translation options (match your DB)
const TRANSLATIONS_QURAN = [
  { lang: 'tr', code: 'TR_QURAN_VAKFI', label: 'Türkçe (Vakıf)' },
  { lang: 'en', code: 'EN_QURAN_AHMEDALI', label: 'English (Ahmed Ali)' },
  { lang: 'ar', code: 'AR_QURAN_JALALAYN', label: 'العربية (الجلالين)' },
];

// Default code per work+lang
const DEFAULT_TRANSLATION_CODE_BY_LANG_WORK = {
  bible: {
    tr: 'TR_TBS',
    en: 'EN_KJV',
    fr: 'FR_LS1910',
    es: 'ES_RV1909',
    de: 'DE_ELB1905',
    ru: 'RU_SYNODAL',
    nl: 'NL_SV',
    ar: 'AR_SVD',
  },
  quran: {
    tr: 'TR_QURAN_VAKFI',
    en: 'EN_QURAN_AHMEDALI',
    ar: 'AR_QURAN_JALALAYN',
  },
};

// Persisted user preferences (translation code per (work,lang))
let translationCodeByWorkLang = {}; // { bible: { tr: 'TR_TBS', ... }, quran: { tr: 'TR_QURAN_DIYANET', ... } }

let currentTranslationCode = '';
let secondaryTranslationCode = '';

// -------------------- Books cache --------------------
// We cache books per (work, lang) so Bible/Quran never mix.
let booksCache = []; // current work+lang book list for prev/next
let bookIndexByNumber = {}; // bookNumber -> index in booksCache

let booksCacheByWorkLang = {
  bible: {},
  quran: {},
};

// -------------------- DOM refs --------------------
let searchInput, resultsDiv, langSelectEl, parallelToggleEl, secondarySelectEl;
let translationSelectEl,
  secondaryTranslationSelectEl,
  secondaryTranslationLabelEl;
let workSelectEl; // ✅ NEW (optional if you add in HTML)

// -------------------- Auth (optional) --------------------
let authToken = null;
let currentUserName = null;

// -------------------- View State + URL routing --------------------
let viewState = {
  view: 'search', // 'search' | 'chapter' | 'range' | 'context'
  query: 'tanrı',

  // canonical addressing
  bookNumber: null,
  chapterNumber: null,
  verseRange: null,
  verseNumber: null,

  // display name
  bookName: null,
};

let pendingResultTimeouts = [];
function clearPendingResults() {
  pendingResultTimeouts.forEach((id) => clearTimeout(id));
  pendingResultTimeouts = [];
}

// -------------------- i18n helper --------------------
function t(trText, enText) {
  return currentLang === 'tr' ? trText : enText; // non-tr defaults to English
}

// -------------------- RTL helpers --------------------
function isRTL(lang) {
  return ['ar', 'fa', 'ur'].includes((lang || '').toLowerCase());
}

function dirAttr(lang) {
  return isRTL(lang) ? 'rtl' : 'ltr';
}

function bdiWrap(htmlText) {
  return `<bdi>${htmlText}</bdi>`;
}

function setResultsDirSingleLang() {
  if (!resultsDiv) return;
  resultsDiv.setAttribute('dir', dirAttr(currentLang));
}

function setResultsDirNeutral() {
  if (!resultsDiv) return;
  resultsDiv.setAttribute('dir', 'ltr');
}

// -------------------- Translation prefs --------------------
function getDefaultTranslationFor(work, lang) {
  const w = normalizeWork(work);
  const l = (lang || '').trim().toLowerCase();
  return DEFAULT_TRANSLATION_CODE_BY_LANG_WORK[w]?.[l] || l;
}

function loadTranslationPrefs() {
  try {
    const raw = localStorage.getItem('translationCodeByWorkLang');
    if (!raw) {
      translationCodeByWorkLang = { bible: {}, quran: {} };
      return;
    }
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      translationCodeByWorkLang = {
        bible: { ...(obj.bible || {}) },
        quran: { ...(obj.quran || {}) },
      };
      return;
    }
  } catch {
    // ignore
  }
  translationCodeByWorkLang = { bible: {}, quran: {} };
}

function saveTranslationPrefs() {
  try {
    localStorage.setItem(
      'translationCodeByWorkLang',
      JSON.stringify(translationCodeByWorkLang),
    );
  } catch {
    // ignore
  }
}

function getTranslationCode(lang, work = currentWork) {
  const w = normalizeWork(work);
  const l = (lang || '').trim().toLowerCase();
  const byWork = translationCodeByWorkLang?.[w] || {};
  return byWork[l] || getDefaultTranslationFor(w, l);
}

function setTranslationCode(lang, code, work = currentWork) {
  const w = normalizeWork(work);
  const l = (lang || '').trim().toLowerCase();
  if (!translationCodeByWorkLang[w]) translationCodeByWorkLang[w] = {};
  translationCodeByWorkLang[w][l] =
    (code || '').trim() || getDefaultTranslationFor(w, l);
  saveTranslationPrefs();
}

function getTranslationsListFor(work) {
  const w = normalizeWork(work);
  return w === 'quran' ? TRANSLATIONS_QURAN : TRANSLATIONS_BIBLE;
}

// -------------------- Book-name normalization --------------------
function normalizeNameKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getBooksCache(work, lang) {
  const w = normalizeWork(work);
  const l = (lang || '').trim().toLowerCase();
  if (!booksCacheByWorkLang[w][l]) {
    booksCacheByWorkLang[w][l] = {
      books: [],
      indexByNumber: {},
      indexByNameKey: {},
    };
  }
  return booksCacheByWorkLang[w][l];
}

async function loadBooksForLang(lang, work = currentWork) {
  const w = normalizeWork(work);
  const l = (lang || '').trim().toLowerCase();

  const res = await fetch(
    `${API_BASE}/books?lang=${encodeURIComponent(l)}&work=${encodeURIComponent(w)}`,
  );
  if (!res.ok) throw new Error(`Books yüklenemedi (${l}/${w})`);

  const books = await res.json();
  const indexByNumber = {};
  const indexByNameKey = {};

  books.forEach((b, idx) => {
    indexByNumber[b.bookNumber] = idx;
    const key = normalizeNameKey(b.name);
    if (key) indexByNameKey[key] = b.bookNumber;
  });

  booksCacheByWorkLang[w][l] = { books, indexByNumber, indexByNameKey };
}

async function ensureBooksLoaded(lang, work = currentWork) {
  const cache = getBooksCache(work, lang);
  if (!cache.books.length) {
    await loadBooksForLang(lang, work);
  }
}

async function loadBooks() {
  await loadBooksForLang(currentLang, currentWork);
  const cache = getBooksCache(currentWork, currentLang);
  booksCache = cache.books;
  bookIndexByNumber = cache.indexByNumber;
}

function tryResolveBookNumber(lang, bookName, work = currentWork) {
  const cache = getBooksCache(work, lang);
  if (!cache?.books?.length) return null;
  const key = normalizeNameKey(bookName);
  return cache.indexByNameKey?.[key] ?? null;
}

function getBookNameByNumber(
  lang,
  bookNumber,
  fallbackName = '',
  work = currentWork,
) {
  const cache = getBooksCache(work, lang);
  const found = (cache.books || []).find((b) => b.bookNumber === bookNumber);
  return found?.name || fallbackName || '';
}

function getAvailableBookNamesForLang(lang, work = currentWork) {
  const cache = getBooksCache(work, lang);
  return (cache.books || []).map((b) => b.name);
}

// -------------------- URL helpers --------------------
function buildQs(lang, translationCode) {
  const qs = new URLSearchParams();
  qs.set('lang', lang);
  qs.set('translationCode', translationCode);
  qs.set('work', currentWork); // ✅ NEW
  return qs.toString();
}

function writeUrlFromState() {
  const p = new URLSearchParams();

  // ✅ NEW
  p.set('work', currentWork);

  p.set('lang', currentLang);
  p.set(
    'tc',
    currentTranslationCode || getTranslationCode(currentLang, currentWork),
  );

  p.set('parallel', parallelMode ? '1' : '0');
  p.set('sl', parallelSecondaryLang);
  p.set(
    'stc',
    secondaryTranslationCode ||
      getTranslationCode(parallelSecondaryLang, currentWork),
  );

  p.set('view', viewState.view);

  if (viewState.view === 'search') {
    p.set('q', viewState.query || '');
  } else {
    if (viewState.bookNumber != null) p.set('bn', String(viewState.bookNumber));
    if (viewState.chapterNumber != null)
      p.set('c', String(viewState.chapterNumber));
    if (viewState.verseRange) p.set('vr', String(viewState.verseRange));
    if (viewState.verseNumber != null)
      p.set('v', String(viewState.verseNumber));
  }

  const newUrl = `${location.pathname}?${p.toString()}`;
  history.replaceState({}, '', newUrl);
}

function readUrlIntoState() {
  const p = new URLSearchParams(location.search);

  // ✅ NEW: work
  const work = (p.get('work') || 'bible').trim().toLowerCase();
  currentWork = normalizeWork(work);

  // language + codes
  const lang = (p.get('lang') || '').trim().toLowerCase();
  const tc = (p.get('tc') || '').trim();
  if (lang) currentLang = lang;
  if (tc) setTranslationCode(currentLang, tc, currentWork);

  // parallel
  parallelMode = (p.get('parallel') || '0') === '1';
  const sl = (p.get('sl') || '').trim().toLowerCase();
  const stc = (p.get('stc') || '').trim();
  if (sl) parallelSecondaryLang = sl;
  if (stc) setTranslationCode(parallelSecondaryLang, stc, currentWork);

  currentTranslationCode = getTranslationCode(currentLang, currentWork);
  secondaryTranslationCode = getTranslationCode(
    parallelSecondaryLang,
    currentWork,
  );

  // view
  const view = (p.get('view') || 'search').trim();
  const bn = p.get('bn');
  const c = p.get('c');
  const vr = p.get('vr');
  const v = p.get('v');
  const q = p.get('q');

  if (view === 'chapter' && bn && c) {
    viewState = {
      view: 'chapter',
      query: '',
      bookNumber: parseInt(bn, 10),
      chapterNumber: parseInt(c, 10),
      verseRange: null,
      verseNumber: null,
      bookName: null,
    };
    return;
  }

  if (view === 'range' && bn && c && vr) {
    viewState = {
      view: 'range',
      query: '',
      bookNumber: parseInt(bn, 10),
      chapterNumber: parseInt(c, 10),
      verseRange: vr,
      verseNumber: null,
      bookName: null,
    };
    return;
  }

  if (view === 'context' && bn && c && v) {
    viewState = {
      view: 'context',
      query: '',
      bookNumber: parseInt(bn, 10),
      chapterNumber: parseInt(c, 10),
      verseRange: null,
      verseNumber: parseInt(v, 10),
      bookName: null,
    };
    return;
  }

  // default search
  viewState = {
    view: 'search',
    query: q || (currentWork === 'quran' ? 'allah' : 'tanrı'),
    bookNumber: null,
    chapterNumber: null,
    verseRange: null,
    verseNumber: null,
    bookName: null,
  };
}

// -------------------- Auto keyword translation (optional) --------------------
const AUTO_KEYWORD_MAP_TR_TO_AR = {
  tanrı: 'الله',
  allah: 'الله',
  isa: 'يسوع',
  sevgi: 'محبة',
  iman: 'إيمان',
};

function normalizeForKeywordMap(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function translateQueryForCurrentLang(query) {
  const q = normalizeForKeywordMap(query);
  if (currentLang === 'ar' && AUTO_KEYWORD_MAP_TR_TO_AR[q]) {
    return AUTO_KEYWORD_MAP_TR_TO_AR[q];
  }
  return query;
}

// -------------------- Parsing references (uses live /books list) --------------------
function tryParseChapterReference(input) {
  const trimmed = (input || '').trim();
  if (!trimmed || trimmed.includes(':')) {
    return { isChapter: false, bookName: '', chapter: 0 };
  }

  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) return { isChapter: false, bookName: '', chapter: 0 };

  const bookPart = trimmed.substring(0, lastSpace).trim();
  const numPart = trimmed.substring(lastSpace + 1).trim();

  const n = parseInt(numPart, 10);
  if (isNaN(n)) return { isChapter: false, bookName: '', chapter: 0 };

  const availableBooks = getAvailableBookNamesForLang(currentLang, currentWork);
  const normalizedInput = normalizeNameKey(bookPart);

  const matchedBook =
    availableBooks.find((b) => normalizeNameKey(b) === normalizedInput) ||
    availableBooks.find((b) => {
      const nb = normalizeNameKey(b);
      return nb.includes(normalizedInput) || normalizedInput.includes(nb);
    });

  if (!matchedBook) return { isChapter: false, bookName: '', chapter: 0 };

  // ✅ Quran DB: Surah is the book, chapter is always 1.
  // Users may type "Bakara 2" meaning "Surah Bakara", so load chapter 1.
  if (isQuran()) {
    return { isChapter: true, bookName: matchedBook, chapter: 1 };
  }

  return { isChapter: true, bookName: matchedBook, chapter: n };
}

function tryParseVerseReference(input) {
  const trimmed = (input || '').trim();
  const availableBooks = getAvailableBookNamesForLang(currentLang, currentWork);

  const pattern = /^([\p{L}\p{M}\s\d\.']+)\s+(\d+):([\d\-,]+)$/u;
  const match = trimmed.match(pattern);
  if (!match)
    return { isVerse: false, bookName: '', chapter: 0, verseRange: '' };

  const inputBookName = match[1].trim();
  const normalizedInput = normalizeNameKey(inputBookName);

  const matchedBook =
    availableBooks.find((b) => normalizeNameKey(b) === normalizedInput) ||
    availableBooks.find((b) => {
      const nb = normalizeNameKey(b);
      return nb.includes(normalizedInput) || normalizedInput.includes(nb);
    });

  if (!matchedBook)
    return { isVerse: false, bookName: '', chapter: 0, verseRange: '' };

  const typedChapter = parseInt(match[2], 10);

  // ✅ Quran: user writes "Bakara 2:255" (Surah 2, Ayah 255)
  // but DB is book=Bakara, chapter=1, verse=255.
  // So we ignore typedChapter and force chapter=1.
  if (isQuran()) {
    return {
      isVerse: true,
      bookName: matchedBook,
      chapter: 1,
      verseRange: match[3],
    };
  }

  return {
    isVerse: true,
    bookName: matchedBook,
    chapter: typedChapter,
    verseRange: match[3],
  };
}

// -------------------- Init --------------------
document.addEventListener('DOMContentLoaded', () => {
  loadTranslationPrefs();
  readUrlIntoState();
  initializeApp();
  loadAuthFromStorage();
  updateAuthUi();
});

function initializeApp() {
  searchInput = document.getElementById('searchInput');
  resultsDiv = document.getElementById('results');

  langSelectEl = document.querySelector('#languageSelect');
  parallelToggleEl = document.getElementById('parallelToggle');
  secondarySelectEl = document.getElementById('secondaryLanguageSelect');

  translationSelectEl = document.getElementById('translationSelect');
  secondaryTranslationSelectEl = document.getElementById(
    'secondaryTranslationSelect',
  );
  secondaryTranslationLabelEl = document.getElementById(
    'secondaryTranslationLabel',
  );

  // ✅ NEW (optional)
  workSelectEl = document.getElementById('workSelect');

  // reflect state into UI
  if (workSelectEl) workSelectEl.value = currentWork;
  if (langSelectEl) langSelectEl.value = currentLang;
  if (parallelToggleEl) parallelToggleEl.checked = parallelMode;

  if (secondarySelectEl) {
    secondarySelectEl.value =
      parallelSecondaryLang || (currentLang === 'tr' ? 'en' : 'tr');
    secondarySelectEl.style.display = parallelMode ? 'inline-block' : 'none';
  }

  currentTranslationCode = getTranslationCode(currentLang, currentWork);
  secondaryTranslationCode = getTranslationCode(
    parallelSecondaryLang,
    currentWork,
  );

  rebuildTranslationDropdown(
    translationSelectEl,
    currentLang,
    currentTranslationCode,
  );
  rebuildTranslationDropdown(
    secondaryTranslationSelectEl,
    parallelSecondaryLang,
    secondaryTranslationCode,
  );
  setSecondaryTranslationVisibility(parallelMode);

  setupEventListeners();

  // load books for current work+lang so parsing works
  loadBooks()
    .then(() => ensureBooksLoaded(parallelSecondaryLang, currentWork))
    .then(() => {
      renderFromViewState();
    })
    .catch((e) => {
      console.error(e);
      loadInitialContent();
    });
}

function setupEventListeners() {
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performSearch();
    });
  }

  // ✅ NEW: work switch
  if (workSelectEl) {
    workSelectEl.addEventListener('change', async () => {
      currentWork = normalizeWork(workSelectEl.value);

      // refresh translation codes for this work
      currentTranslationCode = getTranslationCode(currentLang, currentWork);
      secondaryTranslationCode = getTranslationCode(
        parallelSecondaryLang,
        currentWork,
      );

      rebuildTranslationDropdown(
        translationSelectEl,
        currentLang,
        currentTranslationCode,
      );
      rebuildTranslationDropdown(
        secondaryTranslationSelectEl,
        parallelSecondaryLang,
        secondaryTranslationCode,
      );

      // reload books for new work
      booksCache = [];
      bookIndexByNumber = {};
      await loadBooks();
      if (parallelMode)
        await ensureBooksLoaded(parallelSecondaryLang, currentWork);

      writeUrlFromState();
      renderFromViewState();
    });
  }

  if (langSelectEl) {
    langSelectEl.addEventListener('change', async () => {
      currentLang = langSelectEl.value;

      currentTranslationCode = getTranslationCode(currentLang, currentWork);
      rebuildTranslationDropdown(
        translationSelectEl,
        currentLang,
        currentTranslationCode,
      );

      await loadBooks();

      if (parallelMode) {
        if (secondarySelectEl) {
          if (
            !secondarySelectEl.value ||
            secondarySelectEl.value === currentLang
          ) {
            secondarySelectEl.value = currentLang === 'tr' ? 'en' : 'tr';
          }
          parallelSecondaryLang = secondarySelectEl.value;
        } else {
          parallelSecondaryLang = currentLang === 'tr' ? 'en' : 'tr';
        }

        secondaryTranslationCode = getTranslationCode(
          parallelSecondaryLang,
          currentWork,
        );
        rebuildTranslationDropdown(
          secondaryTranslationSelectEl,
          parallelSecondaryLang,
          secondaryTranslationCode,
        );
        await ensureBooksLoaded(parallelSecondaryLang, currentWork);
      }

      writeUrlFromState();
      renderFromViewState();
    });
  }

  if (parallelToggleEl) {
    parallelToggleEl.addEventListener('change', async () => {
      parallelMode = parallelToggleEl.checked;

      if (secondarySelectEl) {
        secondarySelectEl.style.display = parallelMode
          ? 'inline-block'
          : 'none';
        if (parallelMode) {
          if (
            !secondarySelectEl.value ||
            secondarySelectEl.value === currentLang
          ) {
            secondarySelectEl.value = currentLang === 'tr' ? 'en' : 'tr';
          }
          parallelSecondaryLang = secondarySelectEl.value;
        }
      } else {
        parallelSecondaryLang = currentLang === 'tr' ? 'en' : 'tr';
      }

      secondaryTranslationCode = getTranslationCode(
        parallelSecondaryLang,
        currentWork,
      );
      rebuildTranslationDropdown(
        secondaryTranslationSelectEl,
        parallelSecondaryLang,
        secondaryTranslationCode,
      );
      setSecondaryTranslationVisibility(parallelMode);
      await ensureBooksLoaded(parallelSecondaryLang, currentWork);

      writeUrlFromState();
      renderFromViewState();
    });
  }

  if (secondarySelectEl) {
    secondarySelectEl.addEventListener('change', async () => {
      parallelSecondaryLang = secondarySelectEl.value;
      secondaryTranslationCode = getTranslationCode(
        parallelSecondaryLang,
        currentWork,
      );
      rebuildTranslationDropdown(
        secondaryTranslationSelectEl,
        parallelSecondaryLang,
        secondaryTranslationCode,
      );
      await ensureBooksLoaded(parallelSecondaryLang, currentWork);

      writeUrlFromState();
      renderFromViewState();
    });
  }

  if (translationSelectEl) {
    translationSelectEl.addEventListener('change', () => {
      currentTranslationCode = translationSelectEl.value;
      setTranslationCode(currentLang, currentTranslationCode, currentWork);

      writeUrlFromState();
      renderFromViewState();
    });
  }

  if (secondaryTranslationSelectEl) {
    secondaryTranslationSelectEl.addEventListener('change', () => {
      secondaryTranslationCode = secondaryTranslationSelectEl.value;
      setTranslationCode(
        parallelSecondaryLang,
        secondaryTranslationCode,
        currentWork,
      );

      writeUrlFromState();
      renderFromViewState();
    });
  }

  // expose auth callbacks
  window.login = login;
  window.registerUser = registerUser;
  window.logout = logout;
}

// -------------------- Rendering from state --------------------
async function renderFromViewState() {
  try {
    if (viewState.view === 'search') {
      await runSearch(
        viewState.query || (currentWork === 'quran' ? 'allah' : 'tanrı'),
        { fromState: true },
      );
      return;
    }

    await ensureBooksLoaded(currentLang, currentWork);

    const bn = viewState.bookNumber;
    const c = viewState.chapterNumber;

    if (bn == null || c == null) {
      await runSearch(currentWork === 'quran' ? 'allah' : 'tanrı', {
        fromState: true,
      });
      return;
    }

    const bookName = getBookNameByNumber(
      currentLang,
      bn,
      viewState.bookName || '',
      currentWork,
    );

    if (viewState.view === 'chapter') {
      await showChapterByNumber(bn, c, bookName);
      return;
    }

    if (viewState.view === 'range') {
      await showVerseRangeByNumber(bn, c, viewState.verseRange, bookName);
      return;
    }

    if (viewState.view === 'context') {
      await showVerseContextByNumber(bn, c, viewState.verseNumber, bookName);
      return;
    }

    await runSearch(currentWork === 'quran' ? 'allah' : 'tanrı', {
      fromState: true,
    });
  } catch (e) {
    console.error(e);
    showError(`${t('Gösterim hatası', 'Render error')}: ${e.message}`);
  }
}

// -------------------- Search --------------------
async function performSearch() {
  const query = (searchInput?.value || '').trim();
  if (!query) {
    showError(
      t('Lütfen bir arama terimi girin', 'Please enter a search query'),
    );
    return;
  }
  await runSearch(query);
}

async function runSearch(query, opts = {}) {
  const rawQuery = (query || '').trim();
  const translatedQuery = translateQueryForCurrentLang(rawQuery);

  if (searchInput) searchInput.value = rawQuery;

  showLoading(t('Aranıyor...', 'Searching...'));
  setResultsDirSingleLang();

  try {
    await ensureBooksLoaded(currentLang, currentWork);

    // 1) verse reference
    const verseRef = tryParseVerseReference(rawQuery);
    if (verseRef.isVerse) {
      await showVerseRange(
        verseRef.bookName,
        verseRef.chapter,
        verseRef.verseRange,
      );
      return;
    }

    // 2) chapter reference
    const chapterRef = tryParseChapterReference(rawQuery);
    if (chapterRef.isChapter) {
      await showChapter(chapterRef.bookName, chapterRef.chapter);
      return;
    }

    // 3) text search
    const code =
      currentTranslationCode || getTranslationCode(currentLang, currentWork);
    const response = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(translatedQuery)}&${buildQs(currentLang, code)}`,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const verses = await response.json();
    if (!verses || verses.length === 0) {
      const suffix =
        currentLang === 'ar' && translatedQuery !== rawQuery
          ? ` (${t('Arapça arandı', 'searched Arabic')}: "${translatedQuery}")`
          : '';
      showEmpty(
        `"${rawQuery}" ${t('için sonuç bulunamadı', 'has no results')}${suffix}`,
      );

      viewState = {
        view: 'search',
        query: rawQuery,
        bookNumber: null,
        chapterNumber: null,
        verseRange: null,
        verseNumber: null,
        bookName: null,
      };
      if (!opts.fromState) writeUrlFromState();
      return;
    }

    displayResults(verses, `${t('Arama', 'Search')}: "${rawQuery}"`);

    viewState = {
      view: 'search',
      query: rawQuery,
      bookNumber: null,
      chapterNumber: null,
      verseRange: null,
      verseNumber: null,
      bookName: null,
    };
    if (!opts.fromState) writeUrlFromState();
  } catch (error) {
    console.error('Search error:', error);
    showError(
      `${t('Arama sırasında hata oluştu', 'Search failed')}: ${error.message}`,
    );
  }
}

// -------------------- Verse range (bookName input) --------------------
async function showVerseRange(bookName, chapterNumber, verseRange) {
  await ensureBooksLoaded(currentLang, currentWork);
  const bn = tryResolveBookNumber(currentLang, bookName, currentWork);
  if (bn != null) {
    await showVerseRangeByNumber(bn, chapterNumber, verseRange, bookName);
    return;
  }
  await showVerseRangeByName(bookName, chapterNumber, verseRange);
}

async function showVerseRangeByName(bookName, chapterNumber, verseRange) {
  showLoading(
    `${bookName} ${chapterNumber}:${verseRange} ${t('yükleniyor...', 'loading...')}`,
  );
  setResultsDirSingleLang();

  try {
    const primaryLang = currentLang;
    const primaryCode =
      currentTranslationCode || getTranslationCode(primaryLang, currentWork);

    const primaryRes = await fetch(
      `${API_BASE}/${encodeURIComponent(bookName)}/${chapterNumber}/${encodeURIComponent(
        verseRange,
      )}?${buildQs(primaryLang, primaryCode)}`,
    );
    if (!primaryRes.ok)
      throw new Error(
        t('Ayet aralığı getirilemedi', 'Could not load verse range'),
      );
    const primaryVerses = await primaryRes.json();

    const bookNumber = primaryVerses?.[0]?.bookNumber ?? null;
    viewState = {
      view: 'range',
      query: '',
      bookNumber,
      chapterNumber,
      verseRange,
      verseNumber: null,
      bookName,
    };
    writeUrlFromState();

    if (!parallelMode) {
      displayResults(
        primaryVerses,
        `${bookName} ${chapterNumber}:${verseRange}`,
      );
      return;
    }

    await showParallelRange(primaryVerses, bookName, chapterNumber, verseRange);
  } catch (e) {
    showError(
      `${t('Ayet aralığı getirilemedi', 'Could not load verse range')}: ${e.message}`,
    );
  }
}

async function showVerseRangeByNumber(
  bookNumber,
  chapterNumber,
  verseRange,
  fallbackBookName,
) {
  showLoading(
    `${fallbackBookName || ''} ${chapterNumber}:${verseRange} ${t('yükleniyor...', 'loading...')}`,
  );
  setResultsDirSingleLang();

  try {
    const primaryLang = currentLang;
    const primaryCode =
      currentTranslationCode || getTranslationCode(primaryLang, currentWork);

    // range endpoint by-number not present => load chapter and slice
    const primaryRes = await fetch(
      `${API_BASE}/by-number/${bookNumber}/${chapterNumber}?${buildQs(primaryLang, primaryCode)}`,
    );
    if (!primaryRes.ok)
      throw new Error(
        t('Ayet aralığı getirilemedi', 'Could not load verse range'),
      );

    const chapterVerses = dedupeVersesByNumber(await primaryRes.json());
    const ranged = filterByVerseRange(chapterVerses, verseRange);

    const displayBookName = getBookNameByNumber(
      primaryLang,
      bookNumber,
      fallbackBookName,
      currentWork,
    );

    viewState = {
      view: 'range',
      query: '',
      bookNumber,
      chapterNumber,
      verseRange,
      verseNumber: null,
      bookName: displayBookName,
    };
    writeUrlFromState();

    if (!parallelMode) {
      displayResults(
        ranged,
        `${displayBookName} ${chapterNumber}:${verseRange}`,
      );
      return;
    }

    await showParallelRange(
      ranged,
      displayBookName,
      chapterNumber,
      verseRange,
      bookNumber,
    );
  } catch (e) {
    showError(
      `${t('Ayet aralığı getirilemedi', 'Could not load verse range')}: ${e.message}`,
    );
  }
}

async function showParallelRange(
  primaryVerses,
  bookName,
  chapterNumber,
  verseRange,
  forcedBookNumber = null,
) {
  setResultsDirNeutral();

  const primaryLang = currentLang;
  const secondaryLang =
    parallelSecondaryLang === primaryLang
      ? primaryLang === 'en'
        ? 'tr'
        : 'en'
      : parallelSecondaryLang;

  const bookNumber = forcedBookNumber ?? primaryVerses?.[0]?.bookNumber;
  if (!bookNumber) {
    displayResults(primaryVerses, `${bookName} ${chapterNumber}:${verseRange}`);
    return;
  }

  await ensureBooksLoaded(secondaryLang, currentWork);

  const secondaryCode =
    secondaryTranslationCode || getTranslationCode(secondaryLang, currentWork);
  const secRes = await fetch(
    `${API_BASE}/by-number/${bookNumber}/${chapterNumber}?${buildQs(secondaryLang, secondaryCode)}`,
  );

  let secondaryVerses = [];
  if (secRes.ok) {
    secondaryVerses = dedupeVersesByNumber(await secRes.json());
    secondaryVerses = filterByVerseRange(secondaryVerses, verseRange);
  }

  const merged = mergeParallelVerses(
    primaryVerses,
    secondaryVerses,
    primaryLang,
    secondaryLang,
  );
  displayParallelRangeView(
    merged,
    bookName,
    chapterNumber,
    verseRange,
    primaryLang,
    secondaryLang,
  );
}

// -------------------- Chapter --------------------
async function showChapter(bookName, chapterNumber) {
  await ensureBooksLoaded(currentLang, currentWork);
  const bn = tryResolveBookNumber(currentLang, bookName, currentWork);
  if (bn != null) {
    await showChapterByNumber(bn, chapterNumber, bookName);
    return;
  }
  await showChapterByName(bookName, chapterNumber);
}

async function showChapterByName(bookName, chapterNumber) {
  showLoading(
    `${bookName} ${chapterNumber}. ${t('bölüm yükleniyor...', 'chapter loading...')}`,
  );
  setResultsDirSingleLang();

  try {
    const primaryLang = currentLang;
    const primaryCode =
      currentTranslationCode || getTranslationCode(primaryLang, currentWork);

    const res = await fetch(
      `${API_BASE}/${encodeURIComponent(bookName)}/${chapterNumber}?${buildQs(primaryLang, primaryCode)}`,
    );
    if (!res.ok)
      throw new Error(t('Bölüm getirilemedi', 'Could not load chapter'));
    const verses = await res.json();

    const bookNumber = verses?.[0]?.bookNumber ?? null;

    viewState = {
      view: 'chapter',
      query: '',
      bookNumber,
      chapterNumber,
      verseRange: null,
      verseNumber: null,
      bookName,
    };
    writeUrlFromState();

    if (!parallelMode) {
      displayChapterView(verses, bookName, chapterNumber);
      return;
    }

    await showParallelChapter(verses, bookName, chapterNumber, bookNumber);
  } catch (e) {
    showError(
      `${t('Bölüm getirilemedi', 'Could not load chapter')}: ${e.message}`,
    );
  }
}

async function showChapterByNumber(
  bookNumber,
  chapterNumber,
  fallbackBookName,
) {
  showLoading(
    `${fallbackBookName || ''} ${chapterNumber}. ${t('bölüm yükleniyor...', 'chapter loading...')}`,
  );
  setResultsDirSingleLang();

  try {
    const primaryLang = currentLang;
    const primaryCode =
      currentTranslationCode || getTranslationCode(primaryLang, currentWork);

    const res = await fetch(
      `${API_BASE}/by-number/${bookNumber}/${chapterNumber}?${buildQs(primaryLang, primaryCode)}`,
    );
    if (!res.ok)
      throw new Error(t('Bölüm getirilemedi', 'Could not load chapter'));
    const verses = await res.json();

    const bookName = getBookNameByNumber(
      primaryLang,
      bookNumber,
      fallbackBookName,
      currentWork,
    );

    viewState = {
      view: 'chapter',
      query: '',
      bookNumber,
      chapterNumber,
      verseRange: null,
      verseNumber: null,
      bookName,
    };
    writeUrlFromState();

    if (!parallelMode) {
      displayChapterView(verses, bookName, chapterNumber);
      return;
    }

    await showParallelChapter(verses, bookName, chapterNumber, bookNumber);
  } catch (e) {
    showError(
      `${t('Bölüm getirilemedi', 'Could not load chapter')}: ${e.message}`,
    );
  }
}

async function showParallelChapter(
  primaryVerses,
  bookName,
  chapterNumber,
  bookNumber,
) {
  setResultsDirNeutral();

  const primaryLang = currentLang;
  const secondaryLang =
    parallelSecondaryLang === primaryLang
      ? primaryLang === 'en'
        ? 'tr'
        : 'en'
      : parallelSecondaryLang;

  if (!bookNumber) {
    displayChapterView(primaryVerses, bookName, chapterNumber);
    return;
  }

  await ensureBooksLoaded(secondaryLang, currentWork);

  const secondaryCode =
    secondaryTranslationCode || getTranslationCode(secondaryLang, currentWork);
  const secRes = await fetch(
    `${API_BASE}/by-number/${bookNumber}/${chapterNumber}?${buildQs(secondaryLang, secondaryCode)}`,
  );

  let secondaryVerses = [];
  if (secRes.ok) secondaryVerses = await secRes.json();

  const merged = mergeParallelVerses(
    primaryVerses,
    secondaryVerses,
    primaryLang,
    secondaryLang,
  );
  displayParallelChapterView(
    merged,
    bookName,
    chapterNumber,
    primaryLang,
    secondaryLang,
  );
}

// -------------------- Context --------------------
async function showVerseContext(bookName, chapterNumber, verseNumber) {
  await ensureBooksLoaded(currentLang, currentWork);
  const bn = tryResolveBookNumber(currentLang, bookName, currentWork);
  if (bn != null) {
    await showVerseContextByNumber(bn, chapterNumber, verseNumber, bookName);
    return;
  }
  await showVerseContextByName(bookName, chapterNumber, verseNumber);
}

async function showVerseContextByName(bookName, chapterNumber, verseNumber) {
  showLoading(t('Ayet bağlamı yükleniyor...', 'Loading context...'));
  setResultsDirSingleLang();

  try {
    const lang = currentLang;
    const code =
      currentTranslationCode || getTranslationCode(lang, currentWork);

    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(bookName)}/${chapterNumber}?${buildQs(lang, code)}`,
    );
    if (!response.ok)
      throw new Error(t('Ayet bağlamı getirilemedi', 'Could not load context'));

    const allVerses = await response.json();
    const bookNumber = allVerses?.[0]?.bookNumber ?? null;

    viewState = {
      view: 'context',
      query: '',
      bookNumber,
      chapterNumber,
      verseRange: null,
      verseNumber: parseInt(verseNumber, 10),
      bookName,
    };
    writeUrlFromState();

    displayContextView(
      allVerses,
      bookName,
      chapterNumber,
      parseInt(verseNumber, 10),
    );
  } catch (e) {
    showError(
      `${t('Ayet bağlamı getirilemedi', 'Could not load context')}: ${e.message}`,
    );
  }
}

async function showVerseContextByNumber(
  bookNumber,
  chapterNumber,
  verseNumber,
  fallbackBookName,
) {
  showLoading(t('Ayet bağlamı yükleniyor...', 'Loading context...'));
  setResultsDirSingleLang();

  try {
    const lang = currentLang;
    const code =
      currentTranslationCode || getTranslationCode(lang, currentWork);

    const response = await fetch(
      `${API_BASE}/by-number/${bookNumber}/${chapterNumber}?${buildQs(lang, code)}`,
    );
    if (!response.ok)
      throw new Error(t('Ayet bağlamı getirilemedi', 'Could not load context'));

    const allVerses = await response.json();
    const bookName = getBookNameByNumber(
      lang,
      bookNumber,
      fallbackBookName,
      currentWork,
    );

    viewState = {
      view: 'context',
      query: '',
      bookNumber,
      chapterNumber,
      verseRange: null,
      verseNumber: parseInt(verseNumber, 10),
      bookName,
    };
    writeUrlFromState();

    displayContextView(
      allVerses,
      bookName,
      chapterNumber,
      parseInt(verseNumber, 10),
    );
  } catch (e) {
    showError(
      `${t('Ayet bağlamı getirilemedi', 'Could not load context')}: ${e.message}`,
    );
  }
}

// -------------------- Random verse --------------------
async function getRandomVerse() {
  showLoading(t('Rastgele ayet getiriliyor...', 'Loading random verse...'));
  setResultsDirSingleLang();

  try {
    const code =
      currentTranslationCode || getTranslationCode(currentLang, currentWork);
    const response = await fetch(
      `${API_BASE}/random?${buildQs(currentLang, code)}`,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const verse = await response.json();
    displayResults([verse], t('Rastgele Ayet', 'Random Verse'));

    viewState = {
      view: 'search',
      query: '',
      bookNumber: null,
      chapterNumber: null,
      verseRange: null,
      verseNumber: null,
      bookName: null,
    };
    writeUrlFromState();
  } catch (e) {
    showError(
      `${t('Rastgele ayet getirilemedi', 'Could not load random verse')}: ${e.message}`,
    );
  }
}

// -------------------- Parallel merge --------------------
function mergeParallelVerses(
  primaryVerses,
  secondaryVerses,
  primaryLang,
  secondaryLang,
) {
  const p = dedupeVersesByNumber(primaryVerses);
  const s = dedupeVersesByNumber(secondaryVerses);

  const sMap = new Map();
  for (const v of s) sMap.set(v.verseNumber, v);

  return p.map((pv) => {
    const sv = sMap.get(pv.verseNumber);
    return {
      bookNumber: pv.bookNumber,
      verseNumber: pv.verseNumber,
      primaryLang,
      secondaryLang,
      primaryText: pv.text || '',
      secondaryText: sv?.text || '',
    };
  });
}

// -------------------- UI renderers --------------------
function displayResults(verses, title) {
  clearPendingResults();
  setResultsDirSingleLang();

  resultsDiv.innerHTML = `
    <div class="results-header">
      ${escapeHtml(title)} • ${Array.isArray(verses) ? verses.length : 0} ${t('sonuç', 'results')}
    </div>
  `;

  (verses || []).forEach((verse, index) => {
    const id = setTimeout(() => {
      resultsDiv.appendChild(createVerseElement(verse));
    }, index * 40);
    pendingResultTimeouts.push(id);
  });
}

function createVerseElement(verse) {
  const verseElement = document.createElement('div');
  verseElement.className = 'verse';

  verseElement.innerHTML = `
    <div class="verse-reference">
      ${escapeHtml(verse.bookName)} ${escapeHtml(String(verse.chapterNumber))}:${escapeHtml(
        String(verse.verseNumber),
      )}
    </div>
    <div class="verse-text">${escapeHtml(verse.text || '')}</div>

    <div class="verse-actions">
      <button class="btn-small btn-success js-read-chapter">📚 ${t('Tüm Bölümü Oku', 'Read Chapter')}</button>
      <button class="btn-small btn-warning js-view-context">🔍 ${t('Bağlamında Gör', 'View Context')}</button>
    </div>
  `;

  verseElement
    .querySelector('.js-read-chapter')
    ?.addEventListener('click', () => {
      showChapter(verse.bookName, verse.chapterNumber);
    });

  verseElement
    .querySelector('.js-view-context')
    ?.addEventListener('click', () => {
      showVerseContext(verse.bookName, verse.chapterNumber, verse.verseNumber);
    });

  return verseElement;
}

function displayChapterView(verses, bookName, chapterNumber) {
  clearPendingResults();
  setResultsDirSingleLang();

  const uniqueVerses = dedupeVersesByNumber(verses);
  const bookNumber = uniqueVerses?.[0]?.bookNumber;

  resultsDiv.innerHTML = `
    <div class="chapter-header">
      <h2 class="chapter-title">
        ${bdiWrap(escapeHtml(bookName))} <span class="chapter-num">${escapeHtml(String(chapterNumber))}</span>
      </h2>
      <button class="btn btn-primary" id="backToSearchBtn">← ${t("Arama'ya Dön", 'Back to Search')}</button>
    </div>

    <div class="chapter-content">
      ${uniqueVerses
        .map(
          (v) => `
          <div class="verse-in-chapter" data-verse="${escapeHtml(String(v.verseNumber))}" id="verse-${escapeHtml(
            String(v.verseNumber),
          )}">
            <span class="verse-number">${escapeHtml(String(v.verseNumber))}</span>
            <span class="verse-text">${escapeHtml(v.text || '')}</span>
          </div>
        `,
        )
        .join('')}
    </div>

    <button id="prevChapterArrow" class="chapter-nav-arrow left" aria-label="${t('Önceki bölüm', 'Previous chapter')}">‹</button>
    <button id="nextChapterArrow" class="chapter-nav-arrow right" aria-label="${t('Sonraki bölüm', 'Next chapter')}">›</button>
  `;

  document.getElementById('backToSearchBtn')?.addEventListener('click', () => {
    viewState = {
      view: 'search',
      query: viewState.query || (currentWork === 'quran' ? 'allah' : 'tanrı'),
      bookNumber: null,
      chapterNumber: null,
      verseRange: null,
      verseNumber: null,
      bookName: null,
    };
    writeUrlFromState();
    renderFromViewState();
  });

  wirePrevNextArrows(
    bookNumber,
    chapterNumber,
    'prevChapterArrow',
    'nextChapterArrow',
  );
  wireChapterCopyActions(bookNumber, bookName, chapterNumber);
}

function displayContextView(verses, bookName, chapterNumber, targetVerse) {
  clearPendingResults();
  setResultsDirSingleLang();

  const unique = dedupeVersesByNumber(verses);
  const bookNumber = unique?.[0]?.bookNumber;

  resultsDiv.innerHTML = `
    <div class="context-header">
      <h2 class="context-title">
        ${bdiWrap(escapeHtml(bookName))} ${escapeHtml(String(chapterNumber))}:${escapeHtml(String(targetVerse))}
        — ${t('Bağlam', 'Context')}
      </h2>

      <button class="btn btn-primary" id="backToSearchBtn2">← ${t("Arama'ya Dön", 'Back to Search')}</button>
      <button class="btn btn-secondary" id="readFullChapterBtn">${t('Tüm Bölümü Oku', 'Read Full Chapter')}</button>
    </div>

    <div class="context-content">
      ${unique
        .map(
          (v) => `
          <div class="verse-in-context ${v.verseNumber === targetVerse ? 'highlighted-verse' : ''}"
               data-verse="${escapeHtml(String(v.verseNumber))}"
               id="verse-${escapeHtml(String(v.verseNumber))}">
            <span class="verse-number">${escapeHtml(String(v.verseNumber))}</span>
            <span class="verse-text">${escapeHtml(v.text || '')}</span>
          </div>
        `,
        )
        .join('')}
    </div>
  `;

  document.getElementById('backToSearchBtn2')?.addEventListener('click', () => {
    viewState = {
      view: 'search',
      query: viewState.query || (currentWork === 'quran' ? 'allah' : 'tanrı'),
      bookNumber: null,
      chapterNumber: null,
      verseRange: null,
      verseNumber: null,
      bookName: null,
    };
    writeUrlFromState();
    renderFromViewState();
  });

  document
    .getElementById('readFullChapterBtn')
    ?.addEventListener('click', () => {
      if (bookNumber != null) {
        showChapterByNumber(bookNumber, chapterNumber, bookName);
      } else {
        showChapter(bookName, chapterNumber);
      }
    });

  wireContextCopyActions(bookNumber, bookName, chapterNumber);

  setTimeout(() => {
    document.getElementById(`verse-${targetVerse}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, 80);
}

// -------------------- Parallel views --------------------
function displayParallelChapterView(
  rows,
  bookName,
  chapterNumber,
  leftLang,
  rightLang,
) {
  clearPendingResults();
  setResultsDirNeutral();

  const map = new Map();
  for (const r of rows || [])
    if (r && !map.has(r.verseNumber)) map.set(r.verseNumber, r);
  const verses = Array.from(map.values()).sort(
    (a, b) => a.verseNumber - b.verseNumber,
  );

  const bookNumber = verses?.[0]?.bookNumber;

  resultsDiv.innerHTML = `
    <div class="chapter-header">
      <h2 class="chapter-title">
        ${bdiWrap(escapeHtml(bookName))} <span class="chapter-num">${escapeHtml(String(chapterNumber))}</span>
      </h2>
      <button class="btn btn-primary" id="backToSearchBtn">← ${t("Arama'ya Dön", 'Back to Search')}</button>
    </div>

    <div class="parallel-grid">
      <div class="parallel-row is-head">
        <div class="parallel-head" dir="${dirAttr(leftLang)}">${escapeHtml((leftLang || '').toUpperCase())}</div>
        <div class="parallel-head" dir="${dirAttr(rightLang)}">${escapeHtml((rightLang || '').toUpperCase())}</div>
      </div>

      ${verses
        .map(
          (v) => `
          <div class="parallel-row" data-verse="${escapeHtml(String(v.verseNumber))}">
            <div class="parallel-cell left" dir="${dirAttr(leftLang)}">
              <div class="parallel-verse-line">
                <span class="verse-number">${escapeHtml(String(v.verseNumber))}</span>
                <div class="parallel-text">${escapeHtml(v.primaryText || '')}</div>
              </div>
            </div>

            <div class="parallel-cell right" dir="${dirAttr(rightLang)}">
              <div class="parallel-verse-line">
                <span class="verse-number">${escapeHtml(String(v.verseNumber))}</span>
                <div class="parallel-text">${escapeHtml(v.secondaryText || '')}</div>
              </div>
            </div>
          </div>
        `,
        )
        .join('')}
    </div>

    <button id="prevChapterArrow" class="chapter-nav-arrow left" aria-label="${t('Önceki bölüm', 'Previous chapter')}">‹</button>
    <button id="nextChapterArrow" class="chapter-nav-arrow right" aria-label="${t('Sonraki bölüm', 'Next chapter')}">›</button>
  `;

  document.getElementById('backToSearchBtn')?.addEventListener('click', () => {
    viewState = {
      view: 'search',
      query: viewState.query || (currentWork === 'quran' ? 'allah' : 'tanrı'),
      bookNumber: null,
      chapterNumber: null,
      verseRange: null,
      verseNumber: null,
      bookName: null,
    };
    writeUrlFromState();
    renderFromViewState();
  });

  wirePrevNextArrows(
    bookNumber,
    chapterNumber,
    'prevChapterArrow',
    'nextChapterArrow',
  );
  wireParallelCopyActions(bookNumber, chapterNumber, leftLang, rightLang);
}

function displayParallelRangeView(
  rows,
  bookName,
  chapterNumber,
  verseRange,
  leftLang,
  rightLang,
) {
  clearPendingResults();
  setResultsDirNeutral();

  const map = new Map();
  for (const r of rows || [])
    if (r && !map.has(r.verseNumber)) map.set(r.verseNumber, r);
  const verses = Array.from(map.values()).sort(
    (a, b) => a.verseNumber - b.verseNumber,
  );

  const bookNumber = verses?.[0]?.bookNumber;
  const title = `${bookName} ${chapterNumber}:${verseRange}`;

  resultsDiv.innerHTML = `
    <div class="chapter-header">
      <h2 class="chapter-title">${bdiWrap(escapeHtml(title))}</h2>
      <button class="btn btn-primary" id="backToSearchBtn">← ${t("Arama'ya Dön", 'Back to Search')}</button>
    </div>

    <div class="parallel-grid">
      <div class="parallel-row is-head">
        <div class="parallel-head" dir="${dirAttr(leftLang)}">${escapeHtml((leftLang || '').toUpperCase())}</div>
        <div class="parallel-head" dir="${dirAttr(rightLang)}">${escapeHtml((rightLang || '').toUpperCase())}</div>
      </div>

      ${verses
        .map(
          (v) => `
          <div class="parallel-row" data-verse="${escapeHtml(String(v.verseNumber))}">
            <div class="parallel-cell left" dir="${dirAttr(leftLang)}">
              <div class="parallel-verse-line">
                <span class="verse-number">${escapeHtml(String(v.verseNumber))}</span>
                <div class="parallel-text">${escapeHtml(v.primaryText || '')}</div>
              </div>
            </div>

            <div class="parallel-cell right" dir="${dirAttr(rightLang)}">
              <div class="parallel-verse-line">
                <span class="verse-number">${escapeHtml(String(v.verseNumber))}</span>
                <div class="parallel-text">${escapeHtml(v.secondaryText || '')}</div>
              </div>
            </div>
          </div>
        `,
        )
        .join('')}
    </div>
  `;

  document.getElementById('backToSearchBtn')?.addEventListener('click', () => {
    viewState = {
      view: 'search',
      query: viewState.query || (currentWork === 'quran' ? 'allah' : 'tanrı'),
      bookNumber: null,
      chapterNumber: null,
      verseRange: null,
      verseNumber: null,
      bookName: null,
    };
    writeUrlFromState();
    renderFromViewState();
  });

  wireParallelCopyActions(bookNumber, chapterNumber, leftLang, rightLang);
}

// -------------------- Copy actions --------------------
function wireChapterCopyActions(bookNumber, fallbackBookName, chapterNumber) {
  document.querySelectorAll('.verse-in-chapter').forEach((row) => {
    const numEl = row.querySelector('.verse-number');
    const textEl = row.querySelector('.verse-text');
    if (!numEl || !textEl) return;

    numEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      const verseNum = row.dataset.verse || numEl.innerText.trim();
      const verseText = textEl.innerText.trim();

      const bookLocalized =
        bookNumber != null
          ? getBookNameByNumber(
              currentLang,
              bookNumber,
              fallbackBookName,
              currentWork,
            )
          : fallbackBookName;

      const ref = makeRef(bookLocalized, chapterNumber, verseNum);
      const ok = await copyToClipboard(`${ref}\n\n${verseText}`.trim());
      if (ok) showToast(`${ref} copied`);
    });
  });
}

function wireContextCopyActions(bookNumber, fallbackBookName, chapterNumber) {
  document.querySelectorAll('.verse-in-context').forEach((row) => {
    const numEl = row.querySelector('.verse-number');
    const textEl = row.querySelector('.verse-text');
    if (!numEl || !textEl) return;

    numEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      const verseNum = row.dataset.verse || numEl.innerText.trim();
      const verseText = textEl.innerText.trim();

      const bookLocalized =
        bookNumber != null
          ? getBookNameByNumber(
              currentLang,
              bookNumber,
              fallbackBookName,
              currentWork,
            )
          : fallbackBookName;

      const ref = makeRef(bookLocalized, chapterNumber, verseNum);
      const ok = await copyToClipboard(`${ref}\n\n${verseText}`.trim());
      if (ok) showToast(`${ref} copied`);
    });
  });
}

function wireParallelCopyActions(
  bookNumber,
  chapterNumber,
  leftLang,
  rightLang,
) {
  const rows = document.querySelectorAll('.parallel-row[data-verse]');
  rows.forEach((row) => {
    const verseNum = row.dataset.verse;

    const leftText =
      row
        .querySelector('.parallel-cell.left .parallel-text')
        ?.innerText?.trim() || '';
    const rightText =
      row
        .querySelector('.parallel-cell.right .parallel-text')
        ?.innerText?.trim() || '';

    row.querySelectorAll('.verse-number').forEach((badge) => {
      const cell = badge.closest('.parallel-cell');
      const isLeft = !!cell?.classList.contains('left');

      const lang = isLeft ? leftLang : rightLang;
      const label = (lang || '').toUpperCase();
      const verseText = (isLeft ? leftText : rightText) || '';

      const bookLocalized = getBookNameByNumber(
        lang,
        bookNumber,
        '',
        currentWork,
      );
      const ref = makeRef(bookLocalized || '', chapterNumber, verseNum);

      badge.addEventListener('click', async (e) => {
        e.stopPropagation();
        const textToCopy = `${ref}\n\n${label}: ${verseText}`.trim();
        const ok = await copyToClipboard(textToCopy);
        if (ok) showToast(`${ref} copied`);
      });
    });
  });
}

// -------------------- Prev/Next navigation --------------------
function wirePrevNextArrows(bookNumber, chapterNumber, prevId, nextId) {
  const prevBtn = document.getElementById(prevId);
  const nextBtn = document.getElementById(nextId);

  if (bookNumber == null || !booksCache.length) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    return;
  }

  const idx = bookIndexByNumber[bookNumber];
  if (idx == null) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    return;
  }

  // prev target
  let prevBookObj = booksCache[idx];
  let prevChapter = chapterNumber - 1;

  if (prevChapter < 1) {
    const prevBook = booksCache[idx - 1];
    if (prevBook) {
      prevBookObj = prevBook;
      prevChapter = prevBook.totalChapters;
    } else {
      prevBookObj = null;
    }
  }

  // next target
  let nextBookObj = booksCache[idx];
  let nextChapter = chapterNumber + 1;

  if (nextBookObj && nextChapter > nextBookObj.totalChapters) {
    const nextBook = booksCache[idx + 1];
    if (nextBook) {
      nextBookObj = nextBook;
      nextChapter = 1;
    } else {
      nextBookObj = null;
    }
  }

  if (prevBookObj && prevBtn) {
    prevBtn.style.display = 'flex';
    prevBtn.onclick = () =>
      showChapterByNumber(
        prevBookObj.bookNumber,
        prevChapter,
        prevBookObj.name,
      );
  } else if (prevBtn) {
    prevBtn.style.display = 'none';
  }

  if (nextBookObj && nextBtn) {
    nextBtn.style.display = 'flex';
    nextBtn.onclick = () =>
      showChapterByNumber(
        nextBookObj.bookNumber,
        nextChapter,
        nextBookObj.name,
      );
  } else if (nextBtn) {
    nextBtn.style.display = 'none';
  }
}

// -------------------- Verse range parsing helper --------------------
function filterByVerseRange(verses, verseRange) {
  const clean = String(verseRange || '').trim();
  if (!clean) return verses;

  const parts = clean
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  const wanted = new Set();

  for (const p of parts) {
    if (p.includes('-')) {
      const [a, b] = p.split('-').map((n) => parseInt(n, 10));
      if (!isNaN(a) && !isNaN(b)) {
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        for (let i = start; i <= end; i++) wanted.add(i);
      }
    } else {
      const n = parseInt(p, 10);
      if (!isNaN(n)) wanted.add(n);
    }
  }

  return (verses || []).filter((v) => wanted.has(v.verseNumber));
}

// -------------------- UI states --------------------
function showLoading(message = t('Yükleniyor...', 'Loading...')) {
  clearPendingResults();
  resultsDiv.innerHTML = `
    <div class="loading">
      <div>⏳ ${escapeHtml(message)}</div>
    </div>
  `;
}

function showError(message) {
  clearPendingResults();
  resultsDiv.innerHTML = `
    <div class="error">
      <div>❌ ${escapeHtml(message)}</div>
      <button class="btn-small btn-primary" id="retryBtn" style="margin-top: 10px;">
        ${t('Tekrar Dene', 'Retry')}
      </button>
    </div>
  `;
  document
    .getElementById('retryBtn')
    ?.addEventListener('click', loadInitialContent);
}

function showEmpty(message) {
  clearPendingResults();
  resultsDiv.innerHTML = `
    <div class="empty">
      <div>🔍 ${escapeHtml(message)}</div>
      <button class="btn-small btn-primary" id="randomBtn" style="margin-top: 10px;">
        ${t('Rastgele Ayet Göster', 'Show Random Verse')}
      </button>
    </div>
  `;
  document
    .getElementById('randomBtn')
    ?.addEventListener('click', getRandomVerse);
}

function loadInitialContent() {
  viewState = {
    view: 'search',
    query: defaultSearchTerm(),
    bookNumber: null,
    chapterNumber: null,
    verseRange: null,
    verseNumber: null,
    bookName: null,
  };
  writeUrlFromState();
  renderFromViewState();
}

// -------------------- Helpers --------------------
function dedupeVersesByNumber(verses) {
  if (!Array.isArray(verses)) return [];
  const map = new Map();
  for (const v of verses)
    if (v && !map.has(v.verseNumber)) map.set(v.verseNumber, v);
  return Array.from(map.values()).sort((a, b) => a.verseNumber - b.verseNumber);
}

function escapeHtml(unsafe) {
  const s = String(unsafe ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }

  el.textContent = message;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');

  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1100);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function makeRef(bookName, chapterNumber, verseNumber) {
  const bn = (bookName || '').trim();
  return bn
    ? `${bn} ${chapterNumber}:${verseNumber}`
    : `${chapterNumber}:${verseNumber}`;
}

// -------------------- Translation dropdown helpers --------------------
function rebuildTranslationDropdown(selectEl, lang, selectedCode) {
  if (!selectEl) return;
  const l = (lang || '').trim().toLowerCase();

  const itemsAll = getTranslationsListFor(currentWork);
  const list = itemsAll.filter((t) => t.lang === l);

  const fallback = [
    {
      code: getDefaultTranslationFor(currentWork, l),
      lang: l,
      label: getDefaultTranslationFor(currentWork, l),
    },
  ];
  const items = list.length ? list : fallback;

  selectEl.innerHTML = items
    .map(
      (t) =>
        `<option value="${escapeHtml(t.code)}">${escapeHtml(t.label)}</option>`,
    )
    .join('');

  const wanted =
    selectedCode ||
    getTranslationCode(l, currentWork) ||
    getDefaultTranslationFor(currentWork, l);
  selectEl.value = items.some((x) => x.code === wanted)
    ? wanted
    : items[0].code;
}

function defaultSearchTerm() {
  // Quran defaults
  if (normalizeWork(currentWork) === 'quran') {
    if ((currentLang || '').toLowerCase() === 'ar') return 'الله';
    // you can choose 'allah' or 'rahman' etc
    return 'allah';
  }

  // Bible defaults
  if ((currentLang || '').toLowerCase() === 'tr') return 'tanrı';
  return 'god';
}

function isQuran() {
  return normalizeWork(currentWork) === 'quran';
}

function setSecondaryTranslationVisibility(isParallel) {
  if (secondarySelectEl)
    secondarySelectEl.style.display = isParallel ? 'inline-block' : 'none';
  if (secondaryTranslationSelectEl)
    secondaryTranslationSelectEl.style.display = isParallel
      ? 'inline-block'
      : 'none';
  if (secondaryTranslationLabelEl)
    secondaryTranslationLabelEl.style.display = isParallel
      ? 'inline-block'
      : 'none';
}

// -------------------- Auth (optional) --------------------
function loadAuthFromStorage() {
  const stored = localStorage.getItem('authInfo');
  if (!stored) return;
  try {
    const obj = JSON.parse(stored);
    authToken = obj.token || null;
    currentUserName = obj.userName || null;
  } catch {
    authToken = null;
    currentUserName = null;
  }
}

function saveAuth(token, userName) {
  authToken = token;
  currentUserName = userName;
  localStorage.setItem('authInfo', JSON.stringify({ token, userName }));
  updateAuthUi();
}

function clearAuth() {
  authToken = null;
  currentUserName = null;
  localStorage.removeItem('authInfo');
  updateAuthUi();
}

function updateAuthUi() {
  const statusSpan = document.getElementById('auth-status');
  const logoutBtn = document.getElementById('logout-btn');
  const authLinks = document.querySelectorAll('.auth-buttons .auth-link');
  if (!statusSpan || !logoutBtn) return;

  if (authToken && currentUserName) {
    statusSpan.textContent = `Giriş yapıldı: ${currentUserName}`;
    logoutBtn.style.display = 'inline-block';
    authLinks.forEach((l) => (l.style.display = 'none'));
  } else {
    statusSpan.textContent = 'Giriş yapılmadı';
    logoutBtn.style.display = 'none';
    authLinks.forEach((l) => (l.style.display = 'inline-block'));
  }
}

async function login() {
  const userInput = document.getElementById('auth-username');
  const passInput = document.getElementById('auth-password');
  const usernameOrEmail = (userInput?.value || '').trim();
  const password = passInput?.value || '';

  if (!usernameOrEmail || !password) {
    alert('Lütfen kullanıcı adı/e-posta ve şifre girin.');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUserName: usernameOrEmail, password }),
    });

    if (!res.ok) {
      alert('Giriş başarısız.');
      return;
    }

    const data = await res.json();
    saveAuth(data.token, data.userName || usernameOrEmail);
    if (passInput) passInput.value = '';
    alert('Giriş başarılı!');
  } catch {
    alert('Giriş sırasında hata oluştu.');
  }
}

async function registerUser() {
  const userInput = document.getElementById('auth-username');
  const passInput = document.getElementById('auth-password');
  const usernameOrEmail = (userInput?.value || '').trim();
  const password = passInput?.value || '';

  if (!usernameOrEmail || !password) {
    alert('Lütfen kullanıcı adı/e-posta ve şifre girin.');
    return;
  }

  const isEmail = usernameOrEmail.includes('@');
  const email = isEmail ? usernameOrEmail : `${usernameOrEmail}@example.com`;
  const userName = isEmail ? usernameOrEmail.split('@')[0] : usernameOrEmail;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        userName,
        password,
        confirmPassword: password,
      }),
    });

    if (!res.ok) {
      alert('Kayıt başarısız.');
      return;
    }

    const data = await res.json();
    saveAuth(data.token, data.userName || userName);
    if (passInput) passInput.value = '';
    alert('Kayıt başarılı! Giriş yapıldı.');
  } catch {
    alert('Kayıt sırasında hata oluştu.');
  }
}

function logout() {
  clearAuth();
  alert('Çıkış yapıldı.');
}

// -------------------- Expose globals used by HTML --------------------
window.performSearch = performSearch;
window.search = runSearch;

window.getRandomVerse = getRandomVerse;
window.showChapter = showChapter;
window.showVerseContext = showVerseContext;
window.loadInitialContent = loadInitialContent;

window.login = login;
window.registerUser = registerUser;
window.logout = logout;
