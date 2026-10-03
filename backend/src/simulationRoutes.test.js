import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationRouter, createInMemorySimulationStore } from './simulationRoutes.js';

function createMockReqRes({ method = 'GET', url = '/', body = {}, headers = {} } = {}) {
  let statusCode = 200;
  let responseData = null;
  const responseHeaders = {};
  const listeners = {};

  const req = {
    method,
    url,
    body,
    headers,
    get: name => headers[name.toLowerCase()] || '',
    on: (evt, cb) => {
      listeners[evt] = cb;
    },
    emit: (evt, data) => {
      listeners[evt]?.(data);
    },
  };

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseData = data;
      return res;
    },
    setHeader(key, value) {
      responseHeaders[key] = value;
    },
    write(_chunk) {},
    getStatus: () => statusCode,
    getData: () => responseData,
    getHeaders: () => responseHeaders,
  };

  return { req, res };
}

test('simulationRoutes: GET /state returns empty active:false when nothing loaded', async () => {
  const store = createInMemorySimulationStore();
  const router = createSimulationRouter({ store });

  const { req, res } = createMockReqRes({ method: 'GET', url: '/state' });
  const handler = router.stack.find(layer => layer.route?.path === '/state')?.route.stack[0].handle;
  assert.ok(handler);

  await handler(req, res);
  assert.equal(res.getStatus(), 200);
  assert.deepEqual(res.getData(), { active: false, simulation: null });
});

test('simulationRoutes: POST /decision validates and ingests simulation JSON', async () => {
  const store = createInMemorySimulationStore();
  const router = createSimulationRouter({ store });

  const payload = {
    prompt: 'Winter cold snap with Belovo peaking dispatch',
    decision: {
      answer: 'Belovo hydro dispatched at 736 MW.',
      summary: 'Hydro covers evening peak.',
    },
    components: {
      stats: {
        res: 1450,
        demand: 4276,
        mw: { solar: 0, wind: 76, hydro: 1339, other: 35 },
      },
      map: {
        sites: {
          belovo: { output: 736.2 },
        },
        cities: {
          sofia: { demand: 1546, resReceived: 380 },
        },
      },
    },
  };

  const { req, res } = createMockReqRes({ method: 'POST', url: '/decision', body: payload });
  const handler = router.stack.find(layer => layer.route?.path === '/decision')?.route.stack[0].handle;
  assert.ok(handler);

  await handler(req, res);
  assert.equal(res.getStatus(), 200);
  assert.equal(res.getData().success, true);
  assert.equal(res.getData().totalSteps, 1);
  assert.equal(store.get()?.prompt, payload.prompt);
  assert.equal(store.get()?.frames[0].stats.res, 1450);
});

test('simulationRoutes: POST /decision rejects invalid JSON with 400', async () => {
  const store = createInMemorySimulationStore();
  const router = createSimulationRouter({ store });

  const { req, res } = createMockReqRes({ method: 'POST', url: '/decision', body: { prompt: '' } });
  const handler = router.stack.find(layer => layer.route?.path === '/decision')?.route.stack[0].handle;

  await handler(req, res);
  assert.equal(res.getStatus(), 400);
  assert.equal(res.getData().code, 'INVALID_SIMULATION_PAYLOAD');
});

test('simulationRoutes: POST /reset clears in-memory active simulation', async () => {
  const store = createInMemorySimulationStore();
  const router = createSimulationRouter({ store });

  store.set({ id: 'test-123', prompt: 'test' });
  assert.ok(store.get());

  const { req, res } = createMockReqRes({ method: 'POST', url: '/reset' });
  const handler = router.stack.find(layer => layer.route?.path === '/reset')?.route.stack[0].handle;

  await handler(req, res);
  assert.equal(res.getStatus(), 200);
  assert.equal(store.get(), null);
});
