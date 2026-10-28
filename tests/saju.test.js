import { test } from 'node:test';
import assert from 'node:assert/strict';
import KoreanLunarCalendar from 'korean-lunar-calendar';
import { dayPillar, dayStem, lunarToSolar, sajuRelation, STEMS, BRANCHES, stemIndexOf } from '../js/saju.js';

const ganji = (y, m, d) => {
  const p = dayPillar(y, m, d);
  return STEMS[p.stem].hanja + BRANCHES[p.branch];
};
const load = async () => ({ default: KoreanLunarCalendar });

test('검산: 기준일과 알려진 일진', () => {
  assert.equal(ganji(2024, 1, 1), '甲子');
  assert.equal(ganji(2000, 1, 1), '戊午');
  assert.equal(ganji(1900, 1, 1), '甲戌');
});

test('일진이 만세력 라이브러리와 1930~2049년 매달 1·15일에서 일치', () => {
  for (let y = 1930; y < 2050; y++) {
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 15]) {
        const cal = new KoreanLunarCalendar();
        cal.setSolarDate(y, m, d);
        const expected = cal.getGapJaIndex().cheongan.day;
        assert.equal(dayStem(y, m, d), expected, `${y}-${m}-${d}`);
      }
    }
  }
});

test('음력 → 양력 변환', async () => {
  assert.deepEqual(await lunarToSolar(1990, 5, 15, false, { load }), { year: 1990, month: 6, day: 7 });
  // 2023년 윤2월이 있다
  assert.deepEqual(await lunarToSolar(2023, 2, 1, true, { load }), { year: 2023, month: 3, day: 22 });
  // 2024년에는 윤2월이 없다
  assert.equal(await lunarToSolar(2024, 2, 1, true, { load }), null);
});

test('甲+己 = 천간합 98점, 순서를 바꿔도 같은 점수', () => {
  const ab = sajuRelation(stemIndexOf('甲'), stemIndexOf('己'));
  const ba = sajuRelation(stemIndexOf('己'), stemIndexOf('甲'));
  assert.equal(ab.label, '천간합');
  assert.equal(ab.score, 98);
  assert.equal(ba.score, 98);
});

test('관계 판정과 방향', () => {
  const r = (x, y) => sajuRelation(stemIndexOf(x), stemIndexOf(y));
  assert.deepEqual([r('甲', '丙').type, r('甲', '丙').from, r('甲', '丙').score], ['saeng', 'a', 85]);
  assert.deepEqual([r('丁', '乙').type, r('丁', '乙').from, r('丁', '乙').score], ['saeng', 'b', 85]);
  assert.deepEqual([r('甲', '乙').type, r('甲', '乙').score], ['bihwa', 78]);
  assert.deepEqual([r('癸', '癸').type, r('癸', '癸').score], ['bihwa', 75]);
  assert.deepEqual([r('甲', '戊').type, r('甲', '戊').from, r('甲', '戊').score], ['geuk', 'a', 60]); // 목극토
  assert.deepEqual([r('丙', '壬').type, r('丙', '壬').from], ['geuk', 'b']); // 수극화
});

test('100가지 일간 조합 모두 대칭이고 점수가 범위 안', () => {
  for (let a = 0; a < 10; a++) {
    for (let b = 0; b < 10; b++) {
      const ab = sajuRelation(a, b);
      const ba = sajuRelation(b, a);
      assert.equal(ab.score, ba.score);
      assert.equal(ab.type, ba.type);
      if (ab.from) assert.notEqual(ab.from, ba.from);
      assert.ok(ab.score >= 60 && ab.score <= 98);
    }
  }
});
