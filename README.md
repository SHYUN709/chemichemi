# 케미케미

두 사람의 생년월일과 MBTI로 사주(일간 오행)와 MBTI 궁합을 보여 주는 사이트. 기본 리포트는 브라우저에서 바로 계산하고, "AI 상세 해설 보기"만 Vercel 함수(`/api/interpret`)를 통해 Gemini를 부른다.

## 로컬 실행

```bash
npm install
npm run dev      # http://localhost:5173 (정적 파일만, AI 해설은 503)
npm test         # 계산 로직 검산 (node --test)
```

AI 해설까지 로컬에서 보려면 `vercel dev`를 쓰고 `.env`에 `GEMINI_API_KEY`를 넣는다. `.env`는 `.gitignore`에 들어 있다.

## 배포 (Vercel)

1. GitHub 저장소를 Vercel에 연결한다 (빌드 명령 없음, 루트 그대로 배포).
2. Vercel 프로젝트 환경변수에 `GEMINI_API_KEY`를 넣는다. 모델을 바꾸려면 `GEMINI_MODEL`도 넣는다 (기본 `gemini-3.8-flash`).
3. 공유 링크 `/r?d=...`는 `vercel.json` rewrite로 `result.html`을 연다.

## 구조

| 파일 | 역할 |
| --- | --- |
| `js/saju.js` | 음력→양력(korean-lunar-calendar CDN), 일간 계산(2024-01-01=甲子 기준), 오행 관계와 점수 |
| `js/mbti.js` | 글자별 규칙 점수(77~99 → 화면에는 0~100), 특수 조합, "모름" 처리 |
| `js/texts.js` | 규칙 기반 해설 문구, 닉네임 조사 처리 |
| `js/share.js` | 링크 인코딩(생년월일 없이 닉네임·천간·MBTI만), 9:16 스토리 이미지 저장 |
| `js/app.js` | 화면 연결, AI 버튼, localStorage 캐시와 하루 5회 제한 |
| `api/interpret.js` | Gemini 호출. 점수는 일간·MBTI로 서버에서 다시 계산해서 프롬프트에 넣는다 |

## 점수 조정

- 사주 초깃값: `js/saju.js`의 `RELATIONS`, `YINYANG_BONUS`
- MBTI 글자별 점수: `js/mbti.js`의 `LETTER_RULES`
