/* app.js — ScriptureExplorer (FULL)
   ✅ Includes:
   - translationCode support on all API calls
   - by-number fetching whenever possible
   - translation dropdowns (primary + secondary)
   - per-language translationCode registry with localStorage persistence
   - book-name matching via /books?lang=... (works for Arabic names)
   - dedupe verses in UI
   - parallel view without /parallel backend
   - copy verse by clicking verse number badges (copies ONLY clicked side)
   ✅ Adds:
   - Arabic (ar) support + AR_SVD
   - RTL-safe rendering (per-column dir in parallel)
   - View state persistence (changing language resumes same chapter/range/context)
   - URL deep-linking (search/chapter/range/context + lang/version/parallel)
   - Auto keyword translation for Arabic (tanrı→الله, isa→يسوع, etc.)
*/

const API_BASE = '/api/verses';
const APP_NAME = 'ScriptureExplorer - Türkçe Kutsal Kitap';

// -------------------- App State --------------------
let currentLang = 'tr';
let parallelMode = false;
let parallelSecondaryLang = 'en';

// translation codes (per language)
const TRANSLATIONS = [
  { lang: 'tr', code: 'TR_TBS', label: 'Türkçe (TBS)' },
  { lang: 'en', code: 'EN_KJV', label: 'English (KJV)' },

  { lang: 'fr', code: 'FR_LS1910', label: 'Français (Louis Segond 1910)' },
  { lang: 'es', code: 'ES_RV1909', label: 'Español (Reina-Valera 1909)' },
  { lang: 'de', code: 'DE_ELB1905', label: 'Deutsch (Elberfelder 1905)' },
  { lang: 'ru', code: 'RU_SYNODAL', label: 'Русский (Synodal)' },
  { lang: 'nl', code: 'NL_SV', label: 'Nederlands (Statenvertaling)' },

  { lang: 'ar', code: 'AR_SVD', label: 'العربية (Smith Van Dyke)' },
];

const DEFAULT_TRANSLATION_CODE_BY_LANG = {
  tr: 'TR_TBS',
  en: 'EN_KJV',
  fr: 'FR_LS1910',
  es: 'ES_RV1909',
  de: 'DE_ELB1905',
  ru: 'RU_SYNODAL',
  nl: 'NL_SV',
  ar: 'AR_SVD',
};

let translationCodeByLang = { ...DEFAULT_TRANSLATION_CODE_BY_LANG };
let currentTranslationCode = DEFAULT_TRANSLATION_CODE_BY_LANG[currentLang];
let secondaryTranslationCode =
  DEFAULT_TRANSLATION_CODE_BY_LANG[parallelSecondaryLang];

// -------------------- Books cache --------------------
let booksCache = []; // currentLang book objects for prev/next
let bookIndexByNumber = {}; // bookNumber -> index within currentLang list

let booksCacheByLang = {
  tr: { books: [], indexByNumber: {}, indexByNameKey: {} },
  en: { books: [], indexByNumber: {}, indexByNameKey: {} },
  fr: { books: [], indexByNumber: {}, indexByNameKey: {} },
  es: { books: [], indexByNumber: {}, indexByNameKey: {} },
  de: { books: [], indexByNumber: {}, indexByNameKey: {} },
  ru: { books: [], indexByNumber: {}, indexByNameKey: {} },
  nl: { books: [], indexByNumber: {}, indexByNameKey: {} },
  ar: { books: [], indexByNumber: {}, indexByNameKey: {} },
};

// -------------------- DOM refs --------------------
let searchInput, resultsDiv, langSelectEl, parallelToggleEl, secondarySelectEl;
let translationSelectEl,
  secondaryTranslationSelectEl,
  secondaryTranslationLabelEl;

// -------------------- Auth (optional) --------------------
let authToken = null;
let currentUserName = null;

// -------------------- View State + URL routing --------------------
/**
 * viewState is the SINGLE source of truth for what the user is currently viewing.
 * It makes language switching "resume" the same chapter/range/context reliably.
 */
let viewState = {
  view: 'search', // 'search' | 'chapter' | 'range' | 'context'
  query: 'tanrı',

  // canonical addressing:
  bookNumber: null,
  chapterNumber: null,
  verseRange: null,
  verseNumber: null,

  // nice-to-have display name (localized)
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

/**
 * For mixed RTL/LTR titles (like "خروج 21"), always wrap in <bdi>
 */
function bdiWrap(htmlText) {
  return `<bdi>${htmlText}</bdi>`;
}

function setResultsDirSingleLang() {
  if (!resultsDiv) return;
  // For single-language views, set results dir to currentLang dir
  resultsDiv.setAttribute('dir', dirAttr(currentLang));
}

function setResultsDirNeutral() {
  if (!resultsDiv) return;
  // For parallel views, keep container neutral (layout stable) and set dir per column
  resultsDiv.setAttribute('dir', 'ltr');
}

// -------------------- Translation prefs --------------------
function defaultTranslationForLang(lang) {
  const l = (lang || '').trim().toLowerCase();
  return DEFAULT_TRANSLATION_CODE_BY_LANG[l] || l;
}

function loadTranslationPrefs() {
  try {
    const raw = localStorage.getItem('translationCodeByLang');
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      translationCodeByLang = { ...translationCodeByLang, ...obj };
    }
  } catch {
    // ignore
  }
}

function saveTranslationPrefs() {
  try {
    localStorage.setItem(
      'translationCodeByLang',
      JSON.stringify(translationCodeByLang),
    );
  } catch {
    // ignore
  }
}

function getTranslationCode(lang) {
  const l = (lang || '').trim().toLowerCase();
  return translationCodeByLang[l] || defaultTranslationForLang(l);
}

function setTranslationCode(lang, code) {
  const l = (lang || '').trim().toLowerCase();
  translationCodeByLang[l] =
    (code || '').trim() || defaultTranslationForLang(l);
  saveTranslationPrefs();
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

async function loadBooksForLang(lang) {
  const res = await fetch(`${API_BASE}/books?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error(`Books yüklenemedi (${lang})`);

  const books = await res.json();
  const indexByNumber = {};
  const indexByNameKey = {};

  books.forEach((b, idx) => {
    indexByNumber[b.bookNumber] = idx;
    const key = normalizeNameKey(b.name);
    if (key) indexByNameKey[key] = b.bookNumber;
  });

  if (!booksCacheByLang[lang]) {
    booksCacheByLang[lang] = {
      books: [],
      indexByNumber: {},
      indexByNameKey: {},
    };
  }

  booksCacheByLang[lang] = { books, indexByNumber, indexByNameKey };
}

async function ensureBooksLoaded(lang) {
  if (!booksCacheByLang[lang]?.books?.length) {
    await loadBooksForLang(lang);
  }
}

async function loadBooks() {
  await loadBooksForLang(currentLang);
  booksCache = booksCacheByLang[currentLang].books;
  bookIndexByNumber = booksCacheByLang[currentLang].indexByNumber;
}

function tryResolveBookNumber(lang, bookName) {
  const cache = booksCacheByLang?.[lang];
  if (!cache?.books?.length) return null;
  const key = normalizeNameKey(bookName);
  return cache.indexByNameKey?.[key] ?? null;
}

function getBookNameByNumber(lang, bookNumber, fallbackName = '') {
  const cache = booksCacheByLang?.[lang]?.books || [];
  const found = cache.find((b) => b.bookNumber === bookNumber);
  return found?.name || fallbackName || '';
}

function getAvailableBookNamesForLang(lang) {
  const list = booksCacheByLang?.[lang]?.books || [];
  return list.map((b) => b.name);
}

// -------------------- URL helpers --------------------
function buildQs(lang, translationCode) {
  const qs = new URLSearchParams();
  qs.set('lang', lang);
  qs.set('translationCode', translationCode);
  return qs.toString();
}

/**
 * Deep-linking:
 * - search:  ?view=search&q=...
 * - chapter: ?view=chapter&bn=...&c=...
 * - range:   ?view=range&bn=...&c=...&vr=...
 * - context: ?view=context&bn=...&c=...&v=...
 * Plus:
 * - lang, tc
 * - parallel, sl, stc
 */
function writeUrlFromState() {
  const p = new URLSearchParams();

  p.set('lang', currentLang);
  p.set('tc', currentTranslationCode || getTranslationCode(currentLang));

  p.set('parallel', parallelMode ? '1' : '0');
  p.set('sl', parallelSecondaryLang);
  p.set(
    'stc',
    secondaryTranslationCode || getTranslationCode(parallelSecondaryLang),
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

  // language + codes
  const lang = (p.get('lang') || '').trim().toLowerCase();
  const tc = (p.get('tc') || '').trim();
  if (lang) currentLang = lang;
  if (tc) setTranslationCode(currentLang, tc);

  // parallel
  parallelMode = (p.get('parallel') || '0') === '1';
  const sl = (p.get('sl') || '').trim().toLowerCase();
  const stc = (p.get('stc') || '').trim();
  if (sl) parallelSecondaryLang = sl;
  if (stc) setTranslationCode(parallelSecondaryLang, stc);

  currentTranslationCode = getTranslationCode(currentLang);
  secondaryTranslationCode = getTranslationCode(parallelSecondaryLang);

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
    query: q || 'tanrı',
    bookNumber: null,
    chapterNumber: null,
    verseRange: null,
    verseNumber: null,
    bookName: null,
  };
}

// -------------------- Auto keyword translation --------------------
const AUTO_KEYWORD_MAP_TR_TO_AR = {
  tanrı: 'الله',
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

  // if Arabic selected and user typed Turkish quick words
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
  const chapterPart = trimmed.substring(lastSpace + 1).trim();

  const chapterNum = parseInt(chapterPart, 10);
  if (isNaN(chapterNum)) return { isChapter: false, bookName: '', chapter: 0 };

  const availableBooks = getAvailableBookNamesForLang(currentLang);
  const normalizedInput = normalizeNameKey(bookPart);

  const matchedBook =
    availableBooks.find((b) => normalizeNameKey(b) === normalizedInput) ||
    availableBooks.find((b) => {
      const nb = normalizeNameKey(b);
      return nb.includes(normalizedInput) || normalizedInput.includes(nb);
    });

  if (!matchedBook) return { isChapter: false, bookName: '', chapter: 0 };
  return { isChapter: true, bookName: matchedBook, chapter: chapterNum };
}

function tryParseVerseReference(input) {
  const trimmed = (input || '').trim();

  const availableBooks = getAvailableBookNamesForLang(currentLang);

  // BookName Chapter:VerseRange
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

  return {
    isVerse: true,
    bookName: matchedBook,
    chapter: parseInt(match[2], 10),
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

  // reflect current state into UI
  if (langSelectEl) langSelectEl.value = currentLang;
  if (parallelToggleEl) parallelToggleEl.checked = parallelMode;

  if (secondarySelectEl) {
    secondarySelectEl.value =
      parallelSecondaryLang || (currentLang === 'tr' ? 'en' : 'tr');
    secondarySelectEl.style.display = parallelMode ? 'inline-block' : 'none';
  }

  currentTranslationCode = getTranslationCode(currentLang);
  secondaryTranslationCode = getTranslationCode(parallelSecondaryLang);

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

  // load books for currentLang so parsing works immediately
  loadBooks()
    .then(() => ensureBooksLoaded(parallelSecondaryLang))
    .then(() => {
      // render from URL-derived viewState
      renderFromViewState();
    })
    .catch((e) => {
      console.error(e);
      // fallback
      loadInitialContent();
    });
}

function setupEventListeners() {
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performSearch();
    });
  }

  if (langSelectEl) {
    langSelectEl.addEventListener('change', async () => {
      currentLang = langSelectEl.value;

      // update code selection for new language
      currentTranslationCode = getTranslationCode(currentLang);
      rebuildTranslationDropdown(
        translationSelectEl,
        currentLang,
        currentTranslationCode,
      );

      await loadBooks();

      // if secondary equals primary, flip it
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

        secondaryTranslationCode = getTranslationCode(parallelSecondaryLang);
        rebuildTranslationDropdown(
          secondaryTranslationSelectEl,
          parallelSecondaryLang,
          secondaryTranslationCode,
        );
        await ensureBooksLoaded(parallelSecondaryLang);
      }

      // ✅ KEY FIX: resume current view in the NEW language
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

      secondaryTranslationCode = getTranslationCode(parallelSecondaryLang);
      rebuildTranslationDropdown(
        secondaryTranslationSelectEl,
        parallelSecondaryLang,
        secondaryTranslationCode,
      );
      setSecondaryTranslationVisibility(parallelMode);
      await ensureBooksLoaded(parallelSecondaryLang);

      writeUrlFromState();
      renderFromViewState();
    });
  }

  if (secondarySelectEl) {
    secondarySelectEl.addEventListener('change', async () => {
      parallelSecondaryLang = secondarySelectEl.value;
      secondaryTranslationCode = getTranslationCode(parallelSecondaryLang);
      rebuildTranslationDropdown(
        secondaryTranslationSelectEl,
        parallelSecondaryLang,
        secondaryTranslationCode,
      );
      await ensureBooksLoaded(parallelSecondaryLang);

      writeUrlFromState();
      renderFromViewState();
    });
  }

  if (translationSelectEl) {
    translationSelectEl.addEventListener('change', () => {
      currentTranslationCode = translationSelectEl.value;
      setTranslationCode(currentLang, currentTranslationCode);

      writeUrlFromState();
      renderFromViewState();
    });
  }

  if (secondaryTranslationSelectEl) {
    secondaryTranslationSelectEl.addEventListener('change', () => {
      secondaryTranslationCode = secondaryTranslationSelectEl.value;
      setTranslationCode(parallelSecondaryLang, secondaryTranslationCode);

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
      await search(viewState.query || 'tanrı', { fromState: true });
      return;
    }

    // for non-search views we need bookName in current language
    await ensureBooksLoaded(currentLang);

    const bn = viewState.bookNumber;
    const c = viewState.chapterNumber;

    if (bn == null || c == null) {
      // fallback
      await search('tanrı', { fromState: true });
      return;
    }

    const bookName = getBookNameByNumber(
      currentLang,
      bn,
      viewState.bookName || '',
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

    await search('tanrı', { fromState: true });
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
  await search(query);
}

async function search(query, opts = {}) {
  const rawQuery = (query || '').trim();
  const translatedQuery = translateQueryForCurrentLang(rawQuery);

  if (searchInput) searchInput.value = rawQuery;

  showLoading(t('Aranıyor...', 'Searching...'));
  setResultsDirSingleLang();

  try {
    // ensure books loaded so parsing works (Arabic book names too)
    await ensureBooksLoaded(currentLang);

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

    // 3) text search (auto-translated if Arabic)
    const code = currentTranslationCode || getTranslationCode(currentLang);
    const response = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(translatedQuery)}&${buildQs(currentLang, code)}`,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const verses = await response.json();
    if (!verses || verses.length === 0) {
      // show query user typed, but also hint translation if used
      const suffix =
        currentLang === 'ar' && translatedQuery !== rawQuery
          ? ` (${t('Arapça arandı', 'searched Arabic')}: "${translatedQuery}")`
          : '';
      showEmpty(
        `"${rawQuery}" ${t('için sonuç bulunamadı', 'has no results')}${suffix}`,
      );
      // update state
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

    // update state
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
  // best: resolve to bookNumber and route to by-number-based state
  await ensureBooksLoaded(currentLang);
  const bn = tryResolveBookNumber(currentLang, bookName);
  if (bn != null) {
    await showVerseRangeByNumber(bn, chapterNumber, verseRange, bookName);
    return;
  }

  // fallback (should be rare)
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
      currentTranslationCode || getTranslationCode(primaryLang);

    const primaryRes = await fetch(
      `${API_BASE}/${encodeURIComponent(bookName)}/${chapterNumber}/${encodeURIComponent(verseRange)}?${buildQs(primaryLang, primaryCode)}`,
    );
    if (!primaryRes.ok)
      throw new Error(
        t('Ayet aralığı getirilemedi', 'Could not load verse range'),
      );
    const primaryVerses = await primaryRes.json();

    // update state using bookNumber if present
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
      currentTranslationCode || getTranslationCode(primaryLang);

    // NOTE: range endpoint by-number not provided by your backend; we load by chapter and slice.
    // (This avoids name-mismatch across languages and makes state stable.)
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

  await ensureBooksLoaded(secondaryLang);

  const secondaryCode =
    secondaryTranslationCode || getTranslationCode(secondaryLang);
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
  await ensureBooksLoaded(currentLang);
  const bn = tryResolveBookNumber(currentLang, bookName);
  if (bn != null) {
    await showChapterByNumber(bn, chapterNumber, bookName);
    return;
  }
  // fallback: use name endpoint
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
      currentTranslationCode || getTranslationCode(primaryLang);

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
      currentTranslationCode || getTranslationCode(primaryLang);

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

  await ensureBooksLoaded(secondaryLang);

  const secondaryCode =
    secondaryTranslationCode || getTranslationCode(secondaryLang);
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
  await ensureBooksLoaded(currentLang);
  const bn = tryResolveBookNumber(currentLang, bookName);
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
    const code = currentTranslationCode || getTranslationCode(lang);

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
    const code = currentTranslationCode || getTranslationCode(lang);

    const response = await fetch(
      `${API_BASE}/by-number/${bookNumber}/${chapterNumber}?${buildQs(lang, code)}`,
    );
    if (!response.ok)
      throw new Error(t('Ayet bağlamı getirilemedi', 'Could not load context'));

    const allVerses = await response.json();
    const bookName = getBookNameByNumber(lang, bookNumber, fallbackBookName);

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
    const code = currentTranslationCode || getTranslationCode(currentLang);
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
      ${escapeHtml(verse.bookName)} ${escapeHtml(String(verse.chapterNumber))}:${escapeHtml(String(verse.verseNumber))}
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
    // go back to last search query if we have it; else tanrı
    viewState = {
      view: 'search',
      query: viewState.query || 'tanrı',
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
      query: viewState.query || 'tanrı',
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
    document
      .getElementById(`verse-${targetVerse}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 80);
}

// -------------------- Parallel views (dir per column) --------------------
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
      query: viewState.query || 'tanrı',
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
      query: viewState.query || 'tanrı',
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
          ? getBookNameByNumber(currentLang, bookNumber, fallbackBookName)
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
          ? getBookNameByNumber(currentLang, bookNumber, fallbackBookName)
          : fallbackBookName;

      const ref = makeRef(bookLocalized, chapterNumber, verseNum);
      const ok = await copyToClipboard(`${ref}\n\n${verseText}`.trim());
      if (ok) showToast(`${ref} copied`);
    });
  });
}

/**
 * PARALLEL COPY:
 * clicking a verse number copies ONLY the clicked side
 */
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

      const bookLocalized = getBookNameByNumber(lang, bookNumber, '');
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

// -------------------- Prev/Next navigation (by bookNumber) --------------------
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

  // supports: "3-5" or "3,5,7-9"
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
    query: 'tanrı',
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

// toast
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
  const list = TRANSLATIONS.filter((t) => t.lang === l);

  const fallback = [
    {
      code: defaultTranslationForLang(l),
      lang: l,
      label: defaultTranslationForLang(l),
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
    selectedCode || getTranslationCode(l) || defaultTranslationForLang(l);
  selectEl.value = items.some((x) => x.code === wanted)
    ? wanted
    : items[0].code;
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
window.search = (q) => search(q);
window.getRandomVerse = getRandomVerse;
window.showChapter = showChapter;
window.showVerseContext = showVerseContext;
window.loadInitialContent = loadInitialContent;
