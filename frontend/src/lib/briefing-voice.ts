import type { Briefing, CheckItem } from './briefing';

/**
 * Spoken launch briefing. The server's TTS voices are English-only, so the
 * briefing uses the OS Korean voice through the Web Speech API instead.
 */

export const synthAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

function greeting(h: number) {
  if (h < 5) return '늦은 시간이네요';
  if (h < 11) return '좋은 아침입니다';
  if (h < 17) return '안녕하세요';
  return '좋은 저녁입니다';
}

const ORDINALS = ['첫째', '둘째', '셋째', '넷째', '다섯째'];

/** What Jarvis says when the briefing opens. `briefing.speech`, if set by Claude, wins. */
export function composeBriefingSpeech(b: Briefing | null, now: Date, isDone: (i: CheckItem) => boolean): string {
  if (b?.speech) return b.speech;
  const h = now.getHours();
  const m = now.getMinutes();
  const parts = [`${greeting(h)}. 자비스입니다. 지금은 ${h}시${m ? ` ${m}분` : ''}입니다.`];
  if (!b) {
    parts.push('아직 오늘 브리핑이 없습니다.');
    return parts.join(' ');
  }
  const pending = (b.priority?.items ?? []).filter((i) => !isDone(i));
  if (pending.length) {
    parts.push(`오늘 챙길 일은 ${pending.length}건입니다.`);
    pending.slice(0, ORDINALS.length).forEach((i, n) => {
      parts.push(`${ORDINALS[n]}, ${i.tag ? `${i.tag}, ` : ''}${i.title}.`);
    });
  } else {
    parts.push('지금 챙길 일은 모두 끝났습니다.');
  }
  if (b.ledger?.receivables?.title) parts.push(`장부는 ${b.ledger.receivables.title}입니다.`);
  if (b.market?.note) parts.push(b.market.note);
  return parts.join(' ');
}

/**
 * The short spoken greeting for the launch card: time, how many things are
 * pending and the first of them. Deliberately ignores `briefing.speech`,
 * which is written for the full briefing screen.
 */
export function composeShortBriefingSpeech(b: Briefing | null, now: Date, isDone: (i: CheckItem) => boolean): string {
  const h = now.getHours();
  const m = now.getMinutes();
  const parts = [`${greeting(h)}. 자비스입니다. 지금은 ${h}시${m ? ` ${m}분` : ''}입니다.`];
  if (!b) {
    parts.push('아직 오늘 브리핑이 없습니다.');
    return parts.join(' ');
  }
  const pending = (b.priority?.items ?? []).filter((i) => !isDone(i));
  if (pending.length) {
    parts.push(`오늘 챙길 일은 ${pending.length}건, 먼저 ${pending[0].title}입니다.`);
  } else {
    parts.push('지금 챙길 일은 모두 끝났습니다.');
  }
  return parts.join(' ');
}

export { greeting as briefingGreeting };

function pickKoreanVoice(): SpeechSynthesisVoice | undefined {
  const ko = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ko'));
  // Edge/WebView2 neural voices ("… Online (Natural)") sound far better than the legacy ones.
  return ko.find((v) => /natural|online/i.test(v.name)) ?? ko[0];
}

function voicesReady(): Promise<void> {
  if (speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener('voiceschanged', done);
      resolve();
    };
    speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(done, 1500);
  });
}

/**
 * Speak `text`. Resolves true once speech actually starts, false if the
 * browser refused (e.g. autoplay rules before any user gesture).
 */
export async function speakKorean(text: string, handlers: { onEnd?: () => void } = {}): Promise<boolean> {
  if (!synthAvailable() || !text) return false;
  await voicesReady();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  const voice = pickKoreanVoice();
  if (voice) u.voice = voice;
  u.rate = 1.05;
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    u.onstart = () => settle(true);
    u.onend = () => {
      settle(true);
      handlers.onEnd?.();
    };
    u.onerror = (e) => {
      settle(e.error === 'interrupted' || e.error === 'canceled');
      handlers.onEnd?.();
    };
    speechSynthesis.speak(u);
    // Blocked speech may never fire onstart; give up after a moment so the caller can retry on a gesture.
    setTimeout(() => {
      if (!settled) {
        speechSynthesis.cancel();
        settle(false);
      }
    }, 3000);
  });
}

export function stopSpeaking() {
  if (synthAvailable()) speechSynthesis.cancel();
}
