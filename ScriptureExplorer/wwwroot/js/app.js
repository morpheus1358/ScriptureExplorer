const API_BASE = '/api/verses';
const APP_NAME = 'ScriptureExplorer - Türkçe Kutsal Kitap';
let currentLang = 'tr';
// Book lists for parsing references
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

// 🧾 Auth state
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
  const usernameOrEmail = userInput.value.trim();
  const password = passInput.value;

  if (!usernameOrEmail || !password) {
    alert('Lütfen kullanıcı adı/e-posta ve şifre girin.');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailOrUserName: usernameOrEmail,
        password: password,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Login error:', text);
      alert('Giriş başarısız.');
      return;
    }

    const data = await res.json();
    // data.token, data.userName, data.email, data.expiresAt
    saveAuth(data.token, data.userName || usernameOrEmail);

    // İstersen giriş sonrası inputları temizle
    passInput.value = '';
    alert('Giriş başarılı!');
  } catch (err) {
    console.error(err);
    alert('Giriş sırasında hata oluştu.');
  }
}

async function registerUser() {
  const userInput = document.getElementById('auth-username');
  const passInput = document.getElementById('auth-password');
  const usernameOrEmail = userInput.value.trim();
  const password = passInput.value;

  if (!usernameOrEmail || !password) {
    alert('Lütfen kullanıcı adı/e-posta ve şifre girin.');
    return;
  }

  // Basit mantık: eğer @ varsa Email olarak kullan
  const isEmail = usernameOrEmail.includes('@');
  const email = isEmail ? usernameOrEmail : `${usernameOrEmail}@example.com`;
  const userName = isEmail ? usernameOrEmail.split('@')[0] : usernameOrEmail;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        userName: userName,
        password: password,
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
    passInput.value = '';
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

async function apiFetch(url, options = {}) {
  const opts = { ...options };
  opts.headers = opts.headers || {};

  if (!opts.headers['Content-Type'] && opts.method && opts.method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
  }

  if (authToken) {
    opts.headers['Authorization'] = 'Bearer ' + authToken;
  }

  return fetch(url, opts);
}

let searchInput, resultsDiv;

// 🆕 keep track of timeouts used in displayResults
let pendingResultTimeouts = [];

function clearPendingResults() {
  pendingResultTimeouts.forEach((id) => clearTimeout(id));
  pendingResultTimeouts = [];
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
  initializeApp();
  loadAuthFromStorage();
  updateAuthUi();
});

function initializeApp() {
  // Cache DOM elements
  searchInput = document.getElementById('searchInput');
  resultsDiv = document.getElementById('results');

  // Set up event listeners
  setupEventListeners();

  const langSelect = document.getElementById('languageSelect');
  if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener('change', () => {
      currentLang = langSelect.value;
    });
  }

  // Load initial content
  loadInitialContent();
}

function setupEventListeners() {
  // Enter key support for search
  searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // Real-time search suggestions (optional)
  searchInput.addEventListener(
    'input',
    debounce(function (e) {
      // Could add real-time suggestions here
    }, 300)
  );
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Main search function
async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    showError('Lütfen bir arama terimi girin');
    return;
  }

  await search(query);
}

async function search(query) {
  document.getElementById('searchInput').value = query;
  showLoading('Aranıyor...');

  try {
    // 1️⃣ FIRST: Check if it's a verse reference (e.g., "Yuhanna 15:16-18")
    const verseRef = tryParseVerseReference(query);
    if (verseRef.isVerse) {
      await showVerseRange(
        verseRef.bookName,
        verseRef.chapter,
        verseRef.verseRange
      );
      return;
    }

    // 2️⃣ SECOND: Check if it's a chapter reference (e.g., "Yuhanna 15")
    const chapterRef = tryParseChapterReference(query);
    if (chapterRef.isChapter) {
      await showChapter(chapterRef.bookName, chapterRef.chapter);
      return;
    }

    // 3️⃣ Else: normal text search
    const response = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(
        query
      )}&lang=${encodeURIComponent(currentLang)}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const verses = await response.json();
    if (!verses || verses.length === 0) {
      showEmpty(`"${query}" için sonuç bulunamadı`);
      return;
    }

    displayResults(verses, `Arama: "${query}"`);
  } catch (error) {
    console.error('Search error:', error);
    showError(`Arama sırasında hata oluştu: ${error.message}`);
  }
}

function normalizeBookName(bookName) {
  return bookName
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-zğüşıöç\s]/g, '')
    .trim();
}

function tryParseChapterReference(input) {
  const trimmed = input.trim();
  console.log('Parsing chapter reference:', trimmed);

  // If it has ":", it's not just a chapter reference
  if (trimmed.includes(':')) {
    return { isChapter: false, bookName: '', chapter: 0 };
  }

  const availableBooks = getCurrentBookList();

  // split on last space → "John 1" / "Çölde Sayım 12"
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) {
    return { isChapter: false, bookName: '', chapter: 0 };
  }

  const bookPart = trimmed.substring(0, lastSpace).trim();
  const chapterPart = trimmed.substring(lastSpace + 1).trim();

  const chapterNum = parseInt(chapterPart, 10);
  if (isNaN(chapterNum)) {
    return { isChapter: false, bookName: '', chapter: 0 };
  }

  const normalizedInput = normalizeBookName(bookPart);

  const matchedBook =
    availableBooks.find(
      (book) => normalizeBookName(book) === normalizedInput
    ) ||
    availableBooks.find((book) => {
      const nb = normalizeBookName(book);
      return nb.includes(normalizedInput) || normalizedInput.includes(nb);
    });

  if (!matchedBook) {
    return { isChapter: false, bookName: '', chapter: 0 };
  }

  console.log('✅ Chapter ref match:', matchedBook, chapterNum);
  return { isChapter: true, bookName: matchedBook, chapter: chapterNum };
}

function tryParseVerseReference(input) {
  const trimmed = input.trim();
  console.log('Parsing verse reference:', trimmed);

  const availableBooks = getCurrentBookList();

  // Pattern: "BookName Number:NumberRange"  e.g. "John 3:16-18", "Çölde Sayım 12:3-5"
  const pattern = /^([a-zA-ZĞÜŞİÖÇğüşiöç\s\d\.']+)\s+(\d+):([\d\-,]+)$/i;
  const match = trimmed.match(pattern);

  if (match) {
    const inputBookName = match[1].trim();
    const normalizedInput = normalizeBookName(inputBookName);

    let matchedBook =
      availableBooks.find(
        (book) => normalizeBookName(book) === normalizedInput
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

// 🆕 VERSE RANGE FUNCTION (for references like "Yuhanna 17:1-5")
async function showVerseRange(bookName, chapterNumber, verseRange) {
  showLoading(`${bookName} ${chapterNumber}:${verseRange} yükleniyor...`);

  try {
    const response = await fetch(
      `${API_BASE}/${bookName}/${chapterNumber}/${verseRange}?lang=${encodeURIComponent(
        currentLang
      )}`
    );

    if (!response.ok) throw new Error('Ayet aralığı getirilemedi');

    const verses = await response.json();

    // It's a single verse - show with context
    displayResults(verses, `${bookName} ${chapterNumber}:${verseRange}`);
  } catch (error) {
    showError(`Ayet aralığı getirilemedi: ${error.message}`);
  }
}

// Random verse function
async function getRandomVerse() {
  showLoading('Rastgele ayet getiriliyor...');

  try {
    const response = await fetch(
      `${API_BASE}/random?lang=${encodeURIComponent(currentLang)}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const verse = await response.json();
    displayResults([verse], 'Rastgele Ayet');
  } catch (error) {
    console.error('Random verse error:', error);
    showError(`Rastgele ayet getirilemedi: ${error.message}`);
  }
}

function displayResults(verses, title) {
  // 🆕 clear any previous animations before starting new ones
  clearPendingResults();

  resultsDiv.innerHTML = `
        <div class="results-header">
            ${title} • ${verses.length} sonuç
        </div>
    `;

  verses.forEach((verse, index) => {
    const id = setTimeout(() => {
      const verseElement = createVerseElement(verse);
      resultsDiv.appendChild(verseElement);
    }, index * 100);

    // 🆕 remember timeout id so we can cancel it later
    pendingResultTimeouts.push(id);
  });
}

// individual verse create
function createVerseElement(verse) {
  const verseElement = document.createElement('div');
  verseElement.className = 'verse';
  verseElement.innerHTML = `
        <div class="verse-reference">
            ${verse.bookName} ${verse.chapterNumber}:${verse.verseNumber}
        </div>
        <div class="verse-text">${escapeHtml(verse.text)}</div>
        <div class="verse-actions">
            <button class="btn-small btn-success" 
                    onclick="showChapter('${escapeHtml(verse.bookName)}', ${
    verse.chapterNumber
  })">
                📚 Tüm Bölümü Oku
            </button>
            <button class="btn-small btn-warning" 
                    onclick="showVerseContext('${escapeHtml(
                      verse.bookName
                    )}', ${verse.chapterNumber}, ${verse.verseNumber})">
                🔍 Bağlamında Gör
            </button>
        </div>
    `;
  return verseElement;
}

// Show entire chapter as reading view
async function showChapter(bookName, chapterNumber) {
  showLoading(`${bookName} ${chapterNumber}. bölüm yükleniyor...`);

  try {
    const response = await fetch(
      `${API_BASE}/${bookName}/${chapterNumber}?lang=${encodeURIComponent(
        currentLang
      )}`
    );

    if (!response.ok) throw new Error('Bölüm getirilemedi');

    const verses = await response.json();
    displayChapterView(verses, bookName, chapterNumber);
  } catch (error) {
    showError(`Bölüm getirilemedi: ${error.message}`);
  }
}

// Show verse with context (surrounding verses)
async function showVerseContext(bookName, chapterNumber, verseNumber) {
  showLoading('Ayet bağlamı yükleniyor...');

  try {
    // Get the entire chapter
    const response = await fetch(
      `${API_BASE}/${bookName}/${chapterNumber}?lang=${encodeURIComponent(
        currentLang
      )}`
    );

    if (!response.ok) throw new Error('Ayet bağlamı getirilemedi');

    const allVerses = await response.json();
    displayContextView(
      allVerses,
      bookName,
      chapterNumber,
      parseInt(verseNumber)
    );
  } catch (error) {
    showError(`Ayet bağlamı getirilemedi: ${error.message}`);
  }
}

// Display entire chapter as reading view
function displayChapterView(verses, bookName, chapterNumber) {
  clearPendingResults();
  resultsDiv.innerHTML = `
        <div class="chapter-header">
            <h2>${bookName} ${chapterNumber}. Bölüm</h2>
            <button class="btn btn-primary" onclick="loadInitialContent()">← Arama'ya Dön</button>
        </div>
        <div class="chapter-content">
            ${verses
              .map(
                (verse) => `
                <div class="verse-in-chapter" id="verse-${verse.verseNumber}">
                    <span class="verse-number">${verse.verseNumber}</span>
                    <span class="verse-text">${escapeHtml(verse.text)}</span>
                </div>
            `
              )
              .join('')}
        </div>
    `;
}

// Display verse with highlighted context
function displayContextView(verses, bookName, chapterNumber, targetVerse) {
  clearPendingResults();
  resultsDiv.innerHTML = `
        <div class="context-header">
            <h2>${bookName} ${chapterNumber}:${targetVerse} - Bağlam</h2>
            <button class="btn btn-primary" onclick="loadInitialContent()">← Arama'ya Dön</button>
            <button class="btn btn-secondary" onclick="showChapter('${escapeHtml(
              bookName
            )}', ${chapterNumber})">
                Tüm Bölümü Oku
            </button>
        </div>
        <div class="context-content">
            ${verses
              .map(
                (verse) => `
                <div class="verse-in-context ${
                  verse.verseNumber === targetVerse ? 'highlighted-verse' : ''
                }" 
                     id="verse-${verse.verseNumber}">
                    <span class="verse-number">${verse.verseNumber}</span>
                    <span class="verse-text">${escapeHtml(verse.text)}</span>
                </div>
            `
              )
              .join('')}
        </div>
    `;

  // Scroll to the target verse
  setTimeout(() => {
    const targetElement = document.getElementById(`verse-${targetVerse}`);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

// UI State functions
function showLoading(message = 'Yükleniyor...') {
  clearPendingResults();
  resultsDiv.innerHTML = `
        <div class="loading">
            <div>⏳ ${message}</div>
        </div>
    `;
}

function showError(message) {
  clearPendingResults();
  resultsDiv.innerHTML = `
        <div class="error">
            <div>❌ ${message}</div>
            <button class="btn-small btn-primary" onclick="loadInitialContent()" style="margin-top: 10px;">
                Tekrar Dene
            </button>
        </div>
    `;
}

function showEmpty(message) {
  clearPendingResults();
  resultsDiv.innerHTML = `
        <div class="empty">
            <div>🔍 ${message}</div>
            <button class="btn-small btn-primary" onclick="getRandomVerse()" style="margin-top: 10px;">
                Rastgele Ayet Göster
            </button>
        </div>
    `;
}

// Initial content
function loadInitialContent() {
  showLoading('Yükleniyor...');
  setTimeout(() => {
    search('tanrı');
  }, 1000);
}

// Utility function to escape HTML
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Make functions globally available
window.performSearch = performSearch;
window.search = search;
window.getRandomVerse = getRandomVerse;
window.showChapter = showChapter;
window.showVerseContext = showVerseContext;
window.loadInitialContent = loadInitialContent;
