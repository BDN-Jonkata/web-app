import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadBackendEnvironment} from './environment.js';

const backendEnv=fileURLToPath(new URL('../.env',import.meta.url));
const legacyEnv=fileURLToPath(new URL('../../.env',import.meta.url));
function load(existing) {
  const calls=[];
  loadBackendEnvironment({fileExists:path=>existing.includes(fileURLToPath(path)),configure:options=>calls.push(options)});
  return calls;
}
test('backend configuration takes precedence over an older root .env without loading both',()=>{
  assert.deepEqual(load([backendEnv,legacyEnv]),[{path:backendEnv}]);
  assert.deepEqual(load([backendEnv]),[{path:backendEnv}]);
});
test('old clones can keep using a root .env until they move it into backend',()=>{
  assert.deepEqual(load([legacyEnv]),[{path:legacyEnv}]);
});
test('no environment file is required when the deployment provides environment variables',()=>{
  assert.deepEqual(load([]),[]);
});
test('loading configuration does not depend on the npm or Prisma working directory',()=>{
  const previous=process.cwd();
  try {
    process.chdir(fileURLToPath(new URL('../../frontend',import.meta.url)));
    assert.deepEqual(load([backendEnv]),[{path:backendEnv}]);
  }finally{process.chdir(previous)}
});
