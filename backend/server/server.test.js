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

    assert.ok(spec.paths['/api/auth/register']);
    assert.ok(spec.paths['/api/auth/login']);
    assert.ok(spec.paths['/api/auth/logout']);
    assert.ok(spec.paths['/api/auth/refresh-token']);
    assert.ok(spec.paths['/api/auth/reset-password']);

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

  await t.test('OpenAPI spec documents bearerAuth and token property in register/login responses for Scalar', () => {
    assert.ok(openApiSpec.components?.securitySchemes?.bearerAuth);
    assert.equal(openApiSpec.components.securitySchemes.bearerAuth.type, 'http');
    assert.equal(openApiSpec.components.securitySchemes.bearerAuth.scheme, 'bearer');

    const registerSchema =
      openApiSpec.paths['/api/auth/register'].post.responses['201'].content['application/json'].schema;
    assert.ok(registerSchema.properties.token, 'Register response schema should include token');

    const loginSchema =
      openApiSpec.paths['/api/auth/login'].post.responses['200'].content['application/json'].schema;
    assert.ok(loginSchema.properties.token, 'Login response schema should include token');

    const regPasswordSchema =
      openApiSpec.paths['/api/auth/register'].post.requestBody.content['application/json'].schema.properties.password;
    assert.equal(regPasswordSchema.minLength, 6);
    assert.equal(regPasswordSchema.maxLength, 30);

    assert.equal(openApiSpec.paths['/api/auth/send-verification-email'], undefined);
    assert.equal(openApiSpec.paths['/api/auth/verify-email'], undefined);
    assert.equal(openApiSpec.paths['/api/auth/forgot-password'], undefined);
    assert.ok(openApiSpec.paths['/api/auth/reset-password']);
  });

  await t.test('POST /api/auth/reset-password rejects short password with 400', async () => {
    const res = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'energy-web-app',
      },
      body: JSON.stringify({ token: 'some_token', password: '123' }),
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.code, 'INVALID_PASSWORD');
  });

  await t.test('backend/services/auth.js exports an active router module', () => {
    assert.ok(authServiceRouter);
    assert.equal(typeof authServiceRouter, 'function');
  });
});
