import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MBTI_TYPES, mbtiScore, RAW_MIN, RAW_MAX } from '../js/mbti.js';

test('256가지 조합 점수가 모두 범위 안이고 대칭', () => {
  assert.equal(MBTI_TYPES.length, 16);
  for (const a of MBTI_TYPES) {
    for (const b of MBTI_TYPES) {
      const r = mbtiScore(a, b);
      assert.ok(r.raw >= RAW_MIN && r.raw <= RAW_MAX, `${a}-${b} raw ${r.raw}`);
      assert.ok(r.score >= 0 && r.score <= 100, `${a}-${b} score ${r.score}`);
      assert.equal(mbtiScore(b, a).raw, r.raw);
    }
  }
  assert.equal(RAW_MIN, 77);
  assert.equal(RAW_MAX, 99);
});

test('기획서 예시: INTJ × ENFP', () => {
  const r = mbtiScore('INTJ', 'ENFP');
  assert.equal(r.raw, 93);
  assert.deepEqual(r.letters, { EI: 'diff', SN: 'same', TF: 'diff', JP: 'diff' });
});

test('특수 조합과 "모름"', () => {
  assert.equal(mbtiScore('INFP', 'INFP').special, 'identical');
  assert.equal(mbtiScore('INFP', 'ESTJ').special, 'opposite');
  assert.equal(mbtiScore('INFP', 'ENFP').special, null);
  assert.equal(mbtiScore('INFP', null), null);
  assert.equal(mbtiScore('모름', 'INFP'), null);
});
