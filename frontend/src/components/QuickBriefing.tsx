import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBriefing, type Briefing, type CheckItem } from '../lib/briefing';
import { briefingGreeting, composeShortBriefingSpeech, speakKorean, stopSpeaking, synthAvailable } from '../lib/briefing-voice';
import './quick-briefing.css';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
/** How long the card stays up once nothing is holding it (hover or speech). */
const AUTO_CLOSE_MS = 15_000;

/**
 * Short launch briefing: a small card over the main screen with the time,
 * how many things are pending and the first few of them, read aloud once.
 * "자세히" opens the full briefing screen.
 */
export function QuickBriefing({ onOpenFull, onClose }: { onOpenFull: () => void; onClose: () => void }) {
  const [now] = useState(() => new Date());
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBriefing()
      .then(({ briefing: b, state }) => {
        if (cancelled) return;
        setBriefing(b);
        const id = b?.id ?? b?.updatedAt;
        setChecks(state.briefingId && state.briefingId === id ? state.checks : {});
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const isDone = useCallback((i: CheckItem) => checks[i.id] ?? !!i.done, [checks]);
  const pending = (briefing?.priority?.items ?? []).filter((i) => !isDone(i));

  const latest = useRef({ briefing, isDone });
  latest.current = { briefing, isDone };
  const speechRun = useRef(0);
  const speak = useCallback(async () => {
    const { briefing: b, isDone: done } = latest.current;
    const run = ++speechRun.current;
    setSpeaking(true);
    const ok = await speakKorean(composeShortBriefingSpeech(b, new Date(), done), {
      onEnd: () => run === speechRun.current && setSpeaking(false),
    });
    if (run === speechRun.current && !ok) setSpeaking(false);
    return ok;
  }, []);

  // Read it once when it loads. Browsers may refuse speech before any user
  // gesture; then the first click anywhere starts it instead.
  useEffect(() => {
    if (!loaded || loadError || !synthAvailable() || localStorage.getItem('jb-auto-voice') === '0') return;
    let cancelled = false;
    let retry: ((e: Event) => void) | null = null;
    void speak().then((ok) => {
      if (ok || cancelled) return;
      retry = (e: Event) => {
        if (e.target instanceof Element && e.target.closest('[data-qb-control]')) return;
        window.removeEventListener('pointerdown', retry!);
        void speak();
      };
      window.addEventListener('pointerdown', retry);
    });
    return () => {
      cancelled = true;
      if (retry) window.removeEventListener('pointerdown', retry);
    };
  }, [loaded, loadError, speak]);

  useEffect(() => stopSpeaking, []);

  // Close on its own after a while, but not while it is being read or hovered.
  useEffect(() => {
    if (!loaded || hover || speaking) return;
    const t = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [loaded, hover, speaking, onClose]);

  const close = () => {
    stopSpeaking();
    onClose();
  };

  const next = briefing?.today?.next ?? briefing?.today?.headline;

  return (
    <aside
      className="qb"
      role="status"
      aria-label="자비스 브리핑"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <header className="qb-head">
        <span className={speaking ? 'qb-dot on' : 'qb-dot'} />
        <span className="qb-title">JARVIS BRIEFING</span>
        <span className="qb-time">
          {now.getMonth() + 1}월 {now.getDate()}일 {DAYS_KO[now.getDay()]}요일 · {pad(now.getHours())}:{pad(now.getMinutes())}
        </span>
        <button type="button" className="qb-x" data-qb-control onClick={close} aria-label="닫기">
          ×
        </button>
      </header>

      <p className="qb-greet">{briefingGreeting(now.getHours())}.</p>

      {!loaded ? (
        <p className="qb-muted">브리핑을 불러오는 중…</p>
      ) : loadError ? (
        <p className="qb-muted">브리핑을 불러오지 못했습니다.</p>
      ) : !briefing ? (
        <p className="qb-muted">아직 오늘 브리핑이 없습니다. Claude에게 "자비스"라고 하면 채워집니다.</p>
      ) : (
        <>
          <p className="qb-count">
            {pending.length ? (
              <>
                오늘 챙길 일 <b>{pending.length}건</b>
              </>
            ) : (
              '챙길 일은 모두 끝났습니다.'
            )}
          </p>
          {pending.length > 0 && (
            <ul className="qb-list">
              {pending.slice(0, 3).map((i) => (
                <li key={i.id}>
                  {i.tag && <span className="qb-tag">{i.tag}</span>}
                  {i.title}
                </li>
              ))}
              {pending.length > 3 && <li className="qb-muted">외 {pending.length - 3}건</li>}
            </ul>
          )}
          {next && <p className="qb-next">▸ {next}</p>}
        </>
      )}

      <footer className="qb-actions">
        {synthAvailable() && (
          <button
            type="button"
            data-qb-control
            onClick={() => (speaking ? (stopSpeaking(), setSpeaking(false)) : void speak())}
          >
            {speaking ? '■ 정지' : '▶ 듣기'}
          </button>
        )}
        <button
          type="button"
          data-qb-control
          onClick={() => {
            stopSpeaking();
            onOpenFull();
          }}
        >
          자세히 ▸
        </button>
      </footer>
    </aside>
  );
}
