import { exec } from 'node:child_process';
import { createApp } from './app.js';
import { loadBackendEnvironment } from './environment.js';
import {createEmailAuthService} from './emailAuth.js';

// Resolve backend/.env independently of where npm was started.
loadBackendEnvironment();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const app = createApp({ port });

function openInBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? `start ${url}`
      : process.platform === 'darwin'
        ? `open ${url}`
        : `xdg-open ${url}`;
  exec(cmd, () => {});
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
