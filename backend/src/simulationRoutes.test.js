import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationRouter, createInMemorySimulationStore } from './simulationRoutes.js';

function createMockReqRes({ method = 'GET', url = '/', body = {}, headers = {} } = {}) {
  let statusCode = 200;
  let responseData = null;
  const responseHeaders = {};
  const listeners = {};
  const writtenChunks = [];

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
    flushHeaders() {},
    write(chunk) {
      writtenChunks.push(chunk);
    },
    getStatus: () => statusCode,
    getData: () => responseData,
    getHeaders: () => responseHeaders,
    getChunks: () => writtenChunks,
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
  const handler = router.stack.find(layer => layer.route?.path === '/decision')?.route.stack.at(-1).handle;
  assert.ok(handler);

  await handler(req, res);
  assert.equal(res.getStatus(), 200);
  assert.equal(res.getData().success, true);
  assert.equal(res.getData().totalSteps, 1);
  assert.equal(res.getData().isTimeline, false);
  assert.equal(store.get()?.prompt, payload.prompt);
  assert.equal(store.get()?.frames[0].stats.res, 1450);
});

test('simulationRoutes: POST /decision ingests multi-step timeline simulations', async () => {
  const store = createInMemorySimulationStore();
  const router = createSimulationRouter({ store });

  const timelinePayload = {
    prompt: '2-step evening ramp simulation',
    decision: { answer: 'Step 0 and step 1 executed.' },
    frames: [
      {
        step: 0,
        hour: 18,
        stats: { res: 1000, demand: 3000 },
        map: { sites: { belovo: { output: 500 } } },
      },
      {
        step: 1,
        hour: 19,
        stats: { res: 1400, demand: 3800 },
        map: { sites: { belovo: { output: 700 } } },
      },
    ],
  };

  const { req, res } = createMockReqRes({ method: 'POST', url: '/decision', body: timelinePayload });
  const handler = router.stack.find(layer => layer.route?.path === '/decision')?.route.stack.at(-1).handle;

  await handler(req, res);
  assert.equal(res.getStatus(), 200);
  assert.equal(res.getData().totalSteps, 2);
  assert.equal(res.getData().isTimeline, true);
});

test('simulationRoutes: POST /decision rejects invalid JSON with 400', async () => {
  const store = createInMemorySimulationStore();
  const router = createSimulationRouter({ store });

  const { req, res } = createMockReqRes({ method: 'POST', url: '/decision', body: { prompt: '' } });
  const handler = router.stack.find(layer => layer.route?.path === '/decision')?.route.stack.at(-1).handle;

  await handler(req, res);
  assert.equal(res.getStatus(), 400);
  assert.equal(res.getData().code, 'INVALID_SIMULATION_PAYLOAD');
});

test('simulationRoutes: POST /reset clears in-memory active simulation idempotently', async () => {
  const store = createInMemorySimulationStore();
  const router = createSimulationRouter({ store });

  store.set({ id: 'test-123', prompt: 'test' });
  assert.ok(store.get());

  const resetHandler = router.stack.find(layer => layer.route?.path === '/reset')?.route.stack.at(-1).handle;

  // First reset
  const mock1 = createMockReqRes({ method: 'POST', url: '/reset' });
  await resetHandler(mock1.req, mock1.res);
  assert.equal(mock1.res.getStatus(), 200);
  assert.equal(store.get(), null);

  // Second reset when already idle (idempotency check)
  const mock2 = createMockReqRes({ method: 'POST', url: '/reset' });
  await resetHandler(mock2.req, mock2.res);
  assert.equal(mock2.res.getStatus(), 200);
  assert.equal(store.get(), null);
});

test('simulationRoutes: GET /events streams SSE events and broadcasts to multiple subscribers', async () => {
  const store = createInMemorySimulationStore();
  const router = createSimulationRouter({ store });

  const eventsHandler = router.stack.find(layer => layer.route?.path === '/events')?.route.stack[0].handle;
  const decisionHandler = router.stack.find(layer => layer.route?.path === '/decision')?.route.stack.at(-1).handle;
  const resetHandler = router.stack.find(layer => layer.route?.path === '/reset')?.route.stack.at(-1).handle;

  // Client 1 connects
  const client1 = createMockReqRes({ method: 'GET', url: '/events' });
  await eventsHandler(client1.req, client1.res);
  assert.equal(client1.res.getHeaders()['Content-Type'], 'text/event-stream');
  assert.equal(store.clientCount(), 1);
  assert.ok(client1.res.getChunks().some(chunk => chunk.includes('event: init')));

  // Client 2 connects
  const client2 = createMockReqRes({ method: 'GET', url: '/events' });
  await eventsHandler(client2.req, client2.res);
  assert.equal(store.clientCount(), 2);

  // Trigger POST /decision: both clients must receive event: update
  const payload = {
    prompt: 'Live SSE broadcast test',
    components: { stats: { res: 500, demand: 800 } },
  };
  const decisionMock = createMockReqRes({ method: 'POST', url: '/decision', body: payload });
  await decisionHandler(decisionMock.req, decisionMock.res);

  assert.ok(client1.res.getChunks().some(chunk => chunk.includes('event: update') && chunk.includes('Live SSE broadcast test')));
  assert.ok(client2.res.getChunks().some(chunk => chunk.includes('event: update') && chunk.includes('Live SSE broadcast test')));

  // Trigger POST /reset: both clients must receive event: reset
  const resetMock = createMockReqRes({ method: 'POST', url: '/reset' });
  await resetHandler(resetMock.req, resetMock.res);

  assert.ok(client1.res.getChunks().some(chunk => chunk.includes('event: reset')));
  assert.ok(client2.res.getChunks().some(chunk => chunk.includes('event: reset')));

  // Client 1 disconnects: client count drops
  client1.req.emit('close');
  assert.equal(store.clientCount(), 1);

  // Client 2 disconnects
  client2.req.emit('close');
  assert.equal(store.clientCount(), 0);
});

test('simulationRoutes: write endpoints require X-Api-Key when SIMULATION_API_KEY is configured', async () => {
  const store = createInMemorySimulationStore();
  const router = createSimulationRouter({ store, apiKey: 'secret-key-123' });
  const route = path => router.stack.find(layer => layer.route?.path === path).route.stack;
  const run = async (stack, ctx) => {
    for (const layer of stack) {
      let next = false;
      await layer.handle(ctx.req, ctx.res, () => { next = true; });
      if (!next) return;
    }
  };

  const denied = createMockReqRes({ method: 'POST', url: '/reset', headers: { 'x-api-key': 'wrong' } });
  await run(route('/reset'), denied);
  assert.equal(denied.res.getStatus(), 401);
  assert.equal(denied.res.getData().code, 'API_KEY_REQUIRED');

  const missing = createMockReqRes({ method: 'POST', url: '/reset' });
  await run(route('/reset'), missing);
  assert.equal(missing.res.getStatus(), 401);

  const allowed = createMockReqRes({ method: 'POST', url: '/reset', headers: { 'x-api-key': 'secret-key-123' } });
  await run(route('/reset'), allowed);
  assert.equal(allowed.res.getStatus(), 200);
});

test('simulationRoutes: stream count is capped', async () => {
  const store = createInMemorySimulationStore();
  for (let i = 0; i < 100; i++) store.addClient({ write() {} });
  const router = createSimulationRouter({ store });
  const { req, res } = createMockReqRes({ url: '/events' });
  router.stack.find(layer => layer.route?.path === '/events').route.stack[0].handle(req, res);
  assert.equal(res.getStatus(), 503);
  assert.equal(res.getData().code, 'TOO_MANY_STREAMS');
});

test('simulationRoutes: in production, writes are refused unless an API key is configured', async () => {
  const router = createSimulationRouter({ store: createInMemorySimulationStore(), production: true, apiKey: '' });
  const stack = router.stack.find(layer => layer.route?.path === '/reset').route.stack;
  const { req, res } = createMockReqRes({ method: 'POST', url: '/reset' });
  let passed = false;
  await stack[0].handle(req, res, () => {});
  await stack[1].handle(req, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.getStatus(), 503);
  assert.equal(res.getData().code, 'SIMULATION_WRITES_DISABLED');
});
