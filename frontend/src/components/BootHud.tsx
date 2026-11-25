import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './boot-hud.css';

export interface BootLogLine {
  /** Seconds since the boot screen mounted. */
  t: number;
  text: string;
  state?: 'ok' | 'err';
}

export interface BootEngineRow {
  label: string;
  value: string;
  state: 'ok' | 'wait' | 'err';
}

interface BootHudProps {
  /** 0–100, already smoothed by the caller. */
  progress: number;
  /** Short upper-case phase label under the progress bar. */
  phase: string;
  /** Status line under the OPENJARVIS title. */
  headline: string;
  mode: 'booting' | 'ready' | 'exit';
  engine: BootEngineRow[];
  log: BootLogLine[];
  /** Errors and recovery controls, shown above the progress bar. */
  children?: ReactNode;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Rotation that pivots on the SVG origin; CSS transform-origin is unreliable inside SVG. */
function Spin({ seconds, reverse = false, children }: { seconds: number; reverse?: boolean; children: ReactNode }) {
  return (
    <g>
      {children}
      <animateTransform
        attributeName="transform"
        type="rotate"
        from={reverse ? '360 0 0' : '0 0 0'}
        to={reverse ? '0 0 0' : '360 0 0'}
        dur={`${seconds}s`}
        repeatCount="indefinite"
      />
    </g>
  );
}

function Core({ headline }: { headline: string }) {
  const ticks = useMemo(
    () =>
      Array.from({ length: 120 }, (_, i) => {
        const a = (i / 120) * Math.PI * 2;
        const long = i % 10 === 0;
        return { a, long, r2: long ? 196 : 188 };
      }),
    [],
  );

  const { nodes, links } = useMemo(() => {
    const pts = Array.from({ length: 34 }, () => {
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * 110;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, r: rand(1, 2.4) };
    });
    const ls: [number, number, number, number][] = [];
    pts.forEach((p, i) =>
      pts.forEach((q, j) => {
        if (j > i && Math.hypot(p.x - q.x, p.y - q.y) <= 42) ls.push([p.x, p.y, q.x, q.y]);
      }),
    );
    return { nodes: pts, links: ls };
  }, []);

  // Twinkle the network nodes.
  const [twinkle, setTwinkle] = useState<number[]>(() => nodes.map(() => 1));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setTwinkle(nodes.map(() => rand(0.3, 1))), 180);
    return () => clearInterval(id);
  }, [nodes]);

  return (
    <div className="hud-core">
      <svg viewBox="-200 -200 400 400" aria-hidden="true">
        <defs>
          <radialGradient id="hud-glow">
            <stop offset="0" stopColor="#e8fdff" stopOpacity="1" />
            <stop offset=".18" stopColor="#7cefff" stopOpacity=".9" />
            <stop offset=".55" stopColor="#2bb7d6" stopOpacity=".25" />
            <stop offset="1" stopColor="#2bb7d6" stopOpacity="0" />
          </radialGradient>
          <pattern id="hud-hex" width="17.32" height="30" patternUnits="userSpaceOnUse" patternTransform="scale(1.2)">
            <path
              d="M8.66 0 17.32 5v10L8.66 20 0 15V5Z M8.66 20v10"
              fill="none"
              stroke="#5ee7ff"
              strokeWidth=".5"
              opacity=".35"
            />
          </pattern>
          <clipPath id="hud-inner">
            <circle r="118" />
          </clipPath>
        </defs>

        <circle r="118" fill="url(#hud-hex)" opacity=".7" />

        <Spin seconds={36} reverse>
          <circle r="190" fill="none" stroke="#5ee7ff" strokeWidth=".6" opacity=".4" />
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={Math.cos(t.a) * 182}
              y1={Math.sin(t.a) * 182}
              x2={Math.cos(t.a) * t.r2}
              y2={Math.sin(t.a) * t.r2}
              stroke="#5ee7ff"
              strokeWidth={t.long ? 1.4 : 0.6}
              opacity={t.long ? 0.9 : 0.5}
            />
          ))}
        </Spin>
        <Spin seconds={24}>
          <circle r="172" fill="none" stroke="#5ee7ff" strokeWidth="6" strokeDasharray="60 14 8 14" opacity=".55" />
        </Spin>
        <Spin seconds={9}>
          <path d="M0-155A155 155 0 0 1 134 -77" fill="none" stroke="#9ff4ff" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M0 155A155 155 0 0 1 -134 77" fill="none" stroke="#9ff4ff" strokeWidth="2.4" strokeLinecap="round" />
        </Spin>
        <Spin seconds={36} reverse>
          <circle r="140" fill="none" stroke="#5ee7ff" strokeWidth="1" strokeDasharray="2 6" opacity=".8" />
        </Spin>
        <circle className="hud-draw" pathLength={1} r="124" fill="none" stroke="#5ee7ff" strokeWidth="1.6" />

        <Spin seconds={40}>
          <path d="M0-92 79.7-46V46L0 92-79.7 46V-46Z" fill="none" stroke="#5ee7ff" strokeWidth="1.2" opacity=".75" />
        </Spin>
        <Spin seconds={28} reverse>
          <path d="M0-62 53.7-31V31L0 62-53.7 31V-31Z" fill="none" stroke="#9ff4ff" strokeWidth="1" opacity=".8" />
          <path d="M0-62V62M-53.7-31 53.7 31M53.7-31-53.7 31" stroke="#5ee7ff" strokeWidth=".6" opacity=".5" />
        </Spin>

        <g clipPath="url(#hud-inner)">
          {links.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9ff4ff" strokeWidth=".6" opacity=".45" />
          ))}
          {nodes.map((n, i) => (
            <circle key={i} cx={n.x} cy={n.y} r={n.r} fill="#e8fdff" opacity={twinkle[i]} />
          ))}
        </g>

        <circle r="70" fill="url(#hud-glow)">
          <animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="2.6s" repeatCount="indefinite" />
        </circle>
        <circle r="7" fill="#f2feff" />
      </svg>
      <div className="hud-label">
        <h1>OPENJARVIS</h1>
        <p>{headline}</p>
      </div>
    </div>
  );
}

function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || prefersReducedMotion()) return;
    const dpr = window.devicePixelRatio || 1;
    let w = 0;
    let h = 0;
    let parts: { x: number; y: number; v: number; s: number; o: number }[] = [];
    const resize = () => {
      w = cv.width = window.innerWidth * dpr;
      h = cv.height = window.innerHeight * dpr;
      parts = Array.from({ length: 140 }, () => ({
        x: rand(0, w), y: rand(0, h), v: rand(0.1, 0.5), s: rand(0.4, 1.8), o: rand(0.15, 0.7),
      }));
    };
    resize();
    window.addEventListener('resize', resize);
    let raf = 0;
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y -= p.v * dpr;
        if (p.y < 0) { p.y = h; p.x = rand(0, w); }
        ctx.fillStyle = `rgba(140,240,255,${p.o})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * dpr, 0, 7);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="hud-particles" />;
}

function Gauge({ value, label }: { value: number; label: string }) {
  const c = 2 * Math.PI * 22;
  return (
    <svg className="hud-gauge" viewBox="0 0 54 54" aria-label={label}>
      <circle className="track" cx="27" cy="27" r="22" />
      <circle className="val" cx="27" cy="27" r="22" strokeDasharray={`${(c * value) / 100} 999`} />
      <text x="27" y="27">{Math.round(value)}%</text>
    </svg>
  );
}

/** Decorative activity: bar heights, gauge jitter and a voice waveform. */
function useActivity(progress: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => {
    const bars = Array.from({ length: 14 }, () => rand(12, 100));
    const t = tick * 0.45;
    let wave = 'M0 32';
    for (let x = 0; x <= 220; x += 4) {
      const env = Math.sin((x / 220) * Math.PI);
      wave += ` L${x} ${32 + env * (Math.sin(x * 0.09 + t) * 12 + Math.sin(x * 0.23 - t * 1.7) * 7)}`;
    }
    return {
      bars,
      wave,
      sync: Math.min(100, progress + rand(-3, 3)),
      load: 20 + progress * 0.5 + rand(-4, 4),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, progress]);
}

export function BootHud({ progress, phase, headline, mode, engine, log, children }: BootHudProps) {
  const act = useActivity(progress);
  const litHexes = Math.round((progress / 100) * 24);

  return (
    <div className={`hud ${mode === 'ready' ? 'is-ready' : ''} ${mode === 'exit' ? 'is-ready is-exit' : ''}`}>
      <div className="hud-bg" />
      <Particles />
      <div className="hud-scan" />

      <Core headline={headline} />

      <section className="hud-panel hud-p-sys">
        <h3>SYSTEM DIAGNOSTICS</h3>
        <div className="hud-gauges">
          <Gauge value={act.load} label="Core load" />
          <Gauge value={act.sync} label="Boot sync" />
          <div className="hud-bars">
            {act.bars.map((b, i) => (
              <i key={i} style={{ height: `${b}%` }} />
            ))}
          </div>
        </div>
        <div className="hud-row" style={{ marginTop: 8 }}>
          <span className="hud-muted">LOAD</span>
          <span className="hud-muted">SYNC</span>
          <span className="hud-muted">ACTIVITY</span>
        </div>
      </section>

      <section className="hud-panel hud-p-engine">
        <h3>INFERENCE ENGINE</h3>
        {engine.map((r) => (
          <div className="hud-row" key={r.label}>
            <span className="hud-muted">{r.label}</span>
            <b className={r.state === 'ok' ? 'hud-ok' : r.state === 'err' ? 'hud-err' : ''}>{r.value}</b>
          </div>
        ))}
      </section>

      <section className="hud-panel hud-p-mem">
        <h3>MEMORY MATRIX</h3>
        <div className="hud-row">
          <span className="hud-muted">SYNC</span>
          <b>{Math.round(progress)}%</b>
        </div>
        <div className="hud-hexes">
          {Array.from({ length: 24 }, (_, i) => (
            <i key={i} className={i < litHexes ? 'on' : ''} />
          ))}
        </div>
      </section>

      <section className="hud-panel hud-p-log">
        <h3>BOOT SEQUENCE</h3>
        <div className="hud-log" role="log" aria-live="polite">
          {log.slice(-8).map((l, i) => (
            <div key={`${l.t}-${i}`}>
              <span className="t">[{l.t.toFixed(2).padStart(6, '0')}]</span>
              {l.text}
              {l.state === 'ok' && <span className="hud-ok"> OK</span>}
              {l.state === 'err' && <span className="hud-err"> FAIL</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="hud-panel hud-p-voice">
        <h3>VOICE INTERFACE</h3>
        <svg className="hud-wave" viewBox="0 0 220 64" preserveAspectRatio="none" aria-hidden="true">
          <path d={act.wave} fill="none" stroke="#5ee7ff" strokeWidth="1.6" />
        </svg>
        <div className="hud-row">
          <span className="hud-muted">AUDIO</span>
          <span className={mode === 'booting' ? 'hud-muted' : 'hud-ok'}>
            {mode === 'booting' ? 'CALIBRATING' : 'READY'}
          </span>
        </div>
      </section>

      {children && <div className="hud-overlay">{children}</div>}

      <div className="hud-progress">
        <div className="track">
          <div className="fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="meta">
          <span>{phase}</span>
          <b>{Math.floor(progress)}%</b>
        </div>
      </div>

      <div className="hud-flash" />
    </div>
  );
}
