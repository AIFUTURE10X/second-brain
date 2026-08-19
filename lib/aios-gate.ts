// aios-notify-gate.ts — ask Phil's AI OS before sending him a Telegram message.
//
// One policy for every bot (mute, quiet hours 22:00–07:00 Bangkok, priority) and one
// delivery ledger, both on https://ai-os-mission-control.vercel.app/automations. The AI OS
// records the message either way; `allow: false` means it is muted there, or held for
// morning delivery by the AI OS itself — so do NOT send. FAIL OPEN: if the gate is not
// configured, unreachable, or slow, send as before — availability beats silence.
//
// Env: AIOS_NOTIFY_GATE_URL (…/api/notify/gate) and AIOS_NOTIFY_GATE_KEY.
export type GateVerdict = { allow: boolean; verdict: 'allow' | 'hold' | 'suppress' | 'open'; reason: string };

export async function aiosNotifyGate(
  source: string,
  body: string,
  opts: { bot?: string; display_name?: string; schedule?: string; project?: string; priority?: 'P0' | 'P1' | 'P2' | 'P3'; template?: string } = {},
): Promise<GateVerdict> {
  const url = process.env.AIOS_NOTIFY_GATE_URL;
  const key = process.env.AIOS_NOTIFY_GATE_KEY;
  if (!url || !key) return { allow: true, verdict: 'open', reason: 'gate not configured' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ source, body, ...opts }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { allow: true, verdict: 'open', reason: `gate http ${res.status}` };
    const data = (await res.json()) as Partial<GateVerdict>;
    if (typeof data.allow !== 'boolean') return { allow: true, verdict: 'open', reason: 'gate malformed' };
    return { allow: data.allow, verdict: (data.verdict as GateVerdict['verdict']) ?? 'allow', reason: data.reason ?? '' };
  } catch (err) {
    return { allow: true, verdict: 'open', reason: `gate unreachable: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}
