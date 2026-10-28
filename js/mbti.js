// MBTI 궁합: 공인 기준이 없어서 케미케미만의 글자별 규칙으로 256가지 조합을 계산한다.

export const MBTI_TYPES = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
  'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP',
  'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
];

export const BASE_SCORE = 50;

// 글자 자리별 같을 때/다를 때 더하는 점수
export const LETTER_RULES = [
  { key: 'EI', same: 8, diff: 12 },
  { key: 'SN', same: 15, diff: 5 },
  { key: 'TF', same: 8, diff: 10 },
  { key: 'JP', same: 12, diff: 6 },
];

export const RAW_MIN = BASE_SCORE + LETTER_RULES.reduce((s, r) => s + Math.min(r.same, r.diff), 0); // 77
export const RAW_MAX = BASE_SCORE + LETTER_RULES.reduce((s, r) => s + Math.max(r.same, r.diff), 0); // 99

export function isMbti(value) {
  return MBTI_TYPES.includes(value);
}

/**
 * 두 MBTI의 궁합. 한 명이라도 "모름"(null 등)이면 null.
 * raw는 규칙 그대로의 점수(77~99), score는 화면용으로 0~100에 다시 펼친 점수.
 */
export function mbtiScore(a, b) {
  if (!isMbti(a) || !isMbti(b)) return null;

  let raw = BASE_SCORE;
  const letters = {};
  LETTER_RULES.forEach((rule, i) => {
    const same = a[i] === b[i];
    letters[rule.key] = same ? 'same' : 'diff';
    raw += same ? rule.same : rule.diff;
  });

  const values = Object.values(letters);
  let special = null;
  if (values.every((v) => v === 'same')) special = 'identical';
  else if (values.every((v) => v === 'diff')) special = 'opposite';

  return {
    raw,
    score: Math.round(((raw - RAW_MIN) / (RAW_MAX - RAW_MIN)) * 100),
    letters,
    special,
  };
}
