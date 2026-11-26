import { apiFetch } from './api';

/**
 * Launch briefing written by Claude to ~/.openjarvis/briefing.json each time
 * the user runs "자비스". Every section is optional so a partial file still renders.
 */
export interface Briefing {
  /** Changes whenever Claude writes a new briefing; saved checks are keyed to it. */
  id?: string;
  updatedAt?: string;
  device?: string;
  ledger?: {
    caption?: string;
    boxes?: { label: string; amount: string; sub?: string }[];
    receivables?: { title: string; items: { name: string; date?: string; amount?: string }[] };
    rows?: { label: string; value: string; warn?: boolean }[];
    note?: string;
  };
  market?: {
    caption?: string;
    indices?: { name: string; value: string; change: number; unit?: '%' | '원' }[];
    note?: string;
  };
  today?: { headline?: string; next?: string };
  priority?: { caption?: string; items: CheckItem[] };
  schedule?: { caption?: string; days: { date: string; weekday: string; today?: boolean; entries: { time?: string; text: string; detail?: string }[] }[] };
  handover?: { title?: string; groups: { title: string; items: CheckItem[] }[] };
}

export interface CheckItem {
  id: string;
  title: string;
  tag?: string;
  detail?: string;
  done?: boolean;
}

export interface BriefingState {
  briefingId?: string;
  checks: Record<string, boolean>;
  memo: string;
  savedAt?: string;
}

export async function fetchBriefing(): Promise<{ briefing: Briefing | null; state: BriefingState }> {
  const res = await apiFetch('/v1/briefing');
  if (!res.ok) throw new Error(`Failed to fetch briefing: ${res.status}`);
  const data = await res.json();
  return { briefing: data.briefing ?? null, state: { checks: {}, memo: '', ...data.state } };
}

export async function saveBriefingState(state: BriefingState): Promise<void> {
  const res = await apiFetch('/v1/briefing/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`Failed to save briefing state: ${res.status}`);
}
