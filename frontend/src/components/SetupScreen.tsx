import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSetupStatus,
  fetchModels,
  fetchRecommendedModel,
  resetInferenceSource,
  type SetupStatus,
} from '../lib/api';
import { useAppStore } from '../lib/store';
import { isEmbedOnlyModel } from '../lib/model-capabilities';
import { InferenceRecoveryButton, InferenceSourceSetup } from './InferenceSourceSetup';
import { BootHud, type BootEngineRow, type BootLogLine } from './BootHud';

type StepKey = 'ollama_ready' | 'model_ready' | 'server_ready';

const STEP_LOG: Record<StepKey, { ollama: string; custom: string }> = {
  ollama_ready: { ollama: 'Inference engine (Ollama) online', custom: 'Connected to custom AI server' },
  model_ready: { ollama: 'AI model loaded', custom: 'Endpoint verified' },
  server_ready: { ollama: 'API server online', custom: 'API server online' },
};

const PHASE_LABEL: Record<StepKey, string> = {
  ollama_ready: 'ENGINE',
  model_ready: 'MODEL',
  server_ready: 'API SERVER',
};

/** How long the "all systems online" flash plays before the app takes over. */
const READY_FLASH_MS = 1100;
const EXIT_FADE_MS = 700;

export function SetupScreen({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [setupInitiated, setSetupInitiated] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [mode, setMode] = useState<'booting' | 'ready' | 'exit'>('booting');
  const [readyModel, setReadyModel] = useState('');
  const handedOffRef = useRef(false);
  const handoffTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Boot log + progress state live up here so a source reset can rewind them.
  const startRef = useRef(performance.now());
  const [log, setLog] = useState<BootLogLine[]>(() => [{ t: 0, text: 'Bootstrapping OpenJarvis desktop' }]);
  const seenRef = useRef<{ detail: string; error: string; steps: Set<StepKey> }>({
    detail: '',
    error: '',
    steps: new Set(),
  });
  const [progress, setProgress] = useState(0);

  useEffect(() => () => handoffTimersRef.current.forEach(clearTimeout), []);

  const poll = useCallback(async () => {
    const s = await getSetupStatus();
    if (s) setStatus(s);
    setStatusChecked(true);
    if (s?.phase === 'ready' && !handedOffRef.current) {
      handedOffRef.current = true;
      // Pre-select a model BEFORE handing off so the chat is usable on
      // first send. Without this, the main app's post-mount fetch can
      // lose a race to a fast first message and Ollama 400s.
      try {
        const [models, rec] = await Promise.all([
          fetchModels().catch(() => []),
          fetchRecommendedModel().catch(() => ({ model: '', reason: '' })),
        ]);
        const store = useAppStore.getState();
        const hadSelection = !!store.selectedModel;
        store.setModels(models);
        store.setModelsLoading(false);
        const chatModels = models.filter((m) => !isEmbedOnlyModel(m.id));
        const recommended = rec.model && chatModels.some((m) => m.id === rec.model)
          ? rec.model
          : chatModels[0]?.id || '';
        if (recommended && !hadSelection) {
          store.setSelectedModel(recommended);
        }
        setReadyModel(useAppStore.getState().selectedModel || recommended);
      } catch {
        // Non-fatal: store.setModels auto-selects on later fetch, and
        // the InputArea guards the empty-model case with a toast.
      }
      setMode('ready');
      handoffTimersRef.current.push(
        setTimeout(() => setMode('exit'), READY_FLASH_MS),
        setTimeout(() => onReady(), READY_FLASH_MS + EXIT_FADE_MS),
      );
    }
  }, [onReady]);

  const changeInferenceSource = useCallback(async () => {
    setRecovering(true);
    setRecoveryError('');
    try {
      await resetInferenceSource();
      handedOffRef.current = false;
      setMode('booting');
      // Rewind the HUD so the new source's steps are logged and counted afresh.
      seenRef.current = { detail: '', error: '', steps: new Set() };
      setProgress(0);
      setLog((l) => [
        ...l,
        { t: (performance.now() - startRef.current) / 1000, text: 'Inference source reset' },
      ]);
      setSetupInitiated(false);
      setStatus(null);
      await poll();
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecovering(false);
    }
  }, [poll]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 800);
    return () => clearInterval(interval);
  }, [poll]);

  // ---- boot log built from real status transitions
  useEffect(() => {
    if (!status) return;
    const t = (performance.now() - startRef.current) / 1000;
    const seen = seenRef.current;
    const add: BootLogLine[] = [];
    const custom = status.source === 'custom';
    (['ollama_ready', 'model_ready', 'server_ready'] as StepKey[]).forEach((k) => {
      if (status[k] && !seen.steps.has(k)) {
        seen.steps.add(k);
        add.push({ t, text: STEP_LOG[k][custom ? 'custom' : 'ollama'], state: 'ok' });
      }
    });
    if (status.detail && status.detail !== seen.detail && status.phase !== 'ready') {
      seen.detail = status.detail;
      add.push({ t, text: status.detail });
    }
    if (status.error && status.error !== seen.error) {
      seen.error = status.error;
      add.push({ t, text: status.error.split('\n')[0], state: 'err' });
    }
    if (add.length) setLog((l) => [...l, ...add].slice(-30));
  }, [status]);

  // ---- smoothed progress: each finished step is a third; creep inside the active one
  const doneSteps =
    (status?.ollama_ready ? 1 : 0) + (status?.model_ready ? 1 : 0) + (status?.server_ready ? 1 : 0);
  const target = mode !== 'booting' || status?.phase === 'ready' ? 100 : (doneSteps / 3) * 100;
  const ceiling = mode !== 'booting' ? 100 : Math.min(99, target + 30);
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => {
        if (p < target) return Math.min(target, p + Math.max(0.8, (target - p) * 0.12));
        if (!status?.error && p < ceiling) return Math.min(ceiling, p + 0.08);
        return p;
      });
    }, 60);
    return () => clearInterval(id);
  }, [target, ceiling, status?.error]);

  if (statusChecked && status?.requires_source && !setupInitiated) {
    return (
      <InferenceSourceSetup
        onStarted={() => {
          setSetupInitiated(true);
          void poll();
        }}
      />
    );
  }

  const custom = status?.source === 'custom';
  const activeStep: StepKey | null =
    status && !status.ollama_ready
      ? 'ollama_ready'
      : status && !status.model_ready
        ? 'model_ready'
        : status && !status.server_ready
          ? 'server_ready'
          : null;

  const rowState = (k: StepKey): BootEngineRow['state'] =>
    status?.[k] ? 'ok' : status?.error && activeStep === k ? 'err' : 'wait';
  const rowValue = (k: StepKey, okText: string) =>
    status?.[k] ? okText : status?.error && activeStep === k ? 'FAILED' : activeStep === k ? 'STARTING…' : 'STANDBY';

  const engine: BootEngineRow[] = [
    { label: 'ENGINE', value: rowValue('ollama_ready', custom ? 'CUSTOM' : 'OLLAMA'), state: rowState('ollama_ready') },
    { label: custom ? 'ENDPOINT' : 'MODEL', value: rowValue('model_ready', readyModel || 'LOADED'), state: rowState('model_ready') },
    { label: 'API SERVER', value: rowValue('server_ready', 'ONLINE'), state: rowState('server_ready') },
  ];

  const headline = status?.error
    ? 'STARTUP INTERRUPTED'
    : mode !== 'booting'
      ? 'ALL SYSTEMS ONLINE'
      : !statusChecked
        ? 'CHECKING SAVED SETUP'
        : `INITIALIZING · ${Math.floor(progress)}%`;
  const phase = status?.error
    ? 'ERROR'
    : mode !== 'booting'
      ? 'ONLINE'
      : activeStep
        ? PHASE_LABEL[activeStep]
        : 'CORE';

  const showRecovery = statusChecked && status && !status.requires_source && status.phase !== 'ready';
  const overlay =
    status?.error || recoveryError || showRecovery ? (
      <>
        {status?.error && <div className="hud-error">{status.error}</div>}
        {recoveryError && (
          <div role="alert" className="hud-error" style={{ marginTop: 8 }}>
            {recoveryError}
          </div>
        )}
        {showRecovery && (
          <InferenceRecoveryButton recovering={recovering} onChange={() => void changeInferenceSource()} />
        )}
      </>
    ) : null;

  return (
    <BootHud progress={progress} phase={phase} headline={headline} mode={mode} engine={engine} log={log}>
      {overlay}
    </BootHud>
  );
}
