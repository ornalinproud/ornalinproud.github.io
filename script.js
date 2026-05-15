// === DATA ===
// Kanji data is loaded at startup from kanji_data.tsv (alongside this file).
// Declared with `let` so the Excel upload feature can replace it at runtime.
let kanjiData = {};

async function loadKanjiDataFromTSV(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Failed to load ' + url + ': ' + res.status);
  const text = await res.text();
  return parseKanjiTSV(text);
}

function parseKanjiTSV(text) {
  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return {};
  const header = lines[0].split('\t').map(h => h.trim());
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });

  // Required column check.
  const required = ['level','lesson','kanji'];
  for (const c of required) {
    if (!(c in idx)) throw new Error('kanji_data.tsv missing column: ' + c);
  }

  const result = {};
  // Group consecutive (level, lesson, kanji) rows into one kanji entry whose
  // `words` array accumulates each row's vocab/furigana/meaning fields.
  const kanjiKey = (level, lesson, kanji) => level + '\u0000' + lesson + '\u0000' + kanji;
  const seen = {}; // kanjiKey -> entry object reference

  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split('\t');
    const get = (name) => (idx[name] !== undefined ? (cols[idx[name]] ?? '') : '');

    const level = get('level').trim();
    const lesson = get('lesson').trim();
    const kanji = get('kanji').trim();
    if (!level || !lesson || !kanji) continue;

    if (!result[level]) result[level] = {};
    if (!result[level][lesson]) result[level][lesson] = [];

    const key = kanjiKey(level, lesson, kanji);
    let entry = seen[key];
    if (!entry) {
      entry = {
        kanji: kanji,
        onyomi: get('onyomi'),
        kunyomi: get('kunyomi'),
        words: [],
        example_th: get('example_th'),
        example_en: get('example_en'),
      };
      result[level][lesson].push(entry);
      seen[key] = entry;
    }

    const vocab = get('vocab');
    if (vocab) {
      entry.words.push({
        vocab: vocab,
        furigana: get('furigana'),
        meaning_th: get('meaning_th'),
        meaning_en: get('meaning_en'),
      });
    }
  }
  return result;
}


// === STATE ===
let lang = null; // 'th' or 'en'
let currentPage = 'lang-select';
let selectedLevel = null;
let selectedLessons = [];
let kanjiProgress = {}; // { "kanji_char": { status: "green"|"yellow"|"red"|"gray", reviewCount: 0 } }
let highScores = { quiz: {}, match: {} };
let matchMode = 'meaning'; // 'meaning' or 'furigana'

// Flashcard state
let flashcardDeck = [];
let flashcardIndex = 0;
let isFlipped = false;
let reviewRound = 1;
let failedCards = [];
let cardReviewCounts = {}; // track how many times each card was reviewed

// Quiz state
let quizQuestions = [];
let quizIndex = 0;
let quizScore = 0;
let quizAnswered = false;

// Match state
let matchPairs = [];
let matchSelected = null;
let matchCorrect = 0;
let matchAttempts = 0;
let matchCompleted = 0;

// === i18n ===
const i18n = {
  th: {
    title: "คันจิติวเตอร์",
    selectLang: "เลือกภาษา",
    review: "ทบทวนบทเรียน",
    quiz: "ควิซ",
    matchGame: "เกมจับคู่",
    allKanji: "คันจิทั้งหมด",
    selectLevel: "เลือกชั้นเรียน",
    selectLesson: "เลือกบทเรียน",
    start: "เริ่ม",
    next: "ถัดไป",
    back: "กลับ",
    home: "หน้าหลัก",
    remember: "จำได้",
    dontRemember: "จำไม่ได้",
    tapToFlip: "แตะเพื่อพลิกการ์ด",
    complete: "ทบทวนครบแล้ว!",
    congrats: "ยินดีด้วย!",
    score: "คะแนน",
    highScore: "คะแนนสูงสุด",
    excellent: "เก่งมาก!",
    good: "ทำได้ดี ตั้งใจต่อไป!",
    tryAgain: "ลองทบทวนใหม่อีกครั้ง",
    matchMeaning: "จับคู่คันจิกับความหมาย",
    matchFurigana: "จับคู่คันจิกับฟุริงานะ",
    onyomi: "音読み",
    kunyomi: "訓読み",
    remaining: "เหลือ",
    round: "รอบที่",
    of: "จาก",
    cards: "ใบ",
    correct: "ถูก",
    wrong: "ผิด",
    legend: "สัญลักษณ์สี",
    greenDesc: "จำได้ตั้งแต่ครั้งแรก",
    yellowDesc: "ทบทวน 1-3 ครั้ง",
    redDesc: "ทบทวนมากกว่า 3 ครั้ง",
    grayDesc: "ยังไม่ได้ทบทวน",
    attempts: "ครั้ง",
  },
  en: {
    title: "Kanji Tutor",
    selectLang: "Select Language",
    review: "Flashcard Review",
    quiz: "Quiz",
    matchGame: "Matching Game",
    allKanji: "All Kanji",
    selectLevel: "Select Level",
    selectLesson: "Select Lessons",
    start: "Start",
    next: "Next",
    back: "Back",
    home: "Home",
    remember: "I Remember",
    dontRemember: "Don't Remember",
    tapToFlip: "Tap to flip card",
    complete: "Review Complete!",
    congrats: "Congratulations!",
    score: "Score",
    highScore: "High Score",
    excellent: "Excellent!",
    good: "Good job, keep it up!",
    tryAgain: "Try reviewing again",
    matchMeaning: "Match Kanji with Meaning",
    matchFurigana: "Match Kanji with Furigana",
    onyomi: "音読み",
    kunyomi: "訓読み",
    remaining: "Remaining",
    round: "Round",
    of: "of",
    cards: "cards",
    correct: "Correct",
    wrong: "Wrong",
    legend: "Color Legend",
    greenDesc: "Remembered on first try",
    yellowDesc: "Reviewed 1-3 times",
    redDesc: "Reviewed more than 3 times",
    grayDesc: "Not yet reviewed",
    attempts: "attempts",
  }
};

function t(key) { return i18n[lang]?.[key] || key; }
function getMeaning(word) { return lang === 'th' ? word.meaning_th : word.meaning_en; }

// === DATA SDK ===
let savedData = [];

const dataHandler = {
  onDataChanged(data) {
    savedData = data;
    // Rebuild progress from saved data
    kanjiProgress = {};
    highScores = { quiz: {}, match: {} };
    data.forEach(d => {
      if (d.kanji && d.status) {
        kanjiProgress[d.kanji] = { status: d.status, reviewCount: d.review_count || 0 };
      }
      if (d.kanji === '__quiz_highscore' && d.lesson) {
        highScores.quiz[d.lesson] = d.quiz_high_score || 0;
      }
      if (d.kanji === '__match_highscore' && d.lesson) {
        highScores.match[d.lesson] = d.match_high_score || 0;
      }
    });
    if (currentPage === 'all-kanji') renderAllKanji();
  }
};

async function saveKanjiProgress(kanjiChar, status, reviewCount) {
  kanjiProgress[kanjiChar] = { status, reviewCount };
  const existing = savedData.find(d => d.kanji === kanjiChar && d.status !== undefined && d.kanji !== '__quiz_highscore' && d.kanji !== '__match_highscore');
  if (existing) {
    await window.dataSdk.update({ ...existing, status, review_count: reviewCount, lesson: selectedLessons.join(','), level: selectedLevel });
  } else {
    if (savedData.length >= 999) return;
    await window.dataSdk.create({ kanji: kanjiChar, status, review_count: reviewCount, lesson: selectedLessons.join(','), level: selectedLevel });
  }
}

async function saveHighScore(type, key, score) {
  const markerKanji = type === 'quiz' ? '__quiz_highscore' : '__match_highscore';
  const existing = savedData.find(d => d.kanji === markerKanji && d.lesson === key);
  const field = type === 'quiz' ? 'quiz_high_score' : 'match_high_score';
  if (existing) {
    if (score > (existing[field] || 0)) {
      await window.dataSdk.update({ ...existing, [field]: score });
    }
  } else {
    if (savedData.length >= 999) return;
    await window.dataSdk.create({ kanji: markerKanji, status: '', review_count: 0, [field]: score, lesson: key, level: selectedLevel || '' });
  }
  highScores[type][key] = Math.max(highScores[type][key] || 0, score);
}

// === RENDER ENGINE ===
const app = document.getElementById('app');

function render() {
  switch(currentPage) {
    case 'lang-select': renderLangSelect(); break;
    case 'home': renderHome(); break;
    case 'select-level': renderSelectLevel(); break;
    case 'select-lesson': renderSelectLesson(); break;
    case 'flashcard': renderFlashcard(); break;
    case 'flashcard-result': renderFlashcardResult(); break;
    case 'quiz': renderQuiz(); break;
    case 'quiz-result': renderQuizResult(); break;
    case 'match-setup': renderMatchSetup(); break;
    case 'match': renderMatch(); break;
    case 'match-result': renderMatchResult(); break;
    case 'all-kanji': renderAllKanji(); break;
  }
  lucide.createIcons();
}

function renderLangSelect() {
  app.innerHTML = `
    <div class="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-6">
      <div class="text-center fade-in">
        <div class="text-7xl mb-6">漢字</div>
        <h1 class="text-3xl font-bold mb-2" style="font-family:'Sawarabi Mincho',serif">Kanji Tutor</h1>
        <p class="text-slate-400 mb-10 text-lg">คันจิติวเตอร์</p>
        <div class="flex gap-4 justify-center mb-8">
          <button onclick="selectLang('th')" class="px-8 py-4 rounded-xl btn-primary text-white font-bold text-lg shadow-lg hover:scale-105 transition-transform">🇹🇭 ภาษาไทย</button>
          <button onclick="selectLang('en')" class="px-8 py-4 rounded-xl btn-primary text-white font-bold text-lg shadow-lg hover:scale-105 transition-transform">🇬🇧 English</button>
        </div>
        <div class="border-t border-white/10 pt-8">
          <p class="text-slate-400 text-sm mb-4">📊 หรืออัพโหลดไฟล์ Excel</p>
          <input type="file" id="excel-input" accept=".xlsx,.xls" onchange="handleExcelUpload(event)" class="hidden">
          <button onclick="document.getElementById('excel-input').click()" class="px-6 py-2 rounded-lg bg-white/10 border border-white/20 text-sm hover:bg-white/20 transition-colors">เลือกไฟล์ Excel</button>
        </div>
      </div>
    </div>`;
}

function handleExcelUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const importedData = parseExcelWorkbook(workbook);
      
      if (importedData && Object.keys(importedData).length > 0) {
        kanjiData = importedData;
        lang = 'en';
        currentPage = 'home';
        render();
        showNotification('✓ Excel ไฟล์อัพโหลดสำเร็จ!');
      } else {
        showNotification('⚠ ไม่พบข้อมูลคันจิในไฟล์');
      }
    } catch (error) {
      showNotification('✗ เกิดข้อผิดพลาดในการอ่านไฟล์: ' + error.message);
    }
    event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

function parseExcelWorkbook(workbook) {
  const result = {};
  
  workbook.SheetNames.forEach(sheetName => {
    if (sheetName.toLowerCase() === 'guide' || sheetName.toLowerCase() === 'instruction') return;
    
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    
    const sheetData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (sheetData.length === 0) return;
    
    // Normalize header names to handle Thai, English, mixed cases
    const normalizedData = sheetData.map(row => {
      const normalized = {};
      Object.keys(row).forEach(key => {
        const lower = key.toLowerCase().trim();
        // Map various header names to standard keys
        if (lower === 'level' || lower === 'ชั้นเรียน') normalized.level = row[key];
        else if (lower === 'lessons' || lower === 'lesson' || lower === 'บทเรียน' || lower === 'บท') normalized.lesson = row[key];
        else if (lower === 'kanji' || lower === 'คันจิ') normalized.kanji = row[key];
        else if (key === '音読み' || lower === 'onyomi') normalized.onyomi = row[key];
        else if (key === '訓読み' || lower === 'kunyomi') normalized.kunyomi = row[key];
        else if (lower === 'ศัพท์' || lower === 'vocab' || lower === 'vocabulary' || lower === 'word') normalized.vocab = row[key];
        else if (lower === 'furigana' || lower === 'ふりがな') normalized.furigana = row[key];
        else if (lower === 'ความหมาย' || lower === 'meaning_th' || lower === 'meaning thai') normalized.meaning_th = row[key];
        else if (lower === 'meaning' || lower === 'meaning_en' || lower === 'meaning english') normalized.meaning_en = row[key];
        else if (lower === 'ตัวอย่างประโยค' || lower === 'example' || lower === 'example_th' || lower === 'example thai') normalized.example_th = row[key];
        else if (lower === 'example_en' || lower === 'example english') normalized.example_en = row[key];
      });
      return normalized;
    });
    
    normalizedData.forEach((row) => {
      const level = (row.level || sheetName || 'N5').trim();
      const lesson = (row.lesson || 'บทที่ 1').trim();
      const kanji = (row.kanji || '').trim();
      
      if (!kanji) return;
      
      // Initialize level if needed
      if (!result[level]) result[level] = {};
      if (!result[level][lesson]) result[level][lesson] = [];
      
      // Get readings
      const onyomi = (row.onyomi || '').trim();
      const kunyomi = (row.kunyomi || '').trim();
      
      // Get word info
      const vocab = (row.vocab || '').trim();
      const furigana = (row.furigana || '').trim();
      const meaning_th = (row.meaning_th || '').trim();
      const meaning_en = (row.meaning_en || '').trim();
      
      // Get example sentences
      const example_th = (row.example_th || '').trim();
      const example_en = (row.example_en || '').trim();
      
      // Create words array
      const words = [];
      if (vocab) {
        words.push({
          vocab: vocab,
          furigana: furigana,
          meaning_th: meaning_th,
          meaning_en: meaning_en
        });
      }
      
      result[level][lesson].push({
        kanji: kanji,
        onyomi: onyomi,
        kunyomi: kunyomi,
        words: words,
        example_th: example_th,
        example_en: example_en
      });
    });
  });
  
  return result;
}

function showNotification(msg) {
  const notif = document.createElement('div');
  notif.className = 'fixed top-4 left-4 px-6 py-3 rounded-lg bg-slate-800 border border-white/20 text-white fade-in z-50';
  notif.textContent = msg;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

function selectLang(l) { lang = l; currentPage = 'home'; render(); }

function renderHome() {
  app.innerHTML = `
    <div class="h-full w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-6 overflow-auto">
      <div class="max-w-lg mx-auto fade-in">
        <h1 class="text-3xl font-bold text-center mb-8" style="font-family:'Sawarabi Mincho',serif">${t('title')}</h1>
        <div class="grid grid-cols-1 gap-4">
          ${homeCard('book-open', t('review'), "goTo('select-level','review')")}
          ${homeCard('help-circle', t('quiz'), "goTo('select-level','quiz')")}
          ${homeCard('grid', t('matchGame'), "goTo('select-level','match')")}
          ${homeCard('list', t('allKanji'), "goTo('all-kanji')")}
        </div>
        <button onclick="currentPage='lang-select';render()" class="mt-6 text-slate-400 hover:text-white text-sm flex items-center gap-1 mx-auto"><i data-lucide="globe" style="width:16px;height:16px"></i> ${t('selectLang')}</button>
      </div>
    </div>`;
}

function homeCard(icon, label, onclick) {
  return `<button onclick="${onclick}" class="flex items-center gap-4 p-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-indigo-400/50 transition-all text-left w-full">
    <div class="w-12 h-12 rounded-lg bg-indigo-500/20 flex items-center justify-center"><i data-lucide="${icon}" style="width:24px;height:24px;color:#818cf8"></i></div>
    <span class="text-lg font-medium">${label}</span>
    <i data-lucide="chevron-right" style="width:20px;height:20px;margin-left:auto;color:#6b7280"></i>
  </button>`;
}

let currentMode = '';
function goTo(page, mode) {
  if (mode) currentMode = mode;
  if (page === 'all-kanji') { currentPage = 'all-kanji'; render(); return; }
  selectedLevel = null; selectedLessons = [];
  currentPage = page; render();
}

function renderSelectLevel() {
  const levels = Object.keys(kanjiData);
  app.innerHTML = `
    <div class="h-full w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-6 overflow-auto">
      <div class="max-w-lg mx-auto fade-in">
        ${backBtn('home')}
        <h2 class="text-2xl font-bold text-center mb-6">${t('selectLevel')}</h2>
        <div class="grid grid-cols-2 gap-4">
          ${levels.map(lv => `<button onclick="selectedLevel='${lv}';currentPage='select-lesson';render()" class="p-6 rounded-xl bg-white/5 border border-white/10 hover:bg-indigo-500/20 hover:border-indigo-400 transition-all text-center">
            <div class="text-2xl font-bold text-indigo-300">${lv}</div>
          </button>`).join('')}
        </div>
      </div>
    </div>`;
}

function renderSelectLesson() {
  const lessons = Object.keys(kanjiData[selectedLevel] || {});
  const isMatch = currentMode === 'match';
  app.innerHTML = `
    <div class="h-full w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-6 overflow-auto">
      <div class="max-w-lg mx-auto fade-in">
        ${backBtn('select-level')}
        <h2 class="text-2xl font-bold text-center mb-2">${t('selectLesson')}</h2>
        <p class="text-center text-slate-400 mb-6">${selectedLevel}</p>
        <div class="grid grid-cols-2 gap-3 mb-6" id="lesson-grid">
          ${lessons.map(ls => `<button onclick="toggleLesson('${ls}',this)" class="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400 transition-all text-center lesson-btn" data-lesson="${ls}">
            <div class="font-medium">${ls}</div>
            <div class="text-xs text-slate-400">${kanjiData[selectedLevel][ls].length} 漢字</div>
          </button>`).join('')}
        </div>
        ${isMatch ? `
        <div class="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
          <p class="text-sm text-slate-300 mb-3">${t('matchGame')}:</p>
          <div class="flex gap-3">
            <button onclick="matchMode='meaning';document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('ring-2','ring-indigo-400'));this.classList.add('ring-2','ring-indigo-400')" class="mode-btn flex-1 p-3 rounded-lg bg-indigo-500/20 text-sm ring-2 ring-indigo-400">${t('matchMeaning')}</button>
            <button onclick="matchMode='furigana';document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('ring-2','ring-indigo-400'));this.classList.add('ring-2','ring-indigo-400')" class="mode-btn flex-1 p-3 rounded-lg bg-indigo-500/20 text-sm">${t('matchFurigana')}</button>
          </div>
        </div>` : ''}
        <button onclick="startActivity()" class="w-full py-4 rounded-xl btn-primary text-white font-bold text-lg disabled:opacity-50" id="start-btn" disabled>${t('start')}</button>
      </div>
    </div>`;
}

function toggleLesson(ls, el) {
  const idx = selectedLessons.indexOf(ls);
  if (idx >= 0) { selectedLessons.splice(idx, 1); el.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-500/20'); el.classList.add('bg-white/5'); }
  else { selectedLessons.push(ls); el.classList.add('ring-2', 'ring-indigo-400', 'bg-indigo-500/20'); el.classList.remove('bg-white/5'); }
  document.getElementById('start-btn').disabled = selectedLessons.length === 0;
}

function getSelectedKanji() {
  let items = [];
  selectedLessons.forEach(ls => { items = items.concat(kanjiData[selectedLevel][ls] || []); });
  return items;
}

function startActivity() {
  if (selectedLessons.length === 0) return;
  if (currentMode === 'review') startFlashcards();
  else if (currentMode === 'quiz') startQuiz();
  else if (currentMode === 'match') { currentPage = 'match'; startMatch(); }
}

// === FLASHCARDS ===
function startFlashcards() {
  const items = getSelectedKanji();
  flashcardDeck = shuffle([...items]);
  flashcardIndex = 0; isFlipped = false; reviewRound = 1; failedCards = []; cardReviewCounts = {};
  items.forEach(k => { cardReviewCounts[k.kanji] = 0; });
  currentPage = 'flashcard'; render();
}

function renderFlashcard() {
  if (flashcardDeck.length === 0) { currentPage = 'flashcard-result'; render(); return; }
  const card = flashcardDeck[flashcardIndex];
  const progress = `${flashcardIndex + 1} / ${flashcardDeck.length}`;
  
  app.innerHTML = `
    <div class="h-full w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-4 overflow-auto flex flex-col">
      <div class="max-w-lg mx-auto w-full flex-1 flex flex-col">
        ${backBtn('home')}
        <div class="flex justify-between items-center mb-4">
          <span class="text-sm text-slate-400">${t('round')} ${reviewRound}</span>
          <span class="text-sm text-slate-400">${progress}</span>
        </div>
        <div class="flex-1 flex items-center justify-center">
          <div class="card-flip w-full ${isFlipped ? 'flipped' : ''}" style="max-width:400px;height:280px" onclick="flipCard()">
            <div class="card-inner">
              <div class="card-front bg-gradient-to-br from-slate-800 to-slate-700 border border-white/10 shadow-2xl flex p-6">
                <div class="flex w-full">
                  <div class="flex-1 flex flex-col items-center justify-center border-r border-white/10 pr-4">
                    <div class="text-6xl font-bold" style="font-family:'Sawarabi Mincho',serif">${card.kanji}</div>
                  </div>
                  <div class="flex-1 flex flex-col items-center justify-center pl-4 gap-2">
                    ${card.words.map(w => `<div class="text-lg font-medium">${w.vocab}</div>`).join('')}
                  </div>
                </div>
              </div>
              <div class="card-back bg-gradient-to-br from-indigo-900 to-purple-900 border border-indigo-400/30 shadow-2xl p-5 overflow-auto">
                <div class="flex w-full h-full">
                  <div class="flex-1 flex flex-col items-center justify-center border-r border-white/10 pr-4">
                    <div class="text-5xl font-bold mb-3" style="font-family:'Sawarabi Mincho',serif">${card.kanji}</div>
                    <div class="text-xs text-indigo-300 mb-1">${t('onyomi')}: ${card.onyomi}</div>
                    <div class="text-xs text-purple-300">${t('kunyomi')}: ${card.kunyomi}</div>
                  </div>
                  <div class="flex-1 flex flex-col items-center justify-center pl-4 gap-2">
                    ${card.words.map(w => `<div class="text-center">
                      <div class="text-xs text-indigo-300">${w.furigana}</div>
                      <div class="text-base font-medium">${w.vocab}</div>
                      <div class="text-xs text-slate-300">${getMeaning(w)}</div>
                    </div>`).join('')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p class="text-center text-slate-500 text-sm mb-4">${t('tapToFlip')}</p>
        ${isFlipped ? `
        <div class="flex gap-3 mb-4">
          <button onclick="flashcardRemember()" class="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold transition-colors">${t('remember')}</button>
          <button onclick="flashcardForget()" class="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-bold transition-colors">${t('dontRemember')}</button>
        </div>` : ''}
      </div>
    </div>`;
}

function flipCard() { isFlipped = !isFlipped; render(); }

function flashcardRemember() {
  const card = flashcardDeck[flashcardIndex];
  // Card passes
  flashcardIndex++;
  isFlipped = false;
  if (flashcardIndex >= flashcardDeck.length) {
    if (failedCards.length > 0) {
      flashcardDeck = shuffle([...failedCards]);
      failedCards = [];
      flashcardIndex = 0;
      reviewRound++;
    } else {
      // All done - save progress
      finishFlashcards();
      return;
    }
  }
  render();
}

function flashcardForget() {
  const card = flashcardDeck[flashcardIndex];
  cardReviewCounts[card.kanji] = (cardReviewCounts[card.kanji] || 0) + 1;
  failedCards.push(card);
  flashcardIndex++;
  isFlipped = false;
  if (flashcardIndex >= flashcardDeck.length) {
    flashcardDeck = shuffle([...failedCards]);
    failedCards = [];
    flashcardIndex = 0;
    reviewRound++;
  }
  render();
}

async function finishFlashcards() {
  // Save all kanji progress
  const items = getSelectedKanji();
  for (const k of items) {
    const count = cardReviewCounts[k.kanji] || 0;
    let status = 'green';
    if (count >= 1 && count <= 3) status = 'yellow';
    else if (count > 3) status = 'red';
    await saveKanjiProgress(k.kanji, status, count);
  }
  currentPage = 'flashcard-result'; render();
}

function renderFlashcardResult() {
  const items = getSelectedKanji();
  const green = items.filter(k => (cardReviewCounts[k.kanji] || 0) === 0).length;
  const yellow = items.filter(k => { const c = cardReviewCounts[k.kanji]||0; return c>=1&&c<=3; }).length;
  const red = items.filter(k => (cardReviewCounts[k.kanji]||0) > 3).length;
  
  app.innerHTML = `
    <div class="h-full w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-6 overflow-auto flex flex-col items-center justify-center">
      <div class="max-w-md w-full text-center fade-in">
        <div class="text-5xl mb-4">🎉</div>
        <h2 class="text-2xl font-bold mb-6">${t('complete')}</h2>
        <div class="grid grid-cols-3 gap-4 mb-8">
          <div class="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
            <div class="text-2xl font-bold text-emerald-400">${green}</div>
            <div class="text-xs text-slate-300">${t('greenDesc')}</div>
          </div>
          <div class="p-4 rounded-xl bg-amber-500/20 border border-amber-500/30">
            <div class="text-2xl font-bold text-amber-400">${yellow}</div>
            <div class="text-xs text-slate-300">${t('yellowDesc')}</div>
          </div>
          <div class="p-4 rounded-xl bg-red-500/20 border border-red-500/30">
            <div class="text-2xl font-bold text-red-400">${red}</div>
            <div class="text-xs text-slate-300">${t('redDesc')}</div>
          </div>
        </div>
        <button onclick="currentPage='home';render()" class="px-8 py-3 rounded-xl btn-primary text-white font-bold">${t('home')}</button>
      </div>
    </div>`;
}

// === QUIZ ===
function startQuiz() {
  const items = getSelectedKanji();
  quizQuestions = [];
  const allWords = [];
  items.forEach(k => k.words.forEach(w => allWords.push({ ...w, kanji: k.kanji })));
  
  const shuffled = shuffle([...allWords]);
  shuffled.forEach(word => {
    const type = Math.floor(Math.random() * 3); // 0: vocab->meaning, 1: vocab->furigana, 2: meaning->vocab
    let question, correctAnswer, options;
    if (type === 0) {
      question = word.vocab;
      correctAnswer = getMeaning(word);
      options = getRandomOptions(allWords, w => getMeaning(w), correctAnswer);
    } else if (type === 1) {
      question = word.vocab;
      correctAnswer = word.furigana;
      options = getRandomOptions(allWords, w => w.furigana, correctAnswer);
    } else {
      question = getMeaning(word);
      correctAnswer = word.vocab;
      options = getRandomOptions(allWords, w => w.vocab, correctAnswer);
    }
    quizQuestions.push({ question, correctAnswer, options, type });
  });
  
  quizIndex = 0; quizScore = 0; quizAnswered = false;
  currentPage = 'quiz'; render();
}

function getRandomOptions(pool, getter, correct) {
  let opts = [correct];
  const candidates = shuffle(pool.map(getter).filter(v => v !== correct));
  for (let i = 0; opts.length < 4 && i < candidates.length; i++) {
    if (!opts.includes(candidates[i])) opts.push(candidates[i]);
  }
  while (opts.length < 4) opts.push('—');
  return shuffle(opts);
}

function renderQuiz() {
  if (quizIndex >= quizQuestions.length) { currentPage = 'quiz-result'; render(); return; }
  const q = quizQuestions[quizIndex];
  const progress = `${quizIndex + 1} / ${quizQuestions.length}`;
  const typeLabel = q.type === 0 ? '→ '+t('score').replace('คะแนน','ความหมาย').replace('Score','Meaning') : q.type === 1 ? '→ Furigana' : '→ '+t('score').replace('คะแนน','คำศัพท์').replace('Score','Vocab');
  
  app.innerHTML = `
    <div class="h-full w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-4 overflow-auto">
      <div class="max-w-lg mx-auto fade-in">
        ${backBtn('home')}
        <div class="flex justify-between items-center mb-4">
          <span class="text-sm text-slate-400">${progress}</span>
          <span class="text-sm text-slate-400">${t('score')}: ${quizScore}/${quizIndex}</span>
        </div>
        <div class="p-6 rounded-xl bg-white/5 border border-white/10 text-center mb-6">
          <div class="text-3xl font-bold mb-2">${q.question}</div>
        </div>
        <div class="grid grid-cols-1 gap-3" id="quiz-options">
          ${q.options.map((opt, i) => `<button onclick="quizAnswer(${i})" id="opt-${i}" class="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-indigo-500/20 hover:border-indigo-400 transition-all text-left text-lg">${opt}</button>`).join('')}
        </div>
      </div>
    </div>`;
}

function quizAnswer(idx) {
  if (quizAnswered) return;
  const q = quizQuestions[quizIndex];
  const selected = q.options[idx];
  const btn = document.getElementById(`opt-${idx}`);
  
  if (selected === q.correctAnswer) {
    quizAnswered = true;
    quizScore++;
    btn.classList.add('bg-emerald-500/30', 'border-emerald-400');
    setTimeout(() => { quizIndex++; quizAnswered = false; render(); }, 600);
  } else {
    btn.classList.add('bg-red-500/30', 'border-red-400');
    btn.disabled = true;
    // Show correct answer
    const correctIdx = q.options.indexOf(q.correctAnswer);
    document.getElementById(`opt-${correctIdx}`).classList.add('bg-emerald-500/30', 'border-emerald-400');
    quizAnswered = true;
    setTimeout(() => { quizIndex++; quizAnswered = false; render(); }, 1200);
  }
}

function renderQuizResult() {
  const pct = Math.round((quizScore / quizQuestions.length) * 100);
  const msg = pct >= 90 ? t('excellent') : pct >= 70 ? t('good') : t('tryAgain');
  const emoji = pct >= 90 ? '🌟' : pct >= 70 ? '👍' : '📖';
  const key = `${selectedLevel}_${selectedLessons.join('+')}`;
  saveHighScore('quiz', key, pct);
  const hs = Math.max(highScores.quiz[key] || 0, pct);

  app.innerHTML = `
    <div class="h-full w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-6 overflow-auto flex flex-col items-center justify-center">
      <div class="max-w-md w-full text-center fade-in">
        <div class="text-5xl mb-4">${emoji}</div>
        <h2 class="text-2xl font-bold mb-2">${msg}</h2>
        <div class="text-4xl font-bold text-indigo-300 mb-2">${pct}%</div>
        <p class="text-slate-400 mb-2">${quizScore} / ${quizQuestions.length}</p>
        <p class="text-sm text-yellow-400 mb-6">🏆 ${t('highScore')}: ${hs}%</p>
        <div class="flex gap-3 justify-center">
          <button onclick="startQuiz()" class="px-6 py-3 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 font-medium">${t('tryAgain')}</button>
          <button onclick="currentPage='home';render()" class="px-6 py-3 rounded-xl btn-primary text-white font-bold">${t('home')}</button>
        </div>
      </div>
    </div>`;
}

// === MATCHING GAME ===
function startMatch() {
  const items = getSelectedKanji();
  const allWords = [];
  items.forEach(k => k.words.forEach(w => allWords.push({ ...w, kanji: k.kanji })));
  
  // Pick 5 pairs (10 cards)
  const selected = shuffle([...allWords]).slice(0, 5);
  matchPairs = [];
  selected.forEach((w, i) => {
    matchPairs.push({ id: `k${i}`, type: 'kanji', text: w.vocab, pairId: i });
    const matchText = matchMode === 'meaning' ? getMeaning(w) : w.furigana;
    matchPairs.push({ id: `m${i}`, type: 'match', text: matchText, pairId: i });
  });
  matchPairs = shuffle(matchPairs);
  matchSelected = null; matchCorrect = 0; matchAttempts = 0; matchCompleted = 0;
  render();
}

function renderMatchSetup() { renderSelectLesson(); }

function renderMatch() {
  if (matchCompleted >= 5) { currentPage = 'match-result'; render(); return; }
  app.innerHTML = `
    <div class="h-full w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-4 overflow-auto">
      <div class="max-w-lg mx-auto fade-in">
        ${backBtn('home')}
        <div class="flex justify-between items-center mb-4">
          <span class="text-sm text-slate-400">${t('correct')}: ${matchCompleted}/5</span>
          <span class="text-sm text-slate-400">${t('attempts')}: ${matchAttempts}</span>
        </div>
        <div class="grid grid-cols-2 gap-3" id="match-grid">
          ${matchPairs.filter(p => !p.done).map(p => `<button onclick="matchSelect('${p.id}')" id="match-${p.id}" class="match-card p-4 rounded-xl bg-white/5 border border-white/10 text-center min-h-[60px] flex items-center justify-center ${p.type === 'kanji' ? 'text-lg font-bold' : 'text-sm'}">
            ${p.text}
          </button>`).join('')}
        </div>
      </div>
    </div>`;
}

function matchSelect(id) {
  const card = matchPairs.find(p => p.id === id);
  if (!card || card.done) return;
  const el = document.getElementById(`match-${id}`);
  
  if (!matchSelected) {
    matchSelected = card;
    el.classList.add('selected');
  } else {
    if (matchSelected.id === id) { el.classList.remove('selected'); matchSelected = null; return; }
    matchAttempts++;
    if (matchSelected.pairId === card.pairId && matchSelected.type !== card.type) {
      // Correct
      matchCorrect++;
      matchCompleted++;
      el.classList.add('correct');
      document.getElementById(`match-${matchSelected.id}`).classList.add('correct');
      matchSelected.done = true; card.done = true;
      matchSelected = null;
      setTimeout(() => render(), 500);
    } else {
      // Wrong
      el.classList.add('wrong');
      const prevEl = document.getElementById(`match-${matchSelected.id}`);
      prevEl.classList.add('wrong'); prevEl.classList.remove('selected');
      matchSelected = null;
      setTimeout(() => { el.classList.remove('wrong'); prevEl.classList.remove('wrong'); }, 500);
    }
  }
}

function renderMatchResult() {
  const pct = Math.round((matchCorrect / Math.max(matchAttempts, 1)) * 100);
  const msg = pct >= 90 ? t('excellent') : pct >= 70 ? t('good') : t('tryAgain');
  const emoji = pct >= 90 ? '🌟' : pct >= 70 ? '👍' : '📖';
  const key = `${selectedLevel}_${selectedLessons.join('+')}_${matchMode}`;
  saveHighScore('match', key, pct);
  const hs = Math.max(highScores.match[key] || 0, pct);

  app.innerHTML = `
    <div class="h-full w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-6 overflow-auto flex flex-col items-center justify-center">
      <div class="max-w-md w-full text-center fade-in">
        <div class="text-5xl mb-4">${emoji}</div>
        <h2 class="text-2xl font-bold mb-2">${msg}</h2>
        <div class="text-4xl font-bold text-indigo-300 mb-2">${pct}%</div>
        <p class="text-slate-400 mb-2">${matchCorrect} ${t('correct')} / ${matchAttempts} ${t('attempts')}</p>
        <p class="text-sm text-yellow-400 mb-6">🏆 ${t('highScore')}: ${hs}%</p>
        <div class="flex gap-3 justify-center">
          <button onclick="currentPage='match';startMatch()" class="px-6 py-3 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 font-medium">${t('tryAgain')}</button>
          <button onclick="currentPage='home';render()" class="px-6 py-3 rounded-xl btn-primary text-white font-bold">${t('home')}</button>
        </div>
      </div>
    </div>`;
}

// === ALL KANJI ===
function renderAllKanji() {
  let html = `
    <div class="h-full w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-4 overflow-auto">
      <div class="max-w-2xl mx-auto fade-in">
        ${backBtn('home')}
        <h2 class="text-2xl font-bold text-center mb-4">${t('allKanji')}</h2>
        <div class="flex flex-wrap gap-2 justify-center mb-6 text-xs">
          <span class="px-3 py-1 rounded-full status-green">${t('greenDesc')}</span>
          <span class="px-3 py-1 rounded-full status-yellow">${t('yellowDesc')}</span>
          <span class="px-3 py-1 rounded-full status-red">${t('redDesc')}</span>
          <span class="px-3 py-1 rounded-full status-gray">${t('grayDesc')}</span>
        </div>`;
  
  Object.keys(kanjiData).forEach(level => {
    html += `<h3 class="text-lg font-bold text-indigo-300 mt-4 mb-2">${level}</h3>`;
    Object.keys(kanjiData[level]).forEach(lesson => {
      html += `<div class="mb-3"><p class="text-sm text-slate-400 mb-1">${lesson}</p><div class="flex flex-wrap gap-2">`;
      kanjiData[level][lesson].forEach(k => {
        const prog = kanjiProgress[k.kanji];
        const status = prog ? prog.status : 'gray';
        html += `<span class="w-10 h-10 rounded-lg status-${status} flex items-center justify-center text-lg font-bold cursor-default" title="${k.kanji}">${k.kanji}</span>`;
      });
      html += `</div></div>`;
    });
  });
  
  html += `</div></div>`;
  app.innerHTML = html;
}

// === HELPERS ===
function backBtn(page) {
  return `<button onclick="currentPage='${page}';render()" class="flex items-center gap-1 text-slate-400 hover:text-white mb-4 text-sm"><i data-lucide="arrow-left" style="width:16px;height:16px"></i> ${t('back')}</button>`;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// === INIT ===
const defaultConfig = { app_title: 'Kanji Tutor', background_color: '#0f172a', surface_color: '#1e293b', text_color: '#f1f5f9', primary_color: '#6366f1', secondary_color: '#8b5cf6' };

window.elementSdk.init({
  defaultConfig,
  onConfigChange: async (config) => {
    document.body.style.color = config.text_color || defaultConfig.text_color;
  },
  mapToCapabilities: (config) => ({
    recolorables: [
      { get: () => config.background_color || defaultConfig.background_color, set: (v) => { config.background_color = v; window.elementSdk.setConfig({ background_color: v }); } },
      { get: () => config.surface_color || defaultConfig.surface_color, set: (v) => { config.surface_color = v; window.elementSdk.setConfig({ surface_color: v }); } },
      { get: () => config.text_color || defaultConfig.text_color, set: (v) => { config.text_color = v; window.elementSdk.setConfig({ text_color: v }); } },
      { get: () => config.primary_color || defaultConfig.primary_color, set: (v) => { config.primary_color = v; window.elementSdk.setConfig({ primary_color: v }); } },
      { get: () => config.secondary_color || defaultConfig.secondary_color, set: (v) => { config.secondary_color = v; window.elementSdk.setConfig({ secondary_color: v }); } },
    ],
    borderables: [],
    fontEditable: undefined,
    fontSizeable: undefined
  }),
  mapToEditPanelValues: (config) => new Map([["app_title", config.app_title || defaultConfig.app_title]])
});

// --- GitHub Pages stubs for Anthropic sandbox SDKs ---
// The original app ran inside an Anthropic Artifacts sandbox that provided
// window.elementSdk and window.dataSdk. On GitHub Pages those scripts don't exist,
// so we install no-op equivalents. Progress and high-scores are persisted to
// localStorage so the user's review history still survives reloads.
if (!window.elementSdk) {
  window.elementSdk = {
    init: function () {},
    setConfig: function () {},
  };
}
if (!window.dataSdk) {
  const LS_KEY = 'kanji_tutor_data_v1';
  const load = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch (e) { return []; }
  };
  const save = (rows) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(rows)); } catch (e) {}
  };
  let _rows = load();
  let _nextId = (_rows.reduce((m, r) => Math.max(m, r.__id || 0), 0)) + 1;
  let _handler = null;

  const notify = () => { if (_handler && _handler.onDataChanged) _handler.onDataChanged(_rows.slice()); };

  window.dataSdk = {
    init: async (handler) => {
      _handler = handler;
      notify();
      return { isOk: true };
    },
    create: async (row) => {
      const r = Object.assign({ __id: _nextId++ }, row);
      _rows.push(r);
      save(_rows);
      notify();
      return { isOk: true };
    },
    update: async (row) => {
      const i = _rows.findIndex(r => r.__id === row.__id);
      if (i >= 0) {
        _rows[i] = Object.assign({}, _rows[i], row);
        save(_rows);
        notify();
      }
      return { isOk: true };
    },
    delete: async (row) => {
      _rows = _rows.filter(r => r.__id !== row.__id);
      save(_rows);
      notify();
      return { isOk: true };
    },
  };
}

(async () => {
  try {
    kanjiData = await loadKanjiDataFromTSV('kanji_data.tsv');
  } catch (e) {
    console.error('Failed to load kanji_data.tsv:', e);
    app.innerHTML = '<div style="padding:2rem;color:#fca5a5;font-family:sans-serif">' +
      '<h2>Failed to load kanji_data.tsv</h2>' +
      '<p>Make sure <code>kanji_data.tsv</code> is in the same directory as <code>index.html</code> ' +
      'and that you are viewing this page over http(s) (not file://).</p>' +
      '<pre style="white-space:pre-wrap">' + (e && e.message ? e.message : e) + '</pre></div>';
    return;
  }
  const result = await window.dataSdk.init(dataHandler);
  if (!result.isOk) console.error("Data SDK init failed");
  render();
})();
