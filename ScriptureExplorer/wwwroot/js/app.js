/* app.js — ScriptureExplorer (full)
   ✅ Fixes included:
   - No more “Unexpected end of input” (no unsafe inline onclick with quotes/apostrophes)
   - Chapter navigation as LEFT/RIGHT side arrows (fixed while scrolling)
   - Hide Prev arrow on very first chapter (Genesis 1 / Matthew 1 etc.)
   - Dedupe verses in UI (prevents 1,1,2,2,... if API ever returns duplicates)
   - Parallel mode WITHOUT needing /parallel backend:
       fetch primary chapter (currentLang) + fetch secondary chapter (secondaryLang),
       map by bookNumber using /books?lang=...
       render 2 columns (TR left, EN right)

   ✅ Copy features (as you requested):
   - Parallel view:
       * Click verse badge copies ONLY the clicked side (TR badge -> TR text, EN badge -> EN text)
       * EN copy uses English book name (Genesis), TR uses Turkish (Yaratılış)
       * Long-press copies ONLY the clicked side (same as above, just easier on mobile)
       * Shift+Click copies TR+EN together (optional)
       * Toast: “Genesis 2:14 copied” / “Yaratılış 2:14 copied”
   - Chapter view (single language) + Context view:
       * Click verse number copies ref + verse text with toast
*/

const API_BASE = '/api/verses';
const APP_NAME = 'ScriptureExplorer - Türkçe Kutsal Kitap';

// -------------------- App State --------------------
let currentLang = 'tr'; // primary language
let parallelMode = false;
let parallelSecondaryLang = 'en'; // secondary language

// booksCache used for chapter prev/next navigation (always primary/currentLang)
let booksCache = [];
let bookIndexByNumber = {};

// keep per-language caches so we can map bookNumber -> localized book name
let booksCacheByLang = {
  tr: { books: [], indexByNumber: {} },
  en: { books: [], indexByNumber: {} },
};

// -------------------- Book lists for parsing references --------------------
const BOOKS_TR = [
  'Yaratılış',
  "Mısır'dan Çıkış",
  'Levililer',
  'Çölde Sayım',
  "Yasa'nın Tekrarı",
  'Yeşu',
  'Hakimler',
  'Rut',
  '1 Samuel',
  '2 Samuel',
  '1. Krallar',
  '2. Krallar',
  '1. Tarihler',
  '2. Tarihler',
  'Ezra',
  'Nehemya',
  'Ester',
  'Eyüp',
  'Mezmurlar',
  "Süleyman'ın Özdeyişleri",
  'Vaiz',
  'Ezgiler Ezgisi',
  'Yeşaya',
  'Yeremya',
  'Ağıtlar',
  'Hezekiel',
  'Daniel',
  'Hoşea',
  'Yoel',
  'Amos',
  'Yunus',
  'Mika',
  'Nahum',
  'Habakkuk',
  'Sefanya',
  'Hagay',
  'Zekeriya',
  'Malaki',
  'Matta',
  'Markos',
  'Luka',
  'Yuhanna',
  'Resullerin',
  'Romalılara',
  '1 Korintoslulara',
  '2 Korintoslulara',
  'Galatyalılara',
  'Efeslilere',
  'Filipililere',
  'Koloselilere',
  '1 Selaniklilere',
  '2 Selaniklilere',
  '1 Timoteosa',
  '2 Timoteosa',
  'Titusa',
  'Filimona',
  'İbranilere',
  "Yakub'un",
  "1 Petrus'un",
  "2 Petrus'un",
  "1 Yuhanna'nın",
  "2 Yuhanna'nın",
  "3 Yuhanna'nın",
  "Yahuda'nın",
  'Vahiy',
];

const BOOKS_EN = [
  'Genesis',
  'Exodus',
  'Leviticus',
  'Numbers',
  'Deuteronomy',
  'Joshua',
  'Judges',
  'Ruth',
  '1 Samuel',
  '2 Samuel',
  '1 Kings',
  '2 Kings',
  '1 Chronicles',
  '2 Chronicles',
  'Ezra',
  'Nehemiah',
  'Esther',
  'Job',
  'Psalms',
  'Proverbs',
  'Ecclesiastes',
  'Song of Solomon',
  'Isaiah',
  'Jeremiah',
  'Lamentations',
  'Ezekiel',
  'Daniel',
  'Hosea',
  'Joel',
  'Amos',
  'Obadiah',
  'Jonah',
  'Micah',
  'Nahum',
  'Habakkuk',
  'Zephaniah',
  'Haggai',
  'Zechariah',
  'Malachi',
  'Matthew',
  'Mark',
  'Luke',
  'John',
  'Acts',
  'Romans',
  '1 Corinthians',
  '2 Corinthians',
  'Galatians',
  'Ephesians',
  'Philippians',
  'Colossians',
  '1 Thessalonians',
  '2 Thessalonians',
  '1 Timothy',
  '2 Timothy',
  'Titus',
  'Philemon',
  'Hebrews',
  'James',
  '1 Peter',
  '2 Peter',
  '1 John',
  '2 John',
  '3 John',
  'Jude',
  'Revelation',
];

function getCurrentBookList() {
  return currentLang === 'en' ? BOOKS_EN : BOOKS_TR;
}

function t(trText, enText) {
  return currentLang === 'en' ? enText : trText;
}

// -------------------- Auth (optional) --------------------
let authToken = null;
let currentUserName = null;

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
      const text = await res.text();
      console.error('Login error:', text);
      alert('Giriş başarısız.');
      return;
    }

    const data = await res.json();
    saveAuth(data.token, data.userName || usernameOrEmail);
    if (passInput) passInput.value = '';
    alert('Giriş başarılı!');
  } catch (err) {
    console.error(err);
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
      const text = await res.text();
      console.error('Register error:', text);
      alert('Kayıt başarısız.');
      return;
    }

    const data = await res.json();
    saveAuth(data.token, data.userName || userName);
    if (passInput) passInput.value = '';
    alert('Kayıt başarılı! Giriş yapıldı.');
  } catch (err) {
    console.error(err);
    alert('Kayıt sırasında hata oluştu.');
  }
}

function logout() {
  clearAuth();
  alert('Çıkış yapıldı.');
}

// -------------------- Books cache --------------------
async function loadBooksForLang(lang) {
  const res = await fetch(`${API_BASE}/books?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error(`Books yüklenemedi (${lang})`);

  const books = await res.json();
  const indexByNumber = {};
  books.forEach((b, idx) => (indexByNumber[b.bookNumber] = idx));

  booksCacheByLang[lang] = { books, indexByNumber };
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

// -------------------- DOM + app init --------------------
let searchInput, resultsDiv, langSelectEl, parallelToggleEl, secondarySelectEl;

let pendingResultTimeouts = [];
function clearPendingResults() {
  pendingResultTimeouts.forEach((id) => clearTimeout(id));
  pendingResultTimeouts = [];
}

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  loadAuthFromStorage();
  updateAuthUi();
});

function initializeApp() {
  searchInput = document.getElementById('searchInput');
  resultsDiv = document.getElementById('results');

  // IMPORTANT: You currently have duplicate #languageSelect in HTML.
  // We pick the first one (querySelector).
  langSelectEl = document.querySelector('#languageSelect');

  parallelToggleEl = document.getElementById('parallelToggle');
  secondarySelectEl = document.getElementById('secondaryLanguageSelect'); // optional (if you added it)

  setupEventListeners();

  // initial UI state
  if (langSelectEl) langSelectEl.value = currentLang;

  if (parallelToggleEl) parallelToggleEl.checked = parallelMode;

  if (secondarySelectEl) {
    // default secondary to opposite language
    secondarySelectEl.value = currentLang === 'tr' ? 'en' : 'tr';
    parallelSecondaryLang = secondarySelectEl.value;
    secondarySelectEl.style.display = parallelMode ? 'inline-block' : 'none';
  }

  loadBooks().catch(console.error);
  loadInitialContent();
}

function setupEventListeners() {
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performSearch();
    });

    searchInput.addEventListener(
      'input',
      debounce(() => {}, 250),
    );
  }

  if (langSelectEl) {
    langSelectEl.addEventListener('change', async () => {
      currentLang = langSelectEl.value;
      await loadBooks();

      // if in parallel mode, auto flip secondary if it equals primary
      if (parallelMode) {
        if (secondarySelectEl) {
          if (secondarySelectEl.value === currentLang) {
            secondarySelectEl.value = currentLang === 'tr' ? 'en' : 'tr';
          }
          parallelSecondaryLang = secondarySelectEl.value;
        } else {
          parallelSecondaryLang = currentLang === 'tr' ? 'en' : 'tr';
        }
      }
    });
  }

  if (parallelToggleEl) {
    parallelToggleEl.addEventListener('change', () => {
      parallelMode = parallelToggleEl.checked;

      // show/hide secondary selector if it exists
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
        // no dropdown => just pick the other language
        parallelSecondaryLang = currentLang === 'tr' ? 'en' : 'tr';
      }
    });
  }

  if (secondarySelectEl) {
    secondarySelectEl.addEventListener('change', () => {
      parallelSecondaryLang = secondarySelectEl.value;
    });
  }

  // expose auth functions if you use them elsewhere
  window.login = login;
  window.registerUser = registerUser;
  window.logout = logout;
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// -------------------- Search logic --------------------
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

async function search(query) {
  if (searchInput) searchInput.value = query;
  showLoading(t('Aranıyor...', 'Searching...'));

  try {
    // 1) Verse reference (John 3:16-18)
    const verseRef = tryParseVerseReference(query);
    if (verseRef.isVerse) {
      await showVerseRange(
        verseRef.bookName,
        verseRef.chapter,
        verseRef.verseRange,
      );
      return;
    }

    // 2) Chapter reference (John 3)
    const chapterRef = tryParseChapterReference(query);
    if (chapterRef.isChapter) {
      await showChapter(chapterRef.bookName, chapterRef.chapter);
      return;
    }

    // 3) Text search
    const response = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(currentLang)}`,
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const verses = await response.json();
    if (!verses || verses.length === 0) {
      showEmpty(`"${query}" ${t('için sonuç bulunamadı', 'has no results')}`);
      return;
    }

    displayResults(verses, `${t('Arama', 'Search')}: "${query}"`);
  } catch (error) {
    console.error('Search error:', error);
    showError(
      `${t('Arama sırasında hata oluştu', 'Search failed')}: ${error.message}`,
    );
  }
}

// ✅ keep digits (1 John etc.)
function normalizeBookName(bookName) {
  return (bookName || '')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^0-9a-zğüşıöç\s]/g, '')
    .trim();
}

function tryParseChapterReference(input) {
  const trimmed = (input || '').trim();
  console.log('Parsing chapter reference:', trimmed);

  if (!trimmed || trimmed.includes(':'))
    return { isChapter: false, bookName: '', chapter: 0 };

  const availableBooks = getCurrentBookList();
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) return { isChapter: false, bookName: '', chapter: 0 };

  const bookPart = trimmed.substring(0, lastSpace).trim();
  const chapterPart = trimmed.substring(lastSpace + 1).trim();

  const chapterNum = parseInt(chapterPart, 10);
  if (isNaN(chapterNum)) return { isChapter: false, bookName: '', chapter: 0 };

  const normalizedInput = normalizeBookName(bookPart);

  const matchedBook =
    availableBooks.find(
      (book) => normalizeBookName(book) === normalizedInput,
    ) ||
    availableBooks.find((book) => {
      const nb = normalizeBookName(book);
      return nb.includes(normalizedInput) || normalizedInput.includes(nb);
    });

  if (!matchedBook) return { isChapter: false, bookName: '', chapter: 0 };

  console.log('✅ Chapter ref match:', matchedBook, chapterNum);
  return { isChapter: true, bookName: matchedBook, chapter: chapterNum };
}

function tryParseVerseReference(input) {
  const trimmed = (input || '').trim();
  console.log('Parsing verse reference:', trimmed);

  const availableBooks = getCurrentBookList();

  // BookName Chapter:VerseRange
  const pattern = /^([a-zA-ZĞÜŞİÖÇğüşiöç\s\d\.']+)\s+(\d+):([\d\-,]+)$/i;
  const match = trimmed.match(pattern);

  if (match) {
    const inputBookName = match[1].trim();
    const normalizedInput = normalizeBookName(inputBookName);

    const matchedBook =
      availableBooks.find(
        (book) => normalizeBookName(book) === normalizedInput,
      ) ||
      availableBooks.find((book) => {
        const nb = normalizeBookName(book);
        return nb.includes(normalizedInput) || normalizedInput.includes(nb);
      });

    if (matchedBook) {
      return {
        isVerse: true,
        bookName: matchedBook,
        chapter: parseInt(match[2], 10),
        verseRange: match[3],
      };
    }
  }

  return { isVerse: false, bookName: '', chapter: 0, verseRange: '' };
}

// -------------------- API views --------------------
async function showVerseRange(bookName, chapterNumber, verseRange) {
  showLoading(
    `${bookName} ${chapterNumber}:${verseRange} ${t('yükleniyor...', 'loading...')}`,
  );

  try {
    // 1) Fetch primary range (currentLang)
    const primaryRes = await fetch(
      `${API_BASE}/${encodeURIComponent(bookName)}/${chapterNumber}/${encodeURIComponent(
        verseRange,
      )}?lang=${encodeURIComponent(currentLang)}`,
    );

    if (!primaryRes.ok) {
      throw new Error(
        t('Ayet aralığı getirilemedi', 'Could not load verse range'),
      );
    }

    const primaryVerses = await primaryRes.json();

    // If not parallel mode, normal results
    if (!parallelMode) {
      displayResults(
        primaryVerses,
        `${bookName} ${chapterNumber}:${verseRange}`,
      );
      return;
    }

    // 2) Determine secondary language
    const primaryLang = currentLang;
    const secondaryLang =
      parallelSecondaryLang === primaryLang
        ? primaryLang === 'en'
          ? 'tr'
          : 'en'
        : parallelSecondaryLang;

    // Need bookNumber to map book name in secondary language
    const bookNumber = primaryVerses?.[0]?.bookNumber;
    if (!bookNumber) {
      displayResults(
        primaryVerses,
        `${bookName} ${chapterNumber}:${verseRange}`,
      );
      return;
    }

    // Ensure secondary books loaded
    await ensureBooksLoaded(secondaryLang);

    const secondaryBookObj = booksCacheByLang[secondaryLang].books.find(
      (b) => b.bookNumber === bookNumber,
    );

    // fallback if mapping fails
    if (!secondaryBookObj?.name) {
      displayResults(
        primaryVerses,
        `${bookName} ${chapterNumber}:${verseRange}`,
      );
      return;
    }

    const secondaryBookName = secondaryBookObj.name;

    // 3) Fetch secondary range
    const secondaryRes = await fetch(
      `${API_BASE}/${encodeURIComponent(
        secondaryBookName,
      )}/${chapterNumber}/${encodeURIComponent(verseRange)}?lang=${encodeURIComponent(
        secondaryLang,
      )}`,
    );

    // If secondary fails, still show primary
    if (!secondaryRes.ok) {
      displayResults(
        primaryVerses,
        `${bookName} ${chapterNumber}:${verseRange}`,
      );
      return;
    }

    const secondaryVerses = await secondaryRes.json();

    // 4) Merge by verseNumber
    const merged = mergeParallelVerses(
      primaryVerses,
      secondaryVerses,
      primaryLang,
      secondaryLang,
    );

    // 5) Render parallel view (re-use your existing parallel chapter renderer)
    // Title should be verse-range, not "Chapter"
    displayParallelRangeView(merged, bookName, chapterNumber, verseRange);
  } catch (error) {
    showError(
      `${t('Ayet aralığı getirilemedi', 'Could not load verse range')}: ${error.message}`,
    );
  }
}

function displayParallelRangeView(rows, bookName, chapterNumber, verseRange) {
  clearPendingResults();

  const map = new Map();
  for (const r of rows || []) {
    if (r && !map.has(r.verseNumber)) map.set(r.verseNumber, r);
  }
  const verses = Array.from(map.values()).sort(
    (a, b) => a.verseNumber - b.verseNumber,
  );

  const bookNumber = verses?.[0]?.bookNumber;

  const primaryLang = (
    verses?.[0]?.primaryLang ||
    currentLang ||
    'tr'
  ).toUpperCase();
  const secondaryLang = (
    verses?.[0]?.secondaryLang ||
    parallelSecondaryLang ||
    'en'
  ).toUpperCase();

  const title = `${bookName} ${chapterNumber}:${verseRange}`;

  resultsDiv.innerHTML = `
    <div class="chapter-header">
      <h2>${escapeHtml(title)}</h2>
      <button class="btn btn-primary" id="backToSearchBtn">← ${t("Arama'ya Dön", 'Back to Search')}</button>
    </div>

    <div class="parallel-grid">
      <div class="parallel-row is-head">
        <div class="parallel-head">${escapeHtml(primaryLang)}</div>
        <div class="parallel-head">${escapeHtml(secondaryLang)}</div>
      </div>

      ${verses
        .map(
          (v) => `
          <div class="parallel-row" data-verse="${escapeHtml(String(v.verseNumber))}">
            <div class="parallel-cell left">
              <div class="parallel-verse-line">
                <span class="verse-number">${escapeHtml(String(v.verseNumber))}</span>
                <div class="parallel-text">${escapeHtml(v.primaryText || '')}</div>
              </div>
            </div>

            <div class="parallel-cell right">
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

  document
    .getElementById('backToSearchBtn')
    ?.addEventListener('click', loadInitialContent);

  // copy actions (EN should say Genesis, TR should say Yaratılış)
  wireParallelCopyActions(bookNumber, chapterNumber);
}

async function getRandomVerse() {
  showLoading(t('Rastgele ayet getiriliyor...', 'Loading random verse...'));

  try {
    const response = await fetch(
      `${API_BASE}/random?lang=${encodeURIComponent(currentLang)}`,
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const verse = await response.json();
    displayResults([verse], t('Rastgele Ayet', 'Random Verse'));
  } catch (error) {
    console.error('Random verse error:', error);
    showError(
      `${t('Rastgele ayet getirilemedi', 'Could not load random verse')}: ${error.message}`,
    );
  }
}

// -------------------- Rendering: search results --------------------
function displayResults(verses, title) {
  clearPendingResults();

  resultsDiv.innerHTML = `
    <div class="results-header">
      ${escapeHtml(title)} • ${Array.isArray(verses) ? verses.length : 0} ${t('sonuç', 'results')}
    </div>
  `;

  (verses || []).forEach((verse, index) => {
    const id = setTimeout(() => {
      resultsDiv.appendChild(createVerseElement(verse));
    }, index * 60);
    pendingResultTimeouts.push(id);
  });
}

function createVerseElement(verse) {
  const verseElement = document.createElement('div');
  verseElement.className = 'verse';

  // ✅ No inline onclick => no syntax errors from quotes/apostrophes
  verseElement.innerHTML = `
    <div class="verse-reference">
      ${escapeHtml(verse.bookName)} ${escapeHtml(String(verse.chapterNumber))}:${escapeHtml(
        String(verse.verseNumber),
      )}
    </div>
    <div class="verse-text">${escapeHtml(verse.text || '')}</div>

    <div class="verse-actions">
      <button class="btn-small btn-success js-read-chapter">
        📚 ${t('Tüm Bölümü Oku', 'Read Chapter')}
      </button>
      <button class="btn-small btn-warning js-view-context">
        🔍 ${t('Bağlamında Gör', 'View Context')}
      </button>
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

// -------------------- Chapter reading view + parallel --------------------
async function showChapter(bookName, chapterNumber) {
  showLoading(
    `${bookName} ${chapterNumber}. ${t('bölüm yükleniyor...', 'chapter loading...')}`,
  );

  try {
    // 1) Load primary chapter in currentLang
    const primaryUrl =
      `${API_BASE}/${encodeURIComponent(bookName)}/${chapterNumber}` +
      `?lang=${encodeURIComponent(currentLang)}`;

    const primaryRes = await fetch(primaryUrl);
    if (!primaryRes.ok)
      throw new Error(t('Bölüm getirilemedi', 'Could not load chapter'));

    const primaryVerses = await primaryRes.json();

    // Normal mode
    if (!parallelMode) {
      displayChapterView(primaryVerses, bookName, chapterNumber);
      return;
    }

    // Parallel mode: determine secondary language
    const primaryLang = currentLang;
    const secondaryLang =
      parallelSecondaryLang === primaryLang
        ? primaryLang === 'en'
          ? 'tr'
          : 'en'
        : parallelSecondaryLang;

    // Need bookNumber to map to secondary language book name
    const bookNumber = primaryVerses?.[0]?.bookNumber;
    if (!bookNumber) {
      displayChapterView(primaryVerses, bookName, chapterNumber);
      return;
    }

    await ensureBooksLoaded(secondaryLang);

    const secondaryBookObj = booksCacheByLang[secondaryLang].books.find(
      (b) => b.bookNumber === bookNumber,
    );

    // If we can't map, fallback to primary-only view
    if (!secondaryBookObj?.name) {
      displayChapterView(primaryVerses, bookName, chapterNumber);
      return;
    }

    const secondaryBookName = secondaryBookObj.name;

    // 2) Load secondary chapter using secondary book name
    const secondaryUrl =
      `${API_BASE}/${encodeURIComponent(secondaryBookName)}/${chapterNumber}` +
      `?lang=${encodeURIComponent(secondaryLang)}`;

    const secondaryRes = await fetch(secondaryUrl);
    if (!secondaryRes.ok) {
      // still show primary if secondary fails
      displayChapterView(primaryVerses, bookName, chapterNumber);
      return;
    }

    const secondaryVerses = await secondaryRes.json();

    // 3) Merge by verseNumber
    const merged = mergeParallelVerses(
      primaryVerses,
      secondaryVerses,
      primaryLang,
      secondaryLang,
    );

    // Use primary bookName for header, but show two columns
    displayParallelChapterView(merged, bookName, chapterNumber);
  } catch (error) {
    showError(
      `${t('Bölüm getirilemedi', 'Could not load chapter')}: ${error.message}`,
    );
  }
}

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

// -------------------- Context view --------------------
async function showVerseContext(bookName, chapterNumber, verseNumber) {
  showLoading(t('Ayet bağlamı yükleniyor...', 'Loading context...'));

  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(bookName)}/${chapterNumber}?lang=${encodeURIComponent(currentLang)}`,
    );

    if (!response.ok)
      throw new Error(t('Ayet bağlamı getirilemedi', 'Could not load context'));

    const allVerses = await response.json();
    displayContextView(
      allVerses,
      bookName,
      chapterNumber,
      parseInt(verseNumber, 10),
    );
  } catch (error) {
    showError(
      `${t('Ayet bağlamı getirilemedi', 'Could not load context')}: ${error.message}`,
    );
  }
}

// -------------------- Chapter renderers --------------------
function displayParallelChapterView(rows, bookName, chapterNumber) {
  clearPendingResults();

  // De-dupe + stable sort by verseNumber
  const map = new Map();
  for (const r of rows || []) {
    if (r && !map.has(r.verseNumber)) map.set(r.verseNumber, r);
  }
  const verses = Array.from(map.values()).sort(
    (a, b) => a.verseNumber - b.verseNumber,
  );

  const bookNumber = verses?.[0]?.bookNumber;

  const primaryLang = (
    verses?.[0]?.primaryLang ||
    currentLang ||
    'tr'
  ).toUpperCase();
  const secondaryLang = (
    verses?.[0]?.secondaryLang ||
    parallelSecondaryLang ||
    'en'
  ).toUpperCase();

  resultsDiv.innerHTML = `
    <div class="chapter-header">
      <h2>${escapeHtml(bookName)} ${escapeHtml(String(chapterNumber))}. ${t('Bölüm', 'Chapter')}</h2>
      <button class="btn btn-primary" id="backToSearchBtn">← ${t("Arama'ya Dön", 'Back to Search')}</button>
    </div>

    <div class="parallel-grid">
      <!-- Sticky Column Headers -->
      <div class="parallel-row is-head">
        <div class="parallel-head">${escapeHtml(primaryLang)}</div>
        <div class="parallel-head">${escapeHtml(secondaryLang)}</div>
      </div>

      ${verses
        .map(
          (v) => `
          <div class="parallel-row" data-verse="${escapeHtml(String(v.verseNumber))}">
            <div class="parallel-cell left">
              <div class="parallel-verse-line">
                <span class="verse-number">${escapeHtml(String(v.verseNumber))}</span>
                <div class="parallel-text">${escapeHtml(v.primaryText || '')}</div>
              </div>
            </div>

            <div class="parallel-cell right">
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

  document
    .getElementById('backToSearchBtn')
    ?.addEventListener('click', loadInitialContent);

  wirePrevNextArrows(
    bookNumber,
    chapterNumber,
    'prevChapterArrow',
    'nextChapterArrow',
  );

  // ✅ IMPORTANT: pass bookNumber so EN can become “Genesis”, TR becomes “Yaratılış”
  wireParallelCopyActions(bookNumber, chapterNumber);
}

/**
 * PARALLEL COPY RULES:
 * - Click badge copies ONLY clicked side: `${Ref}\n\nTR: ...` or `${Ref}\n\nEN: ...`
 * - Ref uses localized book name per side (EN => Genesis, TR => Yaratılış)
 * - Long-press copies ONLY clicked side (same payload)
 * - Shift+Click copies TR+EN together (optional)
 */
function wireParallelCopyActions(bookNumber, chapterNumber) {
  const rows = document.querySelectorAll('.parallel-row[data-verse]');
  rows.forEach((row) => {
    const verseNum = row.dataset.verse;

    const trText =
      row
        .querySelector('.parallel-cell.left .parallel-text')
        ?.innerText?.trim() || '';
    const enText =
      row
        .querySelector('.parallel-cell.right .parallel-text')
        ?.innerText?.trim() || '';

    row.querySelectorAll('.verse-number').forEach((badge) => {
      const cell = badge.closest('.parallel-cell');
      const isLeft = !!cell?.classList.contains('left');
      const lang = isLeft ? 'tr' : 'en';
      const sideLabel = isLeft ? 'TR' : 'EN';
      const verseText = (isLeft ? trText : enText) || '';

      const bookLocalized = getBookNameByNumber(lang, bookNumber, '');
      const ref = makeRef(bookLocalized || '', chapterNumber, verseNum);

      // --- Long press detection (touch + mouse) ---
      let pressTimer = null;
      let longPressed = false;

      const startPress = () => {
        longPressed = false;
        clearTimeout(pressTimer);
        pressTimer = setTimeout(async () => {
          longPressed = true;

          const textToCopy = `${ref}\n\n${sideLabel}: ${verseText}`.trim();
          const ok = await copyToClipboard(textToCopy);
          if (ok) showToast(`${ref} copied`);
        }, 520);
      };

      const cancelPress = () => {
        clearTimeout(pressTimer);
        pressTimer = null;
      };

      badge.addEventListener(
        'touchstart',
        (e) => {
          e.stopPropagation();
          startPress();
        },
        { passive: true },
      );
      badge.addEventListener('touchend', cancelPress);
      badge.addEventListener('touchcancel', cancelPress);

      badge.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        startPress();
      });
      badge.addEventListener('mouseup', cancelPress);
      badge.addEventListener('mouseleave', cancelPress);

      // --- CLICK action ---
      badge.addEventListener('click', async (e) => {
        e.stopPropagation();

        // If this click was the end of a long-press, don't double-trigger
        if (longPressed) return;

        // OPTIONAL: SHIFT + click copies TR+EN together
        if (e.shiftKey) {
          const trBook = getBookNameByNumber('tr', bookNumber, '');
          const enBook = getBookNameByNumber('en', bookNumber, '');
          const refTR = makeRef(trBook || '', chapterNumber, verseNum);
          const refEN = makeRef(enBook || '', chapterNumber, verseNum);

          const both =
            `${refTR}\nTR: ${trText}\n\n${refEN}\nEN: ${enText}`.trim();
          const ok = await copyToClipboard(both);
          if (ok)
            showToast(
              `${enBook || trBook} ${chapterNumber}:${verseNum} copied`,
            );
          return;
        }

        // Normal click: copy ONLY clicked side (ref + verse)
        const textToCopy = `${ref}\n\n${sideLabel}: ${verseText}`.trim();
        const ok = await copyToClipboard(textToCopy);
        if (ok) showToast(`${ref} copied`);
      });
    });
  });
}

function displayChapterView(verses, bookName, chapterNumber) {
  clearPendingResults();

  const uniqueVerses = dedupeVersesByNumber(verses);
  const bookNumber = uniqueVerses?.[0]?.bookNumber;

  resultsDiv.innerHTML = `
    <div class="chapter-header">
      <h2>${escapeHtml(bookName)} ${escapeHtml(String(chapterNumber))}. ${t('Bölüm', 'Chapter')}</h2>
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

    <!-- Side arrows -->
    <button id="prevChapterArrow" class="chapter-nav-arrow left" aria-label="${t('Önceki bölüm', 'Previous chapter')}">‹</button>
    <button id="nextChapterArrow" class="chapter-nav-arrow right" aria-label="${t('Sonraki bölüm', 'Next chapter')}">›</button>
  `;

  document
    .getElementById('backToSearchBtn')
    ?.addEventListener('click', loadInitialContent);

  wirePrevNextArrows(
    bookNumber,
    chapterNumber,
    'prevChapterArrow',
    'nextChapterArrow',
  );

  // ✅ Copy on click (chapter view)
  wireChapterCopyActions(bookNumber, bookName, chapterNumber);
}

function wireChapterCopyActions(bookNumber, fallbackBookName, chapterNumber) {
  document.querySelectorAll('.verse-in-chapter').forEach((row) => {
    const numEl = row.querySelector('.verse-number');
    const textEl = row.querySelector('.verse-text');
    if (!numEl || !textEl) return;

    numEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      const verseNum = row.dataset.verse || numEl.innerText.trim();
      const verseText = textEl.innerText.trim();

      // in single language view, use currentLang localized book name if possible
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
      prevBookObj = null; // first book + first chapter => no prev
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
      nextBookObj = null; // last book + last chapter => no next
    }
  }

  if (prevBookObj && prevBtn) {
    prevBtn.style.display = 'flex';
    prevBtn.onclick = () => showChapter(prevBookObj.name, prevChapter);
  } else if (prevBtn) {
    prevBtn.style.display = 'none';
  }

  if (nextBookObj && nextBtn) {
    nextBtn.style.display = 'flex';
    nextBtn.onclick = () => showChapter(nextBookObj.name, nextChapter);
  } else if (nextBtn) {
    nextBtn.style.display = 'none';
  }
}

function displayContextView(verses, bookName, chapterNumber, targetVerse) {
  clearPendingResults();

  const unique = dedupeVersesByNumber(verses);
  const bookNumber = unique?.[0]?.bookNumber;

  resultsDiv.innerHTML = `
    <div class="context-header">
      <h2>${escapeHtml(bookName)} ${escapeHtml(String(chapterNumber))}:${escapeHtml(
        String(targetVerse),
      )} — ${t('Bağlam', 'Context')}</h2>

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

  document
    .getElementById('backToSearchBtn2')
    ?.addEventListener('click', loadInitialContent);
  document
    .getElementById('readFullChapterBtn')
    ?.addEventListener('click', () => {
      showChapter(bookName, chapterNumber);
    });

  // ✅ Copy on click (context view)
  wireContextCopyActions(bookNumber, bookName, chapterNumber);

  setTimeout(() => {
    document
      .getElementById(`verse-${targetVerse}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
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
  showLoading(t('Yükleniyor...', 'Loading...'));
  setTimeout(() => {
    search('tanrı');
  }, 350);
}

// -------------------- Helpers --------------------
/** Removes duplicates like 1,1,2,2,3,3 */
function dedupeVersesByNumber(verses) {
  if (!Array.isArray(verses)) return [];
  const map = new Map();
  for (const v of verses) {
    if (v && !map.has(v.verseNumber)) map.set(v.verseNumber, v);
  }
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

// Tiny toast (“Genesis 2:14 copied”)
function showToast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }

  el.textContent = message;

  // restart animation
  el.classList.remove('show');
  // force reflow
  void el.offsetWidth;
  el.classList.add('show');

  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1100);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // fallback for older browsers
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

function getBookNameByNumber(lang, bookNumber, fallbackName = '') {
  const cache = booksCacheByLang?.[lang]?.books || [];
  const found = cache.find((b) => b.bookNumber === bookNumber);
  return found?.name || fallbackName || '';
}

function makeRef(bookName, chapterNumber, verseNumber) {
  // bookName can be empty if something is wrong; avoid leading space
  const bn = (bookName || '').trim();
  return bn
    ? `${bn} ${chapterNumber}:${verseNumber}`
    : `${chapterNumber}:${verseNumber}`;
}

// -------------------- Expose globals used by HTML --------------------
window.performSearch = performSearch;
window.search = search;
window.getRandomVerse = getRandomVerse;
window.showChapter = showChapter;
window.showVerseContext = showVerseContext;
window.loadInitialContent = loadInitialContent;

window.login = login;
window.registerUser = registerUser;
window.logout = logout;
