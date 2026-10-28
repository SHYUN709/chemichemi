import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillNames, sajuText } from '../js/texts.js';
import { STEMS, sajuRelation } from '../js/saju.js';

test('닉네임 받침에 맞춰 조사를 고른다', () => {
  assert.equal(fillNames('{A}는 {B}를 좋아해.', '성현', '민지'), '성현은 민지를 좋아해.');
  assert.equal(fillNames('{A}가 {B}와 놀아', '민지', '성현'), '민지가 성현과 놀아');
  assert.equal(fillNames('{A}야 표현해', '준호', '-'), '준호야 표현해');
  assert.equal(fillNames('{A}의 기운', '성현', '-'), '성현의 기운');
  assert.equal(fillNames('{A}는', 'Tom', '-'), 'Tom는');
});

test('100가지 일간 조합 모두 해설 문구가 있다', () => {
  for (let a = 0; a < 10; a++) {
    for (let b = 0; b < 10; b++) {
      const text = sajuText(sajuRelation(a, b), STEMS[a], STEMS[b]);
      assert.ok(typeof text === 'string' && text.length > 20, `${a}-${b}`);
      assert.ok(!/\{[GR]\}/.test(text));
    }
  }
});
