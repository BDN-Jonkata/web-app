import cors from 'cors';
import express from 'express';
import { apiReference } from '@scalar/express-api-reference';
import { createOpenApiSpec } from './openapi/openapi.js';
import { createAIProvider } from './ai/provider.js';
import { createChatHandler, createChatLimiter } from './chat.js';
import { createAccountRouter, csrfGuard } from './accountRoutes.js';
import { createSimulationRouter } from './simulationRoutes.js';
import authRouter from '../services/auth.js';

export function createApp({
  provider = createAIProvider(),
  simulationRouter = createSimulationRouter(),
  authenticationRouter = authRouter,
  clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  port = Number(process.env.PORT) || 3001,
  openApiSpec,
} = {}) {
  const app = express();
  const spec = openApiSpec || createOpenApiSpec(port);
  app.openApiSpec = spec;

  app.disable('x-powered-by');
  // Trust only operator-configured proxy addresses/ranges, not arbitrary forwarded IPs.
  const trusted=process.env.TRUST_PROXY;
  if(trusted&&trusted!=='true'&&trusted!=='false'&&!/^\d+$/.test(trusted))app.set('trust proxy',trusted.split(',').map(value=>value.trim()));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || origin === clientOrigin || origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`) {
          return callback(null, true);
        }
        const error = new Error('Непозволен origin.');
        error.status = 403;
        callback(error);
      },
    })
  );
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // The JSON API never needs to load anything; the docs pages (/reference) load their own assets.
    if (req.path.startsWith('/api')) res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    next();
  });
  app.use(express.json({ limit: '256kb' }));

  // Root health check endpoint
  app.get('/', (_req, res) => {
    res.send(`Server is healthy and running on port ${port}`);
  });

  // The API map is not public in production unless ENABLE_API_DOCS=true.
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_API_DOCS !== 'true') {
    app.use(['/openapi.json', '/reference', '/docs', '/scalar'], (_req, res) => res.status(404).json({ code: 'NOT_FOUND', error: 'Не е намерено.' }));
  }

  // OpenAPI JSON specification endpoint
  app.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });

  // Scalar API Reference middleware for interactive endpoint testing & documentation
  app.use(
    '/reference',
    apiReference({
      theme: 'purple',
      pageTitle: 'API Reference & Testing',
      spec: {
        content: spec,
      },
    })
  );

  // Redirect common documentation paths to Scalar API Reference
  app.get(['/docs', '/scalar'], (_req, res) => {
    res.redirect('/reference');
  });

  app.use('/api', csrfGuard);
  app.use('/api/auth', authenticationRouter);
  app.use('/api', createAccountRouter());
  app.use('/api/simulation', simulationRouter);
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'energy-bulgaria',
      port,
      timestamp: new Date().toISOString(),
      ai: provider.status(),
    });
  });
  // Per-minute burst limit and an hourly cap per client, plus one overall daily budget for all clients together,
  // so the paid AI quota cannot be drained by one source or by many (CHAT_DAILY_BUDGET, default 2000 requests).
  const dailyBudget = Number(process.env.CHAT_DAILY_BUDGET) > 0 ? Number(process.env.CHAT_DAILY_BUDGET) : 2000;
  app.post('/api/chat', createChatLimiter(), createChatLimiter({ limit: 60, windowMs: 3600000 }),
    createChatLimiter({ limit: dailyBudget, windowMs: 86400000, shared: true }), createChatHandler(provider));

  app.use((error, _req, res, _next) => {
    const status = error.status === 413 ? 413 : error.status === 403 ? 403 : 400;
    res.status(status).json({
      code: 'INVALID_REQUEST',
      error:
        status === 413
          ? 'Заявката е твърде голяма.'
          : status === 403
            ? 'Непозволен достъп до API.'
            : 'Невалидна JSON заявка.',
    });
  });

  return app;
}
