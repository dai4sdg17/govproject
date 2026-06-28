// 딱맞는지원 — 앱 로직
// 데이터 흐름: localStorage → state → filter()+score() → render()
// 저장소: user_conditions / favorites / last_updated

'use strict';

// ── 상태 ──────────────────────────────────────────────
var state = {
  conditions: null,      // {region, years, categories[], features}
  favorites: [],         // 공고 id 배열
  programs: [],          // 마감일 계산이 끝난 공고 목록
  matched: [],           // 필터·스코어링 결과
  selectedId: null,
  prevChecked: null,     // 직전 접속(확인)일 'YYYY-MM-DD' — 신규 판별 기준
  showNewOnly: false     // '새 공고만 보기' 토글
};

var KEY = { cond: 'user_conditions', fav: 'favorites', upd: 'last_updated', checked: 'last_checked' };

// 오늘 날짜 'YYYY-MM-DD'
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
// 마지막 확인 이후 등록된 공고인가? (처음 방문이면 현재 열린 공고를 모두 '신규'로 간주)
function isNewProgram(p) {
  if (state.prevChecked === null) return true;
  if (!p.posted_at) return false;
  return p.posted_at > state.prevChecked;
}

// ── localStorage 입출력 ───────────────────────────────
function load(key, fallback) {
  try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

// ── 공고 데이터 준비: 실제 마감일(period_end)로 D-day 계산 ──
// period_end 가 null 이면 '추후 공지'로 보고 D-day 없음(deadline=null).
function preparePrograms() {
  var today = new Date(); today.setHours(0, 0, 0, 0);
  return PROGRAMS.map(function (p) {
    var deadline = null, dday = null;
    if (p.period_end) {
      var parts = p.period_end.split('-');  // "YYYY-MM-DD" → 로컬 시간 자정
      deadline = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      dday = Math.round((deadline - today) / 86400000);  // 남은 일수
    }
    return Object.assign({}, p, { deadline: deadline, dday: dday });
  });
}

// ── 매칭: 자격 필터 + 적합도 점수 ─────────────────────
function matchPrograms() {
  var c = state.conditions;
  if (!c) return [];

  var featureText = (c.features || '').toLowerCase();

  var scored = state.programs.map(function (p) {
    var reasons = [];   // 충족 근거
    var misses = [];    // 미충족/확인 항목
    var eligible = true;

    // (A) 자격 필터 — Hard
    // 지역: 공고가 전국이거나 내 지역과 일치
    if (p.region === '전국' || p.region === c.region) {
      reasons.push({ ok: true, text: '지역 ' + c.region + ' — ' + (p.region === '전국' ? '전국 대상' : p.region + ' 대상') });
    } else {
      eligible = false;
      misses.push({ ok: false, text: '지역 제한: ' + p.region + ' (내 지역 ' + c.region + ')' });
    }
    // 업력: minYears ≤ 내 년차 ≤ maxYears
    if (c.years >= p.minYears && c.years <= p.maxYears) {
      reasons.push({ ok: true, text: '업력 ' + c.years + '년 — 요건(' + p.minYears + '~' + (p.maxYears >= 99 ? '제한없음' : p.maxYears + '년') + ') 충족' });
    } else {
      eligible = false;
      misses.push({ ok: false, text: '업력 요건: ' + p.minYears + '~' + (p.maxYears >= 99 ? '제한없음' : p.maxYears + '년') + ' (내 업력 ' + c.years + '년)' });
    }
    // 마감 미경과 (dday=null 은 '추후 공지'이므로 통과)
    if (p.dday !== null && p.dday < 0) {
      eligible = false; misses.push({ ok: false, text: '접수 마감됨 (' + p.period_end + ')' });
    }

    // (B) 적합도 점수 — Soft (0~100)
    var score = 0;
    // 분야 일치 (최대 40)
    if (c.categories.indexOf(p.category) !== -1) {
      score += 40; reasons.push({ ok: true, text: '분야 ' + p.category + ' — 선택 분야와 일치' });
    } else {
      misses.push({ ok: false, text: '분야 ' + p.category + ' — 선택 분야 외' });
    }
    // 회사 특징 키워드 매칭 (키워드당 12, 최대 48)
    var hits = [];
    if (featureText) {
      p.keywords.forEach(function (kw) {
        if (featureText.indexOf(kw.toLowerCase()) !== -1) hits.push(kw);
      });
    }
    score += Math.min(hits.length * 12, 48);
    if (hits.length) reasons.push({ ok: true, text: '특징 키워드 일치: ' + hits.join(', ') });
    // 마감 여유 가점 (최대 12) — 추후 공지는 중간값
    score += (p.dday === null) ? 6 : Math.min(Math.max(p.dday, 0), 12);

    if (score > 100) score = 100;

    return { program: p, eligible: eligible, fit: Math.round(score), reasons: reasons, misses: misses, hits: hits };
  });

  // 자격 통과만, 적합도 내림차순 → 동점은 마감 임박 우선
  return scored
    .filter(function (s) { return s.eligible; })
    .sort(function (a, b) { return b.fit - a.fit || a.program.dday - b.program.dday; });
}

// ── D-day 배지 ────────────────────────────────────────
function ddayBadge(p) {
  if (p.dday === null) return '<span class="badge dday far">마감일 추후공지</span>';
  var cls = p.dday <= 7 ? 'badge dday' : 'badge dday far';
  var txt = p.dday === 0 ? '오늘 마감' : 'D-' + p.dday;
  return '<span class="' + cls + '">' + txt + '</span>';
}
function fmtDate(d) {
  var m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
  return (d.getFullYear()) + '-' + m + '-' + day;
}

// ── 렌더링 ────────────────────────────────────────────
function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) {
  return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }

function cardHTML(s, opts) {
  var p = s.program, faved = state.favorites.indexOf(p.id) !== -1;
  var fit = opts && opts.showFit !== false
    ? '<span class="badge fit">적합도 ' + s.fit + '</span>' : '';
  var ver = p.verified ? '<span class="badge ver">✓ 실제공고</span>' : '';
  var isNew = (opts && opts.markNew) && isNewProgram(p);
  var newBadge = isNew ? '<span class="badge new">✦ NEW</span>' : '';
  return '' +
    '<article class="card' + (isNew ? ' is-new' : '') + '" tabindex="0" data-id="' + p.id + '">' +
      '<div class="card-top">' +
        '<div><p class="card-name">' + newBadge + esc(p.title) + '</p>' +
        '<p class="card-org">' + esc(p.source) + '</p></div>' +
        '<button class="heart' + (faved ? ' on' : '') + '" data-fav="' + p.id + '" ' +
          'aria-label="관심 저장">' + (faved ? '♥' : '♡') + '</button>' +
      '</div>' +
      '<div class="badges">' + fit + ver +
        '<span class="badge cat">' + esc(p.category) + '</span>' +
        '<span class="badge amt">' + esc(p.amount) + '</span>' +
        ddayBadge(p) +
      '</div>' +
    '</article>';
}

function renderNewBanner() {
  var banner = document.getElementById('newBanner');
  var text = document.getElementById('newBannerText');
  var toggle = document.getElementById('newToggle');
  var newCount = state.matched.filter(function (s) { return isNewProgram(s.program); }).length;

  if (state.prevChecked === null) {
    // 처음 방문
    banner.hidden = false;
    text.innerHTML = '👋 처음 방문이에요 — 현재 열린 공고를 모두 보여드립니다.';
    toggle.hidden = true;
    return;
  }
  banner.hidden = false;
  toggle.hidden = false;
  if (newCount > 0) {
    text.innerHTML = '🔔 마지막 확인(<b>' + esc(state.prevChecked) + '</b>) 이후 새 공고 <b>' + newCount + '</b>건';
    toggle.textContent = state.showNewOnly ? '전체 보기' : '새 공고만';
  } else {
    text.innerHTML = '마지막 확인(<b>' + esc(state.prevChecked) + '</b>) 이후 새 공고는 없어요.';
    toggle.hidden = true;
    state.showNewOnly = false;
  }
}

function renderResults() {
  var list = document.getElementById('resultList');
  var empty = document.getElementById('resultEmpty');
  document.getElementById('resultCount').textContent = state.matched.length;
  renderNewBanner();

  var items = state.showNewOnly
    ? state.matched.filter(function (s) { return isNewProgram(s.program); })
    : state.matched;

  if (!items.length) {
    list.innerHTML = ''; empty.hidden = false; return;
  }
  empty.hidden = true;
  list.innerHTML = items.map(function (s) { return cardHTML(s, { markNew: true }); }).join('');
}

function renderFavorites() {
  var list = document.getElementById('favoriteList');
  var empty = document.getElementById('favoriteEmpty');
  var items = state.programs
    .filter(function (p) { return state.favorites.indexOf(p.id) !== -1; })
    .sort(function (a, b) {  // 마감 임박 순 (추후공지는 맨 뒤)
      var da = a.dday === null ? Infinity : a.dday;
      var db = b.dday === null ? Infinity : b.dday;
      return da - db;
    })
    .map(function (p) { return { program: p, fit: 0 }; });

  if (!items.length) { list.innerHTML = ''; empty.hidden = false; return; }
  empty.hidden = true;
  list.innerHTML = items.map(function (s) { return cardHTML(s, { showFit: false }); }).join('');
}

function renderDetail() {
  var s = state.matched.filter(function (m) { return m.program.id === state.selectedId; })[0];
  // 결과 목록에 없을 수도(관심 목록에서 진입) → programs에서 임시 구성
  if (!s) {
    var p0 = state.programs.filter(function (p) { return p.id === state.selectedId; })[0];
    if (!p0) return;
    s = { program: p0, fit: null, reasons: [], misses: [], hits: [] };
  }
  var p = s.program, faved = state.favorites.indexOf(p.id) !== -1;

  var fitBlock = s.fit !== null
    ? '<div class="fit-explain">이 공고 적합도 <b>' + s.fit + '점</b>' +
      (s.hits.length ? ' · 키워드 ' + esc(s.hits.join(', ')) : '') + '</div>' : '';

  var checks = s.reasons.concat(s.misses);
  var reqHTML = checks.length
    ? checks.map(function (r) {
        return '<div class="req ' + (r.ok ? 'ok' : 'no') + '">' +
          '<span class="mk">' + (r.ok ? '✓' : '✗') + '</span><span>' + esc(r.text) + '</span></div>';
      }).join('')
    : '<div class="req"><span>조건을 입력하면 충족 여부를 점검해 드려요.</span></div>';

  var deadlineBadge = p.deadline
    ? '<span class="badge cat">마감 ' + fmtDate(p.deadline) + '</span>'
    : '<span class="badge cat">마감일 추후공지</span>';
  var verBlock = p.verified
    ? '<p class="ver-note">✓ 기업마당·K-Startup 등 실제 공고 기준 (확인일 ' + esc(p.checked_at) + ')</p>' : '';

  document.getElementById('detailBody').innerHTML = '' +
    '<h1 class="detail-title">' + esc(p.title) + '</h1>' +
    '<p class="detail-org">' + esc(p.source) + ' · ' + esc(p.category) + '</p>' +
    '<div class="badges">' +
      '<span class="badge amt">지원금 ' + esc(p.amount) + '</span>' +
      ddayBadge(p) +
      deadlineBadge +
    '</div>' +
    verBlock +
    fitBlock +
    '<p class="section-label">자격요건 점검</p>' +
    '<div class="reqs">' + reqHTML + '</div>' +
    '<div class="detail-actions">' +
      '<a class="btn btn-ghost" href="' + esc(p.source_url) + '" target="_blank" rel="noopener">원문 공고 보기 ↗</a>' +
      '<button class="btn btn-primary" data-fav="' + p.id + '">' +
        (faved ? '♥ 관심 사업에서 제거' : '♡ 관심 사업으로 저장') + '</button>' +
    '</div>';
}

// ── 화면 전환 ─────────────────────────────────────────
var VIEWS = ['input', 'results', 'detail', 'favorites'];
function show(view) {
  VIEWS.forEach(function (v) {
    document.getElementById('view-' + v).hidden = (v !== view);
  });
  // 탭 활성화 (상세는 결과 탭으로 표시)
  var tabView = (view === 'detail') ? 'results' : view;
  document.querySelectorAll('.tab').forEach(function (t) {
    t.classList.toggle('active', t.dataset.view === tabView);
  });
  if (view === 'results') renderResults();
  if (view === 'favorites') renderFavorites();
  if (view === 'detail') renderDetail();
  window.scrollTo(0, 0);
}

// ── 갱신: 앱 열 때 / 조건 변경 시 ─────────────────────
function refresh() {
  state.programs = preparePrograms();
  state.matched = matchPrograms();
  var now = new Date();
  var stamp = ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2) +
    ' ' + ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
  save(KEY.upd, stamp);
  document.getElementById('updatedLabel').textContent = '갱신 ' + stamp;
}

// ── 관심 토글 ─────────────────────────────────────────
function toggleFav(id) {
  var i = state.favorites.indexOf(id);
  if (i === -1) state.favorites.push(id); else state.favorites.splice(i, 1);
  save(KEY.fav, state.favorites);
  // 현재 보이는 화면 다시 그리기
  if (!document.getElementById('view-results').hidden) renderResults();
  if (!document.getElementById('view-favorites').hidden) renderFavorites();
  if (!document.getElementById('view-detail').hidden) renderDetail();
}

// ── 폼 → 조건 저장 ────────────────────────────────────
function readForm() {
  var cats = [];
  document.querySelectorAll('#categoryChips input:checked').forEach(function (cb) { cats.push(cb.value); });
  return {
    region: document.getElementById('region').value,
    years: parseInt(document.getElementById('years').value, 10) || 0,
    categories: cats,
    features: document.getElementById('features').value.trim()
  };
}
function fillForm(c) {
  document.getElementById('region').value = c.region;
  document.getElementById('years').value = c.years;
  document.getElementById('features').value = c.features || '';
  document.querySelectorAll('#categoryChips input').forEach(function (cb) {
    cb.checked = c.categories.indexOf(cb.value) !== -1;
  });
}

// ── 초기화 ────────────────────────────────────────────
function init() {
  state.favorites = load(KEY.fav, []);
  state.conditions = load(KEY.cond, null);

  // 신규 판별: 직전 확인일을 먼저 읽고, 이번 접속일로 갱신
  state.prevChecked = load(KEY.checked, null);
  save(KEY.checked, todayStr());

  refresh();  // 앱 열 때 갱신

  // 저장된 조건 복원
  if (state.conditions) { fillForm(state.conditions); }

  // 폼 제출
  document.getElementById('conditionForm').addEventListener('submit', function (e) {
    e.preventDefault();
    state.conditions = readForm();
    save(KEY.cond, state.conditions);
    refresh();
    show('results');
  });

  // 탭 이동
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      if (t.dataset.view === 'results' && !state.conditions) { show('input'); return; }
      show(t.dataset.view);
    });
  });

  // 카드 클릭(상세) + 관심 토글 — 이벤트 위임
  document.querySelector('.app').addEventListener('click', function (e) {
    var favBtn = e.target.closest('[data-fav]');
    if (favBtn) { e.stopPropagation(); toggleFav(favBtn.getAttribute('data-fav')); return; }
    var card = e.target.closest('.card[data-id]');
    if (card) { state.selectedId = card.getAttribute('data-id'); show('detail'); }
  });
  // 카드 키보드 접근(Enter)
  document.querySelector('.app').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var card = e.target.closest('.card[data-id]');
    if (card) { state.selectedId = card.getAttribute('data-id'); show('detail'); }
  });

  document.getElementById('backBtn').addEventListener('click', function () { show('results'); });
  document.getElementById('relaxBtn').addEventListener('click', function () { show('input'); });

  // '새 공고만 보기' 토글
  document.getElementById('newToggle').addEventListener('click', function () {
    state.showNewOnly = !state.showNewOnly;
    renderResults();
  });

  // 시작 화면: 조건이 있으면 결과, 없으면 입력
  show(state.conditions ? 'results' : 'input');
}

document.addEventListener('DOMContentLoaded', init);
