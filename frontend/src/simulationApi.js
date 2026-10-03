import { normalizeSimulationPayload } from '../../shared/simulationContract.js';

export async function fetchSimulationState({ signal } = {}) {
  try {
    const res = await fetch('/api/simulation/state', {
      headers: { 'X-Requested-With': 'energy-web-app' },
      signal,
    });
    if (!res.ok) throw new Error('Failed to fetch simulation state');
    return await res.json();
  } catch (err) {
    if (signal?.aborted) return null;
    return { active: false, simulation: null };
  }
}

export async function sendSimulationDecision(payload, { signal } = {}) {
  const normalized = normalizeSimulationPayload(payload);
  const res = await fetch('/api/simulation/decision', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'energy-web-app',
    },
    body: JSON.stringify(normalized),
    signal,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Грешка при изпращане на симулацията.');
  }
  return await res.json();
}

export async function resetSimulation({ signal } = {}) {
  const res = await fetch('/api/simulation/reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'energy-web-app',
    },
    signal,
  });
  if (!res.ok) throw new Error('Грешка при нулиране на симулацията.');
  return await res.json();
}

export function subscribeSimulationEvents(onEvent) {
  if (typeof window === 'undefined' || !window.EventSource) return () => {};
  const es = new EventSource('/api/simulation/events');

  es.addEventListener('init', e => {
    try {
      const data = JSON.parse(e.data);
      onEvent({ type: 'init', ...data });
    } catch {}
  });

  es.addEventListener('update', e => {
    try {
      const data = JSON.parse(e.data);
      onEvent({ type: 'update', ...data });
    } catch {}
  });

  es.addEventListener('reset', () => {
    onEvent({ type: 'reset', active: false, simulation: null });
  });

  return () => {
    es.close();
  };
}

// Global browser window hooks for agent scripts, tests, and manual developer inputs
if (typeof window !== 'undefined') {
  window.setSimulationData = async function (json) {
    return await sendSimulationDecision(json);
  };
  window.resetSimulation = async function () {
    return await resetSimulation();
  };
}
