// 사주 계산: 음력→양력, 일간(日干) 구하기, 두 일간의 오행 관계 판정.
// 나중에 사주팔자로 확장할 때는 이 파일만 바꾸면 된다.

// 오행 순서는 상생 순서(목→화→토→금→수→목)와 같다.
export const ELEMENTS = [
  { key: 'wood', name: '목', hanja: '木', color: '#3E7C6F' },
  { key: 'fire', name: '화', hanja: '火', color: '#C2554A' },
  { key: 'earth', name: '토', hanja: '土', color: '#D4A53C' },
  { key: 'metal', name: '금', hanja: '金', color: '#E9E4DA' },
  { key: 'water', name: '수', hanja: '水', color: '#2F3440' },
];

// 천간 10개. 짝수 인덱스는 양, 홀수는 음. 오행은 두 개씩 묶인다.
export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'].map((hanja, i) => ({
  index: i,
  hanja,
  name: ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'][i],
  element: Math.floor(i / 2),
  yang: i % 2 === 0,
}));

export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 기준일 2024-01-01 = 甲子일(60갑자 인덱스 0)
const BASE_UTC = Date.UTC(2024, 0, 1);
const DAY_MS = 86400000;

/** 양력 날짜의 일진(60갑자). 타임존에 흔들리지 않게 UTC로 날짜 차이를 센다. */
export function dayPillar(year, month, day) {
  const diff = Math.round((Date.UTC(year, month - 1, day) - BASE_UTC) / DAY_MS);
  const index = ((diff % 60) + 60) % 60;
  return { index, stem: index % 10, branch: index % 12 };
}

/** 양력 날짜의 일간(천간 인덱스 0~9) */
export function dayStem(year, month, day) {
  return dayPillar(year, month, day).stem;
}

export function stemIndexOf(hanja) {
  return STEMS.findIndex((s) => s.hanja === hanja);
}

const LUNAR_CDN = 'https://cdn.jsdelivr.net/npm/korean-lunar-calendar@0.4.0/dist/korean-lunar-calendar.mjs';
let lunarModule;

/**
 * 음력(윤달 포함) → 양력. 변환할 수 없는 날짜(없는 윤달 등)면 null.
 * 라이브러리를 바꿀 때는 이 함수만 고치면 된다. 테스트에서는 load로 npm 패키지를 넘긴다.
 */
export async function lunarToSolar(year, month, day, isLeap = false, { load = () => import(LUNAR_CDN) } = {}) {
  lunarModule ??= await load();
  const Calendar = lunarModule.default ?? lunarModule;
  const cal = new Calendar();
  if (!cal.setLunarDate(year, month, day, isLeap)) return null;
  // 라이브러리는 윤달이 없는 달에 isLeap을 줘도 평달로 처리하므로 직접 확인한다.
  if (isLeap && !cal.getLunarCalendar().intercalation) return null;
  const { year: y, month: m, day: d } = cal.getSolarCalendar();
  return { year: y, month: m, day: d };
}

// 판정 순서대로. 점수는 초깃값이라 만들면서 조정한다.
export const RELATIONS = {
  hap: { label: '천간합', base: 95 },
  saeng: { label: '상생', base: 85 },
  bihwa: { label: '비화', base: 75 },
  geuk: { label: '상극', base: 60 },
};
export const YINYANG_BONUS = 3;

/**
 * 두 일간의 관계와 점수.
 * from: 상생이면 살려주는 쪽, 상극이면 누르는 쪽('a' | 'b'). 천간합·비화는 null.
 */
export function sajuRelation(stemA, stemB) {
  const a = STEMS[stemA];
  const b = STEMS[stemB];
  let type;
  let from = null;

  if (Math.abs(stemA - stemB) === 5) {
    type = 'hap'; // 甲己, 乙庚, 丙辛, 丁壬, 戊癸
  } else if ((a.element + 1) % 5 === b.element) {
    type = 'saeng';
    from = 'a';
  } else if ((b.element + 1) % 5 === a.element) {
    type = 'saeng';
    from = 'b';
  } else if (a.element === b.element) {
    type = 'bihwa';
  } else if ((a.element + 2) % 5 === b.element) {
    type = 'geuk'; // 목극토, 토극수, 수극화, 화극금, 금극목
    from = 'a';
  } else {
    type = 'geuk';
    from = 'b';
  }

  const yinYangDiff = a.yang !== b.yang;
  return {
    type,
    label: RELATIONS[type].label,
    from,
    yinYangDiff,
    score: RELATIONS[type].base + (yinYangDiff ? YINYANG_BONUS : 0),
  };
}
