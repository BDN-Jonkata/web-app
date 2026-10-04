import { execFile } from 'node:child_process';
import { createApp } from './app.js';
import { loadBackendEnvironment } from './environment.js';
import {createEmailAuthService} from './emailAuth.js';

// Resolve backend/.env independently of where npm was started.
loadBackendEnvironment();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const app = createApp({ port });

function openInBrowser(url) {
  // Arguments are passed as an array, never through a shell, so HOST/PORT values cannot inject commands.
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  execFile(command, args, () => {});
}

const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
if (!loopback && process.env.NODE_ENV !== 'production' && process.env.COOKIE_SECURE !== 'true') {
  console.warn('WARNING: listening on a non-local address without NODE_ENV=production or COOKIE_SECURE=true; session cookies will be sent without the Secure flag.');
}
if (process.env.NODE_ENV === 'production' && !process.env.SIMULATION_API_KEY) {
  console.warn('WARNING: SIMULATION_API_KEY is not set; simulation updates are disabled in production.');
}

app.listen(port, host, () => {
  console.log(`Energy Bulgaria API listening on http://${host}:${port}`);
  console.log(`Scalar API Reference: http://${host}:${port}/reference`);
  console.log(`OpenAPI Spec:         http://${host}:${port}/openapi.json`);

  if (process.argv.includes('--open') || process.env.OPEN_SCALAR === 'true') {
    openInBrowser(`http://${host}:${port}/reference`);
  }
});

// Password-change alerts survive SMTP failures and are retried after a restart.
const emailAuth=createEmailAuthService();
let delivering=false;
const notificationTimer=setInterval(async()=>{
  if(delivering)return;
  delivering=true;
  try{await emailAuth.deliverPendingNotifications()}
  catch{/* Missing PostgreSQL/migrations must not crash the guest dashboard. */}
  finally{delivering=false}
},60000);
notificationTimer.unref();
