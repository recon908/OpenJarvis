import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchBriefing, saveBriefingState, type Briefing, type BriefingState, type CheckItem } from '../lib/briefing';
import './jarvis-briefing.css';

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const DAYS_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Panel({ title, caption, className = '', children }: { title: string; caption?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`jb-panel ${className}`}>
      <header>
        <h3>{title}</h3>
        {caption && <span>{caption}</span>}
      </header>
      <div className="jb-body">{children}</div>
    </section>
  );
}

function Ring({ size, value, children }: { size: number; value: number; children?: ReactNode }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <div className="jb-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="val"
          strokeDasharray={`${(c * Math.min(100, Math.max(0, value))) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="jb-ring-label">{children}</div>
    </div>
  );
}

function BigClock({ now, pending, next }: { now: Date; pending: number; next?: string }) {
  const ticks = useMemo(() => Array.from({ length: 60 }, (_, i) => (i / 60) * Math.PI * 2), []);
  const sec = now.getSeconds();
  return (
    <div className="jb-clock">
      <svg viewBox="-200 -200 400 400" aria-hidden="true">
        <circle r="192" className="jb-c-faint" />
        <g className="jb-spin-slow">
          <circle r="182" className="jb-c-dash" />
        </g>
        {ticks.map((a, i) => (
          <line
            key={i}
            x1={Math.sin(a) * 164}
            y1={-Math.cos(a) * 164}
            x2={Math.sin(a) * (i % 5 === 0 ? 150 : 156)}
            y2={-Math.cos(a) * (i % 5 === 0 ? 150 : 156)}
            className={i <= sec ? 'jb-tick on' : 'jb-tick'}
          />
        ))}
        <g className="jb-spin-rev">
          <circle r="138" className="jb-c-seg" />
        </g>
        <circle r="122" className="jb-c-faint" />
        <circle r="118" className="jb-c-core" />
      </svg>
      <div className="jb-clock-label">
        <small>TODAY</small>
        <strong>{hhmm(now)}</strong>
        <em>챙길 일 {pending}건</em>
        {next && <p>{next}</p>}
      </div>
    </div>
  );
}

function Checklist({ items, checks, onToggle }: { items: CheckItem[]; checks: Record<string, boolean>; onToggle: (id: string) => void }) {
  return (
    <ul className="jb-checks">
      {items.map((it) => {
        const done = checks[it.id] ?? !!it.done;
        return (
          <li key={it.id} className={done ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={done} onChange={() => onToggle(it.id)} />
              <span className="jb-check-text">
                <span className="jb-check-title">
                  {it.tag && <span className="jb-tag">{it.tag}</span>}
                  {it.title}
                </span>
                {it.detail && <span className="jb-check-detail">{it.detail}</span>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function changeText(change: number, unit: '%' | '원' = '%') {
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';
  return `${sign}${Math.abs(change).toFixed(unit === '%' ? 2 : 1)}${unit}`;
}

export function JarvisBriefing({ onClose }: { onClose: () => void }) {
  const now = useNow();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [memo, setMemo] = useState('');
  const [savedAt, setSavedAt] = useState<string>();
  const [saving, setSaving] = useState(false);
  const loadedId = useRef<string | undefined>(undefined);

  // Load on open and re-poll so a briefing Claude writes while the screen is up shows without a restart.
  useEffect(() => {
    let cancelled = false;
    const load = (first: boolean) =>
      fetchBriefing()
        .then(({ briefing: b, state }) => {
          if (cancelled) return;
          setLoadError(false);
          setBriefing(b);
          const id = b?.id ?? b?.updatedAt;
          if (first || id !== loadedId.current) {
            // Ticks belong to one briefing; a new briefing starts with a clean slate.
            setChecks(state.briefingId && state.briefingId === id ? state.checks : {});
            if (first) {
              setMemo(state.memo ?? '');
              setSavedAt(state.savedAt);
            }
            loadedId.current = id;
          }
        })
        .catch(() => !cancelled && setLoadError(true));
    load(true);
    const t = setInterval(() => load(false), 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const persist = useCallback(
    (next: Partial<BriefingState>) => {
      const state: BriefingState = { briefingId: loadedId.current, checks, memo, ...next };
      setSaving(true);
      return saveBriefingState(state)
        .then(() => setSavedAt(new Date().toISOString()))
        .catch(() => setLoadError(true))
        .finally(() => setSaving(false));
    },
    [checks, memo],
  );

  const toggle = (id: string) => {
    const all = [...(briefing?.priority?.items ?? []), ...(briefing?.handover?.groups.flatMap((g) => g.items) ?? [])];
    const item = all.find((i) => i.id === id);
    const next = { ...checks, [id]: !(checks[id] ?? !!item?.done) };
    setChecks(next);
    void persist({ checks: next });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isDone = (it: CheckItem) => checks[it.id] ?? !!it.done;
  const priority = briefing?.priority?.items ?? [];
  const pending = priority.filter((i) => !isDone(i)).length;
  const handoverItems = briefing?.handover?.groups.flatMap((g) => g.items) ?? [];
  const handoverDone = handoverItems.filter(isDone).length;
  const dayPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;

  return (
    <div className="jb" role="dialog" aria-label="Jarvis briefing">
      <div className="jb-bg" />
      <header className="jb-top">
        <div className="jb-logo">JARVIS</div>
        <div className="jb-status">
          <span className={loadError ? 'jb-dot err' : 'jb-dot'} />
          {loadError ? 'OFFLINE' : 'ONLINE'}
          {briefing?.updatedAt && <span>UPDATED {briefing.updatedAt}</span>}
          {briefing?.device && <span className="jb-muted">{briefing.device}</span>}
          <button type="button" className="jb-enter" onClick={onClose}>
            ENTER ▸
          </button>
        </div>
      </header>

      <main className="jb-grid">
        <div className="jb-col">
          <Panel title="TIME" caption="지금">
            <div className="jb-time">
              <Ring size={104} value={dayPct}>
                <b>{hhmm(now)}</b>
                <small>DAY {Math.round(dayPct)}%</small>
              </Ring>
              <div>
                <div className="jb-daynum">{now.getDate()}</div>
                <div className="jb-month">
                  {MONTHS[now.getMonth()]} · {DAYS_EN[now.getDay()]}
                </div>
                <div className="jb-muted">
                  {now.getFullYear()}년 {now.getMonth() + 1}월 {now.getDate()}일 {DAYS_KO[now.getDay()]}요일
                </div>
              </div>
            </div>
          </Panel>

          {briefing?.ledger && (
            <Panel title="LEDGER" caption={briefing.ledger.caption}>
              {!!briefing.ledger.boxes?.length && (
                <div className="jb-boxes">
                  {briefing.ledger.boxes.map((b) => (
                    <div key={b.label} className="jb-box">
                      <span className="jb-muted">{b.label}</span>
                      <b>{b.amount}</b>
                      {b.sub && <small>{b.sub}</small>}
                    </div>
                  ))}
                </div>
              )}
              {briefing.ledger.receivables && (
                <div className="jb-recv">
                  <div className="jb-warn">{briefing.ledger.receivables.title}</div>
                  {briefing.ledger.receivables.items.map((r, i) => (
                    <div key={i} className="jb-row">
                      <span>
                        └ {r.name}
                        {r.date && <span className="jb-muted"> ({r.date})</span>}
                      </span>
                      <b>{r.amount}</b>
                    </div>
                  ))}
                </div>
              )}
              {briefing.ledger.rows?.map((r) => (
                <div key={r.label} className="jb-row">
                  <span className={r.warn ? 'jb-warn' : ''}>{r.label}</span>
                  <b>{r.value}</b>
                </div>
              ))}
              {briefing.ledger.note && <p className="jb-note">{briefing.ledger.note}</p>}
            </Panel>
          )}

          {briefing?.market && (
            <Panel title="MARKET" caption={briefing.market.caption}>
              <div className="jb-market">
                {briefing.market.indices?.map((m) => (
                  <div key={m.name} className={m.change > 0 ? 'up' : m.change < 0 ? 'down' : ''}>
                    <Ring size={72} value={Math.min(100, Math.abs(m.unit === '원' ? m.change * 5 : m.change) * 12)}>
                      <b>{changeText(m.change, m.unit)}</b>
                    </Ring>
                    <span className="jb-muted">{m.name}</span>
                    <span className="jb-mval">{m.value}</span>
                  </div>
                ))}
              </div>
              {briefing.market.note && <p className="jb-note">{briefing.market.note}</p>}
            </Panel>
          )}
        </div>

        <div className="jb-col jb-center">
          <BigClock now={now} pending={pending} next={briefing?.today?.next ?? briefing?.today?.headline} />

          <Panel title="PRIORITY" caption={briefing?.priority?.caption ?? '지금 챙길 것'}>
            {priority.length ? (
              <Checklist items={priority} checks={checks} onToggle={toggle} />
            ) : (
              <p className="jb-muted">
                {briefing ? '오늘 챙길 일이 없습니다.' : '아직 브리핑이 없습니다. Claude에게 "자비스"라고 하면 채워집니다.'}
              </p>
            )}
          </Panel>

          <Panel title="MEMO" caption={'다음 "자비스" 때 처리합니다'}>
            <div className="jb-memo">
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 내일 택배 송장번호 장부 메모에 넣어줘"
                rows={3}
              />
              <button type="button" disabled={saving} onClick={() => void persist({ memo })}>
                {saving ? '...' : 'SAVE'}
              </button>
            </div>
            <p className="jb-note">
              체크와 메모는 저장되고, 다음 "자비스" 때 Claude가 읽어서 반영합니다.
              {savedAt && <span className="jb-muted"> · 저장 {hhmm(new Date(savedAt))}</span>}
            </p>
          </Panel>
        </div>

        <div className="jb-col">
          {briefing?.schedule && (
            <Panel title="SCHEDULE" caption={briefing.schedule.caption ?? '앞으로 7일'}>
              <div className="jb-sched">
                {briefing.schedule.days.map((d) => (
                  <div key={d.date} className={d.today ? 'jb-day today' : 'jb-day'}>
                    <div className="jb-day-h">
                      {d.date} {d.weekday}
                    </div>
                    <div>
                      {d.entries.map((e, i) => (
                        <div key={i} className="jb-entry">
                          {e.time && <b>{e.time} </b>}
                          {e.text}
                          {e.detail && <div className="jb-muted">{e.detail}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {briefing?.handover && (
            <Panel
              title="HANDOVER"
              caption={`${briefing.handover.title ?? '인수인계'} · ${handoverDone}/${handoverItems.length}`}
              className="jb-grow"
            >
              {briefing.handover.groups.map((g) => (
                <div key={g.title} className="jb-group">
                  <div className="jb-group-h">{g.title}</div>
                  <Checklist items={g.items} checks={checks} onToggle={toggle} />
                </div>
              ))}
            </Panel>
          )}
        </div>
      </main>
    </div>
  );
}
