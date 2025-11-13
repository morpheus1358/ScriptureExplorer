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

// Create individual verse element
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
                📚 Tüm Bölüm
            </button>
            <button class="btn-small btn-warning" 
                    onclick="showVerseContext('${escapeHtml(
                      verse.bookName
                    )}', ${verse.chapterNumber}, ${verse.verseNumber})">
                🔍 Bağlamı Gör
            </button>
        </div>
    `;
  return verseElement;
}

// Navigation functions
async function showChapter(bookName, chapterNumber) {
  showLoading(`${bookName} ${chapterNumber}. bölüm yükleniyor...`);

  try {
    const response = await fetch(`${API_BASE}/${bookName}/${chapterNumber}`);

    if (!response.ok) throw new Error('Bölüm getirilemedi');

    const verses = await response.json();
    displayResults(verses, `${bookName} ${chapterNumber}. Bölüm`);
  } catch (error) {
    showError(`Bölüm getirilemedi: ${error.message}`);
  }
}

async function showVerseContext(bookName, chapterNumber, verseNumber) {
  const start = Math.max(1, parseInt(verseNumber) - 3);
  const end = parseInt(verseNumber) + 3;
  const range = `${start}-${end}`;

  showLoading('Ayet bağlamı yükleniyor...');

  try {
    const response = await fetch(
      `${API_BASE}/${bookName}/${chapterNumber}/${range}`
    );

    if (!response.ok) throw new Error('Ayet bağlamı getirilemedi');

    const verses = await response.json();
    displayResults(verses, `${bookName} ${chapterNumber}:${range}`);
  } catch (error) {
    showError(`Ayet bağlamı getirilemedi: ${error.message}`);
  }
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
