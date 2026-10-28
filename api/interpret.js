// Vercel 서버리스 함수: 계산 결과를 받아 Gemini로 상세 해설을 만든다.
// API 키는 Vercel 환경변수 GEMINI_API_KEY 에만 둔다. 프론트 코드에는 절대 넣지 않는다.
// 점수는 클라이언트가 보낸 값을 믿지 않고 일간·MBTI로 다시 계산한다.

import { ELEMENTS, STEMS, stemIndexOf, sajuRelation } from '../js/saju.js';
import { isMbti, mbtiScore } from '../js/mbti.js';

// 앞 모델이 과부하거나 쓸 수 없으면 다음 모델로 넘어간다.
const MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
];
const TIMEOUT_MS = 50000;

function callGemini(model, prompt, apiKey, signal, withThinking) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 2048,
        // 짧은 해설이라 깊게 생각할 필요가 없다. 기본값(높음)이면 응답이 수십 초 걸린다.
        // 대체 모델은 이 옵션을 지원하지 않을 수 있어서 첫 모델에만 넣는다.
        ...(withThinking && { thinkingConfig: { thinkingLevel: 'low' } }),
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });
}

const SYSTEM_PROMPT = `너는 따뜻하고 재치 있는 궁합 해설가야. 반말로, 친구에게 말하듯 써.

규칙:
- 두 사람은 반드시 "{A}", "{B}"라는 표기 그대로 불러. 다른 이름이나 호칭을 지어내지 마.
- 받은 계산 결과만 근거로 써. 점수를 바꾸거나 새 점수·새 사주 정보를 만들지 마.
- saju: 타고난 기운(두 사람의 일간 오행 관계) 해설, 3~4문장.
- mbti: 대화·생활 스타일(MBTI 글자별 같음/다름) 해설, 3~4문장. MBTI 정보가 없으면 빈 문자열.
- tips: 서로에게 하는 조언 정확히 3개, 각각 한 문장.
- 전체 600자 안쪽.
- 궁합이 낮아도 부정적으로 단정하지 말고 "이렇게 하면 더 잘 맞는다"로 마무리해.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    saju: { type: 'STRING' },
    mbti: { type: 'STRING' },
    tips: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['saju', 'mbti', 'tips'],
};

function readPerson(p) {
  if (!p || typeof p !== 'object') return null;
  const stem = stemIndexOf(p.dayStem);
  if (stem < 0) return null;
  if (p.mbti != null && !isMbti(p.mbti)) return null;
  return { stem, mbti: p.mbti ?? null };
}

function describe(a, b) {
  const rel = sajuRelation(a.stem, b.stem);
  const mbti = mbtiScore(a.mbti, b.mbti);
  const person = (p, name) => {
    const s = STEMS[p.stem];
    return { name, dayStem: `${s.hanja}(${s.name})`, element: ELEMENTS[s.element].name, yinYang: s.yang ? '양' : '음', mbti: p.mbti ?? '모름' };
  };
  const [g, r] = rel.from === 'a' ? ['{A}', '{B}'] : ['{B}', '{A}'];
  const direction = {
    hap: '두 일간이 천간합으로 묶임',
    bihwa: '두 사람의 오행이 같음',
    saeng: `${g}의 오행이 ${r}의 오행을 살려 줌(상생)`,
    geuk: `${g}의 오행이 ${r}의 오행을 누름(상극)`,
  }[rel.type];

  return {
    a: person(a, '{A}'),
    b: person(b, '{B}'),
    saju: { relation: rel.label, direction, yinYang: rel.yinYangDiff ? '음양이 다름' : '음양이 같음', score: rel.score },
    mbti: mbti
      ? { score: mbti.score, letters: mbti.letters, special: mbti.special }
      : '한 명 이상이 MBTI를 모름. mbti 항목은 빈 문자열로.',
  };
}

const clip = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST만 받아요.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI 해설이 아직 준비되지 않았어요.' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const a = readPerson(body?.a);
  const b = readPerson(body?.b);
  if (!a || !b) return res.status(400).json({ error: '요청 형식이 올바르지 않아요.' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const prompt = JSON.stringify(describe(a, b));
    let r;
    for (const [i, model] of MODELS.entries()) {
      r = await callGemini(model, prompt, apiKey, controller.signal, i === 0);
      if (r.ok) break;
      console.error('Gemini error', model, r.status, await r.text());
      // 과부하(503)·한도(429)·없는 모델(404)·옵션 미지원(400)이면 다음 모델로 넘어간다.
      if (![400, 404, 429, 503].includes(r.status)) break;
    }
    if (!r.ok) {
      return res.status(502).json({ error: 'AI가 잠시 쉬고 있어요. 조금 뒤에 다시 시도해 주세요.' });
    }

    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const parsed = JSON.parse(text);
    const result = {
      saju: clip(parsed.saju, 400),
      mbti: a.mbti && b.mbti ? clip(parsed.mbti, 400) : '',
      tips: (Array.isArray(parsed.tips) ? parsed.tips : []).map((t) => clip(t, 150)).filter(Boolean).slice(0, 3),
    };
    if (!result.saju || result.tips.length === 0) throw new Error('empty response');
    return res.status(200).json(result);
  } catch (err) {
    console.error('interpret failed', err);
    const timedOut = err.name === 'AbortError';
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'AI가 너무 오래 고민하고 있어요. 다시 시도해 주세요.' : '해설을 만들지 못했어요. 다시 시도해 주세요.',
    });
  } finally {
    clearTimeout(timer);
  }
}
