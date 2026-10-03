import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createOpenApiSpec } from '../src/openapi/openapi.js';

const port = Number(process.env.PORT) || 3001;
const openApiSpec = createOpenApiSpec(port);
const app = createApp({ port, openApiSpec });

function openInBrowser(url) {
  const cmd =
    process.platform === 'win32'
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

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  startServer();
}

export { app, openApiSpec };
