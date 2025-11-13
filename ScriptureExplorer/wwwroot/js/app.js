// Configuration
const API_BASE = '/api/verses';
const APP_NAME = 'ScriptureExplorer - Türkçe Kutsal Kitap';

// DOM Elements
let searchInput, resultsDiv;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
  initializeApp();
});

function initializeApp() {
  // Cache DOM elements
  searchInput = document.getElementById('searchInput');
  resultsDiv = document.getElementById('results');

  // Set up event listeners
  setupEventListeners();

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
    // 🆕 FIRST: Check if it's a chapter reference (e.g., "Yuhanna 17")
    const chapterRef = tryParseChapterReference(query);
    if (chapterRef.isChapter) {
      // It's a chapter reference - show the entire chapter directly
      await showChapter(chapterRef.bookName, chapterRef.chapter);
      return;
    }

    // 🆕 SECOND: Check if it's a verse reference (e.g., "Yuhanna 17:1")
    const verseRef = tryParseVerseReference(query);
    if (verseRef.isVerse) {
      // It's a verse reference - show the verse range
      await showVerseRange(
        verseRef.bookName,
        verseRef.chapter,
        verseRef.verseRange
      );
      return;
    }

    // If no reference detected, do regular text search
    const response = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const verses = await response.json();

    if (verses.length === 0) {
      showEmpty(`"${query}" için sonuç bulunamadı`);
    } else {
      displayResults(verses, `"${query}" için sonuçlar`);
    }
  } catch (error) {
    console.error('Search error:', error);
    showError(`Arama sırasında hata oluştu: ${error.message}`);
  }
}

// 🆕 SMART BOOK NAME MATCHING WITH VARIATIONS
function normalizeBookName(bookName) {
  return bookName
    .toLowerCase()
    .replace(/'/g, '') // Remove apostrophes
    .replace(/\./g, '') // Remove dots
    .replace(/\s+/g, ' ') // Normalize spaces
    .replace(/[^a-zğüşıöç\s]/g, '') // Remove other special chars
    .trim();
}

// 🆕 SMART BOOK NAME MATCHING WITH VARIATIONS
function normalizeBookName(bookName) {
  return bookName
    .toLowerCase()
    .replace(/'/g, '') // Remove apostrophes
    .replace(/\./g, '') // Remove dots
    .replace(/\s+/g, ' ') // Normalize spaces
    .replace(/[^a-zğüşıöç\s]/g, '') // Remove other special chars
    .trim();
}

function tryParseChapterReference(input) {
  const trimmed = input.trim();
  console.log('Parsing chapter reference:', trimmed);

  // Actual book names from your API (with variations)
  const availableBooks = [
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

  // Pattern: "BookName Number" (e.g., "Çölde Sayım 12")
  const pattern = /^([a-zA-ZĞÜŞİÖÇğüşiöç\s\d\.']+)\s+(\d+)$/i;
  const match = trimmed.match(pattern);

  if (match) {
    const inputBookName = match[1].trim();
    const normalizedInput = normalizeBookName(inputBookName);
    console.log(
      'Input book name:',
      inputBookName,
      'Normalized:',
      normalizedInput
    );

    // Find the best matching book name
    const matchedBook = availableBooks.find((book) => {
      const normalizedBook = normalizeBookName(book);
      console.log('Comparing:', normalizedInput, 'vs', normalizedBook);
      return normalizedBook === normalizedInput;
    });

    if (matchedBook) {
      console.log('✅ Exact match found:', matchedBook);
      return {
        isChapter: true,
        bookName: matchedBook, // Use the EXACT book name from database
        chapter: parseInt(match[2]),
      };
    } else {
      console.log('❌ No exact match, trying partial...');
      // Try partial matching for cases like "1 Krallar" vs "1. Krallar"
      const partialMatch = availableBooks.find((book) => {
        const normalizedBook = normalizeBookName(book);
        return (
          normalizedBook.includes(normalizedInput) ||
          normalizedInput.includes(normalizedBook)
        );
      });

      if (partialMatch) {
        console.log('✅ Partial match found:', partialMatch);
        return {
          isChapter: true,
          bookName: partialMatch,
          chapter: parseInt(match[2]),
        };
      }
    }
  }

  console.log('❌ Not a chapter reference');
  return { isChapter: false, bookName: '', chapter: 0 };
}

// 🆕 SIMILAR FIX FOR VERSE REFERENCES
function tryParseVerseReference(input) {
  const trimmed = input.trim();
  console.log('Parsing verse reference:', trimmed);

  const availableBooks = [
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

  // Pattern: "BookName Number:NumberRange" (e.g., "Çölde Sayım 12:1")
  const pattern = /^([a-zA-ZĞÜŞİÖÇğüşiöç\s\d\.']+)\s+(\d+):([\d\-,]+)$/i;
  const match = trimmed.match(pattern);

  if (match) {
    const inputBookName = match[1].trim();
    const normalizedInput = normalizeBookName(inputBookName);

    // Find the best matching book name
    const matchedBook = availableBooks.find(
      (book) => normalizeBookName(book) === normalizedInput
    );

    if (matchedBook) {
      return {
        isVerse: true,
        bookName: matchedBook,
        chapter: parseInt(match[2]),
        verseRange: match[3],
      };
    } else {
      // Try partial matching
      const partialMatch = availableBooks.find((book) => {
        const normalizedBook = normalizeBookName(book);
        return (
          normalizedBook.includes(normalizedInput) ||
          normalizedInput.includes(normalizedBook)
        );
      });

      if (partialMatch) {
        return {
          isVerse: true,
          bookName: partialMatch,
          chapter: parseInt(match[2]),
          verseRange: match[3],
        };
      }
    }
  }

  return { isVerse: false, bookName: '', chapter: 0, verseRange: '' };
}

// 🆕 VERSE RANGE FUNCTION (for references like "Yuhanna 17:1-5")
async function showVerseRange(bookName, chapterNumber, verseRange) {
  showLoading(`${bookName} ${chapterNumber}:${verseRange} yükleniyor...`);

  try {
    const response = await fetch(
      `${API_BASE}/${bookName}/${chapterNumber}/${verseRange}`
    );

    if (!response.ok) throw new Error('Ayet aralığı getirilemedi');

    const verses = await response.json();

    if (verseRange.includes('-') || verseRange.includes(',')) {
      // It's a range - show as context view
      displayResults(verses, `${bookName} ${chapterNumber}:${verseRange}`);
    } else {
      // It's a single verse - show with context
      await showVerseContext(bookName, chapterNumber, parseInt(verseRange));
    }
  } catch (error) {
    showError(`Ayet aralığı getirilemedi: ${error.message}`);
  }
}

// Random verse function
async function getRandomVerse() {
  showLoading('Rastgele ayet getiriliyor...');

  try {
    const response = await fetch(`${API_BASE}/random`);

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

// Display results
function displayResults(verses, title) {
  resultsDiv.innerHTML = `
        <div class="results-header">
            ${title} • ${verses.length} sonuç
        </div>
    `;

  verses.forEach((verse, index) => {
    setTimeout(() => {
      const verseElement = createVerseElement(verse);
      resultsDiv.appendChild(verseElement);
    }, index * 100); // Stagger animation
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
    const response = await fetch(`${API_BASE}/${bookName}/${chapterNumber}`);

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
    const response = await fetch(`${API_BASE}/${bookName}/${chapterNumber}`);

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
  resultsDiv.innerHTML = `
        <div class="loading">
            <div>⏳ ${message}</div>
        </div>
    `;
}

function showError(message) {
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
