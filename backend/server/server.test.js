import test from 'node:test';
import assert from 'node:assert/strict';
import { app, openApiSpec } from './server.js';

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

  await t.test('GET /openapi.json returns OpenAPI 3.1.0 document', async () => {
    const res = await fetch(`${baseUrl}/openapi.json`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    const spec = await res.json();
    assert.equal(spec.openapi, '3.1.0');
    assert.ok(spec.info?.title);
    assert.ok(spec.paths['/']);
    assert.ok(spec.paths['/api/health']);
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
});
