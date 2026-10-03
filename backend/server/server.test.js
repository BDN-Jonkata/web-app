import test from 'node:test';
import assert from 'node:assert/strict';
import { app, openApiSpec } from './server.js';
import authServiceRouter from '../services/auth.js';

test('server endpoints and scalar integration', async (t) => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  await t.test('GET / returns health check string', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /Server is healthy and running/);
  });

  await t.test('GET /api/health returns JSON health status', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    const json = await res.json();
    assert.equal(json.status, 'ok');
    assert.equal(typeof json.port, 'number');
    assert.ok(json.timestamp);
  });

  await t.test('GET /openapi.json returns OpenAPI 3.1.0 document with all auth and API paths', async () => {
    const res = await fetch(`${baseUrl}/openapi.json`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    const spec = await res.json();
    assert.equal(spec.openapi, '3.1.0');
    assert.ok(spec.info?.title);
    assert.ok(spec.paths['/']);
    assert.ok(spec.paths['/api/health']);
    assert.ok(spec.paths['/api/chat']);

    // Check all services/auth.js endpoints are present in Scalar OpenAPI
    assert.ok(spec.paths['/api/auth/register']);
    assert.ok(spec.paths['/api/auth/login']);
    assert.ok(spec.paths['/api/auth/logout']);
    assert.ok(spec.paths['/api/auth/refresh-token']);
    assert.ok(spec.paths['/api/auth/forgot-password']);

    // Check additional session and history endpoints
    assert.ok(spec.paths['/api/auth/session']);
    assert.ok(spec.paths['/api/auth/preferences']);
    assert.ok(spec.paths['/api/conversations']);
    assert.ok(spec.paths['/api/conversations/{id}']);
  });

  await t.test('GET /reference returns Scalar HTML document for endpoint testing', async () => {
    const res = await fetch(`${baseUrl}/reference`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
    const html = await res.text();
    assert.match(html, /@scalar\/api-reference/);
    assert.match(html, /createApiReference/);
  });

  await t.test('GET /docs and GET /scalar redirect to /reference', async () => {
    const resDocs = await fetch(`${baseUrl}/docs`, { redirect: 'manual' });
    assert.equal(resDocs.status, 302);
    assert.equal(resDocs.headers.get('location'), '/reference');

    const resScalar = await fetch(`${baseUrl}/scalar`, { redirect: 'manual' });
    assert.equal(resScalar.status, 302);
    assert.equal(resScalar.headers.get('location'), '/reference');
  });

  await t.test('POST /api/auth/forgot-password responds to Scalar test requests', async () => {
    const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'energy-web-app',
      },
      body: JSON.stringify({ email: 'test@example.test' }),
    });
    // In test environment without DB, it safely returns 200 or 503 DATABASE_UNAVAILABLE, not 404
    assert.ok([200, 503].includes(res.status));
    const json = await res.json();
    if (res.status === 200) {
      assert.equal(json.ok, true);
    } else {
      assert.equal(json.code, 'DATABASE_UNAVAILABLE');
    }
  });

  await t.test('POST /api/auth/refresh-token rejects empty token with 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'energy-web-app',
      },
      body: JSON.stringify({ token: '' }),
    });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.code, 'INVALID_TOKEN');
  });

  await t.test('backend/services/auth.js exports an active router module', () => {
    assert.ok(authServiceRouter);
    assert.equal(typeof authServiceRouter, 'function');
  });
});
