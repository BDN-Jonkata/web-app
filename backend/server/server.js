import express from 'express';
import cors from 'cors';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { apiReference } from '@scalar/express-api-reference';
import { createOpenApiSpec } from './openapi.js';

const app = express();
const port = Number(process.env.PORT) || 3000;
const openApiSpec = createOpenApiSpec(port);

app.use(cors());
app.use(express.json());

// Expose OpenAPI 3.1.0 specification JSON
app.get('/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

// Root health check endpoint
app.get('/', (req, res) => {
  res.send(`Server is healthy and running on port ${port}`);
});

// JSON health check endpoint for API consumers & testing
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    port,
    timestamp: new Date().toISOString(),
  });
});

// Scalar API Reference middleware for interactive endpoint testing & documentation
app.use(
  '/reference',
  apiReference({
    theme: 'purple',
    pageTitle: 'API Reference & Testing',
    spec: {
      content: openApiSpec,
    },
  })
);

// Redirect common documentation paths to the Scalar API reference interface
app.get(['/docs', '/scalar'], (req, res) => {
  res.redirect('/reference');
});

function openInBrowser(url) {
  const cmd = process.platform === 'win32'
    ? `start ${url}`
    : process.platform === 'darwin'
      ? `open ${url}`
      : `xdg-open ${url}`;
  exec(cmd, () => {});
}

export function startServer(listenPort = port) {
  const server = app.listen(listenPort, () => {
    console.log(`Server is running on port ${listenPort}`);
    console.log(`Scalar API Reference: http://localhost:${listenPort}/reference`);
    console.log(`OpenAPI Spec:         http://localhost:${listenPort}/openapi.json`);

    if (process.argv.includes('--open') || process.env.OPEN_SCALAR === 'true') {
      openInBrowser(`http://localhost:${listenPort}/reference`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${listenPort} is already in use. Set PORT=<other_port> or stop the existing process.`);
    } else {
      console.error('Server error:', err);
    }
  });

  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  startServer();
}

export { app, openApiSpec };
