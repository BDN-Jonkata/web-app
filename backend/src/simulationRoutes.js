import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { createChatLimiter } from './chat.js';
import { normalizeSimulationPayload } from '../../shared/simulationContract.js';

export function createInMemorySimulationStore() {
  let activeSimulation = null;
  const clients = new Set();

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch {
        clients.delete(res);
      }
    }
  }

  return {
    get() {
      return activeSimulation;
    },
    set(simulation) {
      activeSimulation = simulation;
      broadcast('update', { active: true, simulation });
      return activeSimulation;
    },
    reset() {
      activeSimulation = null;
      broadcast('reset', { active: false, simulation: null });
    },
    addClient(res) {
      clients.add(res);
    },
    removeClient(res) {
      clients.delete(res);
    },
    clientCount() {
      return clients.size;
    },
  };
}

const MAX_STREAMS = 100;

// When SIMULATION_API_KEY is set, only callers that send it (X-Api-Key) may replace or reset the shared simulation.
// In production the key is mandatory: without one, writes are refused instead of left open to anyone.
function createWriteGuard(apiKey, production) {
  const expected = apiKey ? Buffer.from(apiKey) : null;
  return (req, res, next) => {
    if (!expected) {
      if (!production) return next();
      return res.status(503).json({ code: 'SIMULATION_WRITES_DISABLED', error: 'Записът на симулации е изключен: липсва SIMULATION_API_KEY.' });
    }
    const given = Buffer.from(String(req.get('X-Api-Key') || ''));
    if (given.length === expected.length && timingSafeEqual(given, expected)) return next();
    return res.status(401).json({ code: 'API_KEY_REQUIRED', error: 'Нужен е валиден API ключ за тази операция.' });
  };
}

export function createSimulationRouter({ store = createInMemorySimulationStore(), apiKey = process.env.SIMULATION_API_KEY, writeLimit = 30, production = process.env.NODE_ENV === 'production' } = {}) {
  const router = Router();
  const writeGuard = createWriteGuard(apiKey, production);
  const writeLimiter = createChatLimiter({ limit: writeLimit });

  // Ingest an AI simulation decision / run (supports single frame or multi-frame timeline)
  router.post('/decision', writeLimiter, writeGuard, (req, res) => {
    let normalized;
    try {
      normalized = normalizeSimulationPayload(req.body);
    } catch (error) {
      return res.status(400).json({
        code: 'INVALID_SIMULATION_PAYLOAD',
        error: error.message,
      });
    }

    const saved = store.set(normalized);
    return res.status(200).json({
      success: true,
      message: 'Симулационното решение беше успешно прието.',
      id: saved.id,
      totalSteps: saved.totalSteps,
      isTimeline: saved.isTimeline,
      simulation: saved,
    });
  });

  // Get current active simulation snapshot
  router.get('/state', (_req, res) => {
    const current = store.get();
    return res.status(200).json({
      active: Boolean(current),
      simulation: current,
    });
  });

  // Reset active simulation to empty baseline
  router.post('/reset', writeLimiter, writeGuard, (_req, res) => {
    store.reset();
    return res.status(200).json({
      success: true,
      message: 'Симулацията беше нулирана до изходно състояние.',
    });
  });

  // Server-Sent Events stream for real-time frontend updates
  router.get('/events', (req, res) => {
    if (store.clientCount() >= MAX_STREAMS) {
      return res.status(503).json({ code: 'TOO_MANY_STREAMS', error: 'Твърде много активни връзки. Опитай по-късно.' });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send initial status
    const current = store.get();
    res.write(`event: init\ndata: ${JSON.stringify({ active: Boolean(current), simulation: current })}\n\n`);

    store.addClient(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        store.removeClient(res);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      store.removeClient(res);
    });
  });

  return router;
}
