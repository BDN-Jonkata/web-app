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
  clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  port = Number(process.env.PORT) || 3001,
  openApiSpec,
} = {}) {
  const app = express();
  const spec = openApiSpec || createOpenApiSpec(port);
  app.openApiSpec = spec;

  app.disable('x-powered-by');
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
  app.use(express.json({ limit: '256kb' }));

  // Root health check endpoint
  app.get('/', (_req, res) => {
    res.send(`Server is healthy and running on port ${port}`);
  });

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
  app.use('/api/auth', authRouter);
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
  app.post('/api/chat', createChatLimiter(), createChatHandler(provider));

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
