import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

export function loadBackendEnvironment({fileExists=existsSync,configure=dotenv.config}={}) {
  const backendEnv=new URL('../.env',import.meta.url);
  const legacyEnv=new URL('../../.env',import.meta.url);
  // Keep existing clones working when their ignored .env is still at the old
  // location. An explicit backend/.env takes precedence; never load both.
  const path=fileExists(backendEnv)?backendEnv:legacyEnv;
  if(fileExists(path))configure({path:fileURLToPath(path)});
}
