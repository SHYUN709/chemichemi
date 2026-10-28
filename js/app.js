// 화면 연결: 입력 화면(index.html)과 결과 리포트(result.html), AI 버튼, localStorage 캐시.

import { ELEMENTS, STEMS, dayStem, lunarToSolar, sajuRelation } from './saju.js';
import { MBTI_TYPES, mbtiScore } from './mbti.js';
import {
  STEM_TRAITS, RELATION_HEADLINES, LETTER_TEXTS, MBTI_SPECIAL,
  sajuText, yinYangText, mbtiHeadline, fillNames,
} from './texts.js';
import { encodeShare, decodeShare, shareUrl, copyText, saveImage, NAME_MAX } from './share.js';

const $ = (sel, root = document) => root.querySelector(sel);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// localStorage는 사생활 보호 모드 등에서 막힐 수 있다.
const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 무시 */ }
  },
};

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ================= 입력 화면 ================= */

const PEOPLE = [
  { key: 'a', tag: '첫 번째 사람', placeholder: '나', color: 'var(--seal)' },
  { key: 'b', tag: '두 번째 사람', placeholder: '상대', color: 'var(--water)' },
];

function initInput() {
  const tpl = $('#person-tpl');
  const wrap = $('#pair-cards');
  const thisYear = new Date().getFullYear();

  const cards = PEOPLE.map((p) => {
    const card = tpl.content.firstElementChild.cloneNode(true);
    card.dataset.person = p.key;
    card.style.setProperty('--person-color', p.color);
    $('.person-tag', card).textContent = p.tag;
    $('[name="name"]', card).placeholder = p.placeholder;
    $('[name="name"]', card).maxLength = NAME_MAX;
    $('[name="year"]', card).max = thisYear;
    card.querySelectorAll('[name="cal"]').forEach((r) => { r.name = `cal-${p.key}`; });

    const month = $('[name="month"]', card);
    month.innerHTML = '<option value="">월</option>'
      + Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}월</option>`).join('');

    const mbti = $('[name="mbti"]', card);
    // 고르지 않으면 "모름"으로 계산한다
    mbti.innerHTML = '<option value="">모름</option>'
      + MBTI_TYPES.map((t) => `<option>${t}</option>`).join('');

    const refreshDays = () => {
      const isLunar = card.querySelector(`[name="cal-${p.key}"]:checked`).value === 'lunar';
      $('.check', card).hidden = !isLunar;
      const y = Number($('[name="year"]', card).value) || 2000;
      const m = Number(month.value) || 1;
      // 음력은 한 달이 최대 30일
      const count = isLunar ? 30 : new Date(Date.UTC(y, m, 0)).getUTCDate();
      const day = $('[name="day"]', card);
      const prev = day.value;
      day.innerHTML = '<option value="">일</option>'
        + Array.from({ length: count }, (_, i) => `<option value="${i + 1}">${i + 1}일</option>`).join('');
      if (Number(prev) <= count) day.value = prev;
    };
    card.addEventListener('change', refreshDays);
    $('[name="year"]', card).addEventListener('input', refreshDays);
    refreshDays();

    card.addEventListener('input', (e) => e.target.classList.remove('invalid'));
    wrap.append(card);
    return card;
  });

  $('#chemi-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = $('#form-error');
    const btn = $('#submit-btn');
    errorEl.hidden = true;
    btn.disabled = true;
    btn.textContent = '기운을 모으는 중…';
    try {
      const [a, b] = await Promise.all(cards.map((card, i) => readPerson(card, PEOPLE[i], thisYear)));
      const d = encodeShare(a, b);
      try { sessionStorage.setItem('chemi:own', d); } catch { /* 무시 */ }
      location.href = `r?d=${d}`;
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      btn.disabled = false;
      btn.textContent = '케미 확인하기';
    }
  });
}

async function readPerson(card, person, thisYear) {
  const field = (name) => $(`[name="${name}"]`, card);
  const fail = (el, message) => {
    el.classList.add('invalid');
    el.focus();
    throw new Error(`${person.tag}: ${message}`);
  };

  const name = field('name').value.trim().slice(0, NAME_MAX) || person.placeholder;
  const year = Number(field('year').value);
  const month = Number(field('month').value);
  const day = Number(field('day').value);
  const isLunar = card.querySelector(`[name="cal-${person.key}"]:checked`).value === 'lunar';
  const isLeap = isLunar && field('leap').checked;
  const mbti = field('mbti').value;

  if (!Number.isInteger(year) || year < 1920 || year > thisYear) fail(field('year'), `태어난 해를 1920~${thisYear} 사이로 넣어 주세요.`);
  if (!month) fail(field('month'), '태어난 달을 골라 주세요.');
  if (!day) fail(field('day'), '태어난 날을 골라 주세요.');

  let solar = { year, month, day };
  if (isLunar) {
    try {
      solar = await lunarToSolar(year, month, day, isLeap);
    } catch {
      throw new Error('음력 변환 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
    if (!solar) {
      fail(field('day'), isLeap
        ? `${year}년에는 윤${month}월 ${day}일이 없어요.`
        : `음력 ${year}년 ${month}월 ${day}일은 없는 날짜예요.`);
    }
  }

  return { name, stem: dayStem(solar.year, solar.month, solar.day), mbti: mbti || null };
}

/* ================= 그림: 게이지 · 오행 원 ================= */

function gaugeSvg(score, color, label) {
  // pathLength는 브라우저마다 대시 계산이 달라서 실제 호 길이(π·r)로 계산한다.
  const len = Math.PI * 80;
  const offset = (len * (100 - Math.max(0, Math.min(100, score)))) / 100;
  return `
    <figure class="gauge">
      <svg viewBox="0 0 200 116" role="img" aria-label="${esc(label)} ${score}점">
        <path class="gauge-track" d="M20 104 A80 80 0 0 1 180 104"
          fill="none" stroke-width="14" stroke-linecap="round"/>
        <path class="gauge-value" d="M20 104 A80 80 0 0 1 180 104"
          fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${len} ${len}" stroke-dashoffset="${len}" data-offset="${offset}"/>
        <text class="gauge-score" x="100" y="98" text-anchor="middle" font-size="44">${score}<tspan class="gauge-unit" font-size="16" dx="3">점</tspan></text>
      </svg>
      <figcaption>${esc(label)}</figcaption>
    </figure>`;
}

function animateGauges(root, instant = false) {
  root.querySelectorAll('.gauge-value').forEach((path) => {
    if (instant) {
      path.style.transition = 'none';
      path.setAttribute('stroke-dashoffset', path.dataset.offset);
    } else {
      path.getBoundingClientRect(); // 시작 위치를 먼저 그리게 해서 transition이 걸리게 한다
      path.setAttribute('stroke-dashoffset', path.dataset.offset);
    }
  });
}

/** 오행 원 그림: 다섯 오행을 오각형으로 두고, 두 사람 사이의 상생·상극 화살표를 강조 */
function ohaengSvg(state) {
  const { a, b, rel } = state;
  const cx = 150, cy = 146, R = 98, r = 27;
  const pos = ELEMENTS.map((_, i) => {
    const t = ((-90 + 72 * i) * Math.PI) / 180;
    return { x: cx + R * Math.cos(t), y: cy + R * Math.sin(t), t };
  });
  const elA = STEMS[a.stem].element;
  const elB = STEMS[b.stem].element;
  const active = new Set([elA, elB]);

  const segment = (i, j, padStart, padEnd) => {
    const p = pos[i], q = pos[j];
    const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    return {
      x1: p.x + ux * padStart, y1: p.y + uy * padStart,
      x2: q.x - ux * padEnd, y2: q.y - uy * padEnd,
    };
  };
  const line = (s, attrs) => `<line x1="${s.x1.toFixed(1)}" y1="${s.y1.toFixed(1)}" x2="${s.x2.toFixed(1)}" y2="${s.y2.toFixed(1)}" ${attrs}/>`;

  let bg = '';
  for (let i = 0; i < 5; i++) {
    bg += line(segment(i, (i + 1) % 5, r + 4, r + 6), 'stroke="#D9D1C3" stroke-width="1.5" marker-end="url(#ah-soft)"');
    bg += line(segment(i, (i + 2) % 5, r + 4, r + 6), 'stroke="#E6DFD3" stroke-width="1.2" stroke-dasharray="3 4"');
  }

  let hi = '';
  if (rel.type === 'saeng' || rel.type === 'geuk') {
    const [g, t] = rel.from === 'a' ? [elA, elB] : [elB, elA];
    const dash = rel.type === 'geuk' ? 'stroke-dasharray="7 5"' : '';
    hi = line(segment(g, t, r + 4, r + 9), `stroke="#2A2925" stroke-width="3.2" stroke-linecap="round" ${dash} marker-end="url(#ah)"`);
  } else if (rel.type === 'hap') {
    const s = segment(elA, elB, r + 4, r + 4);
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    hi = line(s, 'stroke="#B8463C" stroke-width="3.2" stroke-linecap="round"')
      + `<rect x="${mx - 15}" y="${my - 15}" width="30" height="30" rx="6" fill="#B8463C" transform="rotate(-4 ${mx} ${my})"/>`
      + `<text x="${mx}" y="${my + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="#FBF4EA" font-family="Gowun Batang, serif">合</text>`;
  }

  const circles = ELEMENTS.map((el, i) => {
    const p = pos[i];
    const on = active.has(i);
    const isMetal = el.key === 'metal';
    const ring = on && rel.type === 'bihwa'
      ? `<circle cx="${p.x}" cy="${p.y}" r="${r + 6}" fill="none" stroke="${isMetal ? '#B8B0A2' : el.color}" stroke-width="1.5"/>` : '';
    return `<g opacity="${on ? 1 : 0.38}">
      ${ring}
      <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${el.color}" ${isMetal ? 'stroke="#B8B0A2" stroke-width="1.5"' : ''}/>
      <text x="${p.x}" y="${p.y + 7}" text-anchor="middle" font-size="21" font-weight="700"
        fill="${isMetal ? '#2A2925' : '#FFFFFF'}" font-family="Gowun Batang, serif">${el.hanja}</text>
    </g>`;
  }).join('');

  // 이름표: 오행 원 바깥쪽
  const names = {};
  [[elA, a.name], [elB, b.name]].forEach(([el, name]) => { (names[el] ??= []).push(name); });
  const tags = Object.entries(names).map(([el, list]) => {
    const p = pos[el];
    const lx = cx + (R + r + 22) * Math.cos(p.t);
    const ly = cy + (R + r + 22) * Math.sin(p.t) + 5;
    const anchor = Math.abs(Math.cos(p.t)) < 0.3 ? 'middle' : Math.cos(p.t) > 0 ? 'start' : 'end';
    const label = [...new Set(list)].join(' · ');
    return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="14" font-weight="700" fill="#2A2925" font-family="Pretendard Variable, Pretendard, sans-serif">${esc(label)}</text>`;
  }).join('');

  return `<svg viewBox="-40 0 380 290" role="img" aria-label="두 사람의 오행 관계: ${esc(rel.label)}">
    <defs>
      <marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="#2A2925"/></marker>
      <marker id="ah-soft" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="#D9D1C3"/></marker>
    </defs>
    ${bg}${hi}${circles}${tags}
  </svg>`;
}

/* ================= 결과 리포트 ================= */

function buildState(a, b) {
  const rel = sajuRelation(a.stem, b.stem);
  const mbti = mbtiScore(a.mbti, b.mbti);
  return { a, b, rel, mbti };
}

function initResult() {
  const d = new URLSearchParams(location.search).get('d');
  const data = d && decodeShare(d);
  if (!data) {
    $('#invalid').hidden = false;
    return;
  }
  const state = buildState(data.a, data.b);
  const { a, b, rel, mbti } = state;
  const sa = STEMS[a.stem], sb = STEMS[b.stem];
  const fill = (text) => fillNames(text, a.name, b.name);

  document.title = `${a.name} & ${b.name}의 궁합 · 케미케미`;
  $('#name-a').textContent = a.name;
  $('#name-b').textContent = b.name;

  $('#people').innerHTML = [[a, sa], [b, sb]].map(([p, s]) => {
    const el = ELEMENTS[s.element];
    return `<div class="chip">
      <span class="chip-stem" data-el="${el.key}">${s.hanja}</span>
      <div class="chip-body">
        <div class="chip-name">${esc(p.name)}</div>
        <div class="chip-meta">${s.name}${el.name}(${s.yang ? '양' : '음'}) · ${p.mbti ?? 'MBTI 모름'}</div>
        <div class="chip-trait">${STEM_TRAITS[s.hanja]}</div>
      </div>
    </div>`;
  }).join('');

  const gauges = gaugeSvg(rel.score, '#B8463C', '타고난 기운')
    + (mbti ? gaugeSvg(mbti.score, '#3E7C6F', '대화·생활 스타일') : '');
  $('#gauges').innerHTML = gauges;
  $('#gauges').classList.toggle('single', !mbti);

  // 타고난 기운
  $('#saju-headline').textContent = RELATION_HEADLINES[rel.type];
  $('#ohaeng').innerHTML = ohaengSvg(state);
  $('#saju-text').textContent = fill(sajuText(rel, sa, sb));
  $('#yinyang-text').textContent = yinYangText(rel);

  // 대화·생활 스타일 ("모름"이 있으면 숨김)
  if (mbti) {
    $('#mbti-headline').textContent = mbtiHeadline(mbti.score);
    if (mbti.special) {
      $('#mbti-special').textContent = MBTI_SPECIAL[mbti.special];
      $('#mbti-special').hidden = false;
    }
    $('#letters').innerHTML = Object.entries(LETTER_TEXTS).map(([key, t], i) => {
      const rel2 = mbti.letters[key];
      return `<li class="letter">
        <div class="letter-pair">
          <span class="letter-chars">${a.mbti[i]} · ${b.mbti[i]}</span>
          <span class="badge ${rel2}">${rel2 === 'same' ? '같음' : '다름'}</span>
        </div>
        <div>
          <div class="letter-label">${t.label}</div>
          <p class="letter-text">${t[rel2]}</p>
        </div>
      </li>`;
    }).join('');
  } else {
    $('#mbti-card').hidden = true;
  }

  // 공유 링크로 들어온 사람에게는 "나도 궁합 보기"
  let own = false;
  try { own = sessionStorage.getItem('chemi:own') === d; } catch { /* 무시 */ }
  $('#try-own').hidden = own;
  $('#again').hidden = !own;

  fillStory(state);
  initShare(state, d);
  initAi(state);

  $('#report').hidden = false;
  animateGauges($('#gauges'), matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function fillStory(state) {
  const { a, b, rel, mbti } = state;
  const names = $('#story-names');
  names.innerHTML = `<span>${esc(a.name)}</span><span class="amp">&amp;</span><span>${esc(b.name)}</span>`;
  // 닉네임이 길면 글자를 줄인다 (최대 10자 + 10자)
  const longest = Math.max(a.name.length, b.name.length);
  names.style.fontSize = longest > 6 ? '64px' : longest > 4 ? '76px' : '';
  $('#story-mbti').textContent = a.mbti && b.mbti ? `${a.mbti} × ${b.mbti}` : '';
  $('#story-gauges').innerHTML = gaugeSvg(rel.score, '#B8463C', '타고난 기운')
    + (mbti ? gaugeSvg(mbti.score, '#3E7C6F', '대화·생활 스타일') : '');
  animateGauges($('#story-gauges'), true);
  $('#story-headline').textContent = RELATION_HEADLINES[rel.type];
  $('#story-ohaeng').innerHTML = ohaengSvg(state);
  $('#story-url').textContent = location.host;
}

function initShare(state, d) {
  $('#copy-link').addEventListener('click', async () => {
    const ok = await copyText(shareUrl(d));
    toast(ok ? '링크를 복사했어요' : '복사하지 못했어요. 주소창의 링크를 써 주세요');
  });

  const btn = $('#save-img');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '만드는 중…';
    try {
      const result = await saveImage($('#story'), `chemichemi-${state.a.name}-${state.b.name}.png`);
      if (result === 'downloaded') toast('이미지를 저장했어요');
    } catch (err) {
      console.error(err);
      toast('이미지를 만들지 못했어요');
    } finally {
      btn.disabled = false;
      btn.textContent = '이미지로 저장';
    }
  });
}

/* ================= AI 상세 해설 ================= */

const AI_DAILY_LIMIT = 5;
const QUOTA_KEY = 'chemi:ai-quota';
const CACHE_PREFIX = 'chemi:ai:v1:';

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬)

function quotaLeft() {
  const q = store.get(QUOTA_KEY);
  const used = q?.date === today() ? q.count : 0;
  return Math.max(0, AI_DAILY_LIMIT - used);
}

function useQuota() {
  const q = store.get(QUOTA_KEY);
  const used = q?.date === today() ? q.count : 0;
  store.set(QUOTA_KEY, { date: today(), count: used + 1 });
}

/**
 * 캐시 키는 두 사람의 (일간, MBTI)를 정렬해서 만든다. A·B 순서가 바뀌어도 같은 키.
 * 해설은 "{A}", "{B}"로 받아 저장하고, 화면에 띄울 때 닉네임으로 바꾼다.
 */
function canonical(state) {
  const tag = (p) => `${STEMS[p.stem].hanja}${p.mbti ?? '-'}`;
  const swapped = tag(state.a) > tag(state.b);
  const [first, second] = swapped ? [state.b, state.a] : [state.a, state.b];
  return { key: CACHE_PREFIX + tag(first) + '|' + tag(second), first, second, swapped };
}

function aiPayload(first, second) {
  const rel = sajuRelation(first.stem, second.stem);
  const mbti = mbtiScore(first.mbti, second.mbti);
  const person = (p, name) => {
    const s = STEMS[p.stem];
    return { name, dayStem: s.hanja, element: ELEMENTS[s.element].name, yinYang: s.yang ? '양' : '음', mbti: p.mbti };
  };
  return {
    a: person(first, '{A}'),
    b: person(second, '{B}'),
    saju: { relation: rel.label, direction: rel.from, score: rel.score },
    mbti: mbti && { score: mbti.score, letters: mbti.letters },
  };
}

function initAi(state) {
  const btn = $('#ai-btn');
  const body = $('#ai-body');
  const quotaEl = $('#ai-quota');
  const { key, first, second, swapped } = canonical(state);
  const [nameFirst, nameSecond] = swapped ? [state.b.name, state.a.name] : [state.a.name, state.b.name];

  const showQuota = () => {
    const left = quotaLeft();
    quotaEl.textContent = store.get(key)
      ? '이 조합은 이미 받아 둔 해설이 있어요.'
      : left > 0 ? `오늘 ${left}번 더 볼 수 있어요.` : '오늘 볼 수 있는 AI 해설을 다 썼어요. 내일 다시 와 주세요!';
    btn.disabled = !store.get(key) && left === 0;
  };
  showQuota();

  const render = (ai) => {
    const f = (t) => esc(fillNames(t, nameFirst, nameSecond));
    body.innerHTML = `
      <div class="ai-part"><h3>타고난 기운</h3><p>${f(ai.saju)}</p></div>
      ${state.mbti && ai.mbti ? `<div class="ai-part"><h3>대화·생활 스타일</h3><p>${f(ai.mbti)}</p></div>` : ''}
      <div class="ai-part"><h3>서로에게 하는 조언</h3><ol class="ai-tips">${ai.tips.map((t) => `<li>${f(t)}</li>`).join('')}</ol></div>`;
    body.hidden = false;
    btn.hidden = true;
    quotaEl.hidden = true;
  };

  btn.addEventListener('click', async () => {
    const cached = store.get(key);
    if (cached) return render(cached);
    if (quotaLeft() === 0) return showQuota();

    btn.disabled = true;
    body.hidden = false;
    body.innerHTML = '<p class="ai-loading">기운을 읽는 중…</p>';
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiPayload(first, second)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '해설을 받아 오지 못했어요.');
      useQuota();
      store.set(key, data);
      render(data);
    } catch (err) {
      body.innerHTML = `<p class="ai-error">${esc(err.message === 'Failed to fetch' ? '연결이 불안정해요. 잠시 후 다시 시도해 주세요.' : err.message)}</p>`;
      btn.textContent = '다시 시도';
      showQuota();
    }
  });
}

/* ================= 시작 ================= */

if (document.body.dataset.page === 'input') initInput();
else initResult();
