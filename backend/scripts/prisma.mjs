import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadBackendEnvironment} from '../src/environment.js';

loadBackendEnvironment();
const require=createRequire(import.meta.url);
const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),...process.argv.slice(2)],{
  cwd:fileURLToPath(new URL('..',import.meta.url)),env:process.env,stdio:'inherit'
});
if(result.error)console.error('Could not start Prisma:',result.error.message);
process.exitCode=result.status??1;
