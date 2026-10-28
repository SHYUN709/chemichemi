// 공유: URL 인코딩/디코딩, 결과 카드 이미지 저장.
// 링크에는 생년월일 대신 결과를 다시 그리는 데 필요한 값(닉네임, 일간, MBTI)만 넣는다.

import { STEMS, stemIndexOf } from './saju.js';
import { isMbti } from './mbti.js';

export const SHARE_VERSION = 1;
export const NAME_MAX = 10;

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** person: { name, stem(0~9), mbti(string|null) } */
export function encodeShare(a, b) {
  const pack = (p) => [p.name, STEMS[p.stem].hanja, p.mbti ?? ''];
  return toBase64Url(JSON.stringify({ a: pack(a), b: pack(b), v: SHARE_VERSION }));
}

/** 잘못된 링크면 null */
export function decodeShare(d) {
  try {
    const data = JSON.parse(fromBase64Url(d));
    if (data.v !== 1) return null;
    const unpack = (arr) => {
      if (!Array.isArray(arr) || arr.length !== 3) return null;
      const [name, hanja, mbti] = arr;
      const stem = stemIndexOf(hanja);
      if (typeof name !== 'string' || stem < 0) return null;
      return {
        name: name.trim().slice(0, NAME_MAX) || '익명',
        stem,
        mbti: isMbti(mbti) ? mbti : null,
      };
    };
    const a = unpack(data.a);
    const b = unpack(data.b);
    return a && b ? { a, b } : null;
  } catch {
    return null;
  }
}

export function shareUrl(d) {
  // Vercel에서는 /r → result.html 로 rewrite (vercel.json, serve.json)
  return `${location.origin}/r?d=${d}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

const HTML_TO_IMAGE = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/+esm';

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

/**
 * 스토리 카드는 Gowun Batang 하나만 쓴다. 한글 웹폰트는 파일이 수십 개로 쪼개져 있어서
 * 통째로 넣으면 느리므로, 카드에 쓰인 글자만 담은 서브셋(Google Fonts text=)을 받아 넣는다.
 */
async function storyFontCSS(node) {
  const chars = [...new Set(node.textContent.replace(/\s/g, '') + '0123456789')].join('');
  const cssUrl = `https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&text=${encodeURIComponent(chars)}`;
  let css = await (await fetch(cssUrl)).text();
  const fontUrls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
  const dataUrls = await Promise.all(fontUrls.map(async (u) => blobToDataUrl(await (await fetch(u)).blob())));
  fontUrls.forEach((u, i) => { css = css.replaceAll(u, dataUrls[i]); });
  return css;
}

/** 결과 카드 DOM을 PNG로. 모바일은 공유 창, 안 되면 다운로드. */
export async function saveImage(node, filename) {
  const [{ toBlob }, fontEmbedCSS] = await Promise.all([import(HTML_TO_IMAGE), storyFontCSS(node)]);
  const opts = { width: 1080, height: 1920, pixelRatio: 1, cacheBust: true, fontEmbedCSS };
  // 첫 렌더에서 웹폰트·이미지가 빠지는 경우가 있어서 한 번 데워 둔다.
  await toBlob(node, opts);
  const blob = await toBlob(node, opts);
  const file = new File([blob], filename, { type: 'image/png' });

  const isMobile = matchMedia('(pointer: coarse)').matches;
  if (isMobile && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '케미케미 궁합 결과' });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
