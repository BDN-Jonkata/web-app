import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=path=>readFileSync(resolve(root,path),'utf8');
const json=path=>JSON.parse(read(path));
function modules(directory) {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(['node_modules','dist'].includes(entry.name))return [];
    const path=resolve(directory,entry.name);
    return entry.isDirectory()?modules(path):/\.(?:js|jsx|mjs)$/.test(entry.name)?[path]:[];
  });
}

test('the applications have one frontend and one backend, without duplicate legacy folders',()=>{
  for(const directory of ['frontend','backend','shared'])assert.ok(existsSync(resolve(root,directory)),directory);
  for(const directory of ['client','server'])assert.equal(existsSync(resolve(root,directory)),false,directory);
});
test('all UI entry points, map assets, fonts and frontend tools live in frontend',()=>{
  for(const path of ['frontend/index.html','frontend/vite.config.js','frontend/src/main.jsx','frontend/src/App.jsx',
    'frontend/src/useDictation.js','frontend/src/speechRecognition.js','frontend/src/styles.css',
    'frontend/public/assets/bulgaria-geographic.png','frontend/public/fonts/golos-cyrillic.woff2',
    'frontend/src/data/bulgaria-boundary.json','frontend/scripts/render-map.mjs'])assert.ok(existsSync(resolve(root,path)),path);
});
test('Express, AI adapters, database configuration and Prisma files live in backend',()=>{
  for(const path of ['backend/src/index.js','backend/src/app.js','backend/src/database.js','backend/src/accountRoutes.js',
    'backend/src/ai/provider.js','backend/src/ai/groq.js','backend/src/environment.js','backend/scripts/prisma.mjs',
    'backend/prisma/schema.prisma','backend/prisma/migrations/20261003000000_accounts_history/migration.sql',
    'backend/.env.example'])assert.ok(existsSync(resolve(root,path)),path);
  assert.match(read('.gitignore'),/^\.env$/m);
  assert.match(read('backend/.env.example'),/^GROQ_API_KEY=$/m);
});
test('local module imports still resolve after renaming the application folders',()=>{
  let checked=0;
  for(const directory of ['frontend','backend','shared'])for(const file of modules(resolve(root,directory))){
    const source=readFileSync(file,'utf8');
    for(const match of source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g)){
      const target=resolve(dirname(file),match[1]);checked++;
      assert.ok([target,target+'.js',target+'.jsx',target+'.mjs'].some(existsSync),file+' imports '+match[1]);
    }
  }
  assert.ok(checked>30,'Checked the shared contracts and both application import graphs');
});
test('frontend runtime code does not depend on backend implementation files',()=>{
  for(const file of modules(resolve(root,'frontend/src'))){
    const source=readFileSync(file,'utf8');
    assert.doesNotMatch(source,/(?:from\s+|import\s*\()['"][^'"]*\/(?:backend|server)\//,file);
  }
  assert.match(read('frontend/src/energy.js'),/\.\.\/\.\.\/shared\/energy\.js/);
  assert.match(read('backend/src/ai/context.js'),/\.\.\/\.\.\/\.\.\/shared\/energy\.js/);
});
test('npm entry points target the new folders and Prisma uses the backend configuration loader',()=>{
  const scripts=json('package.json').scripts;
  assert.equal(scripts['dev:frontend'],'npm run dev --prefix frontend');
  assert.equal(scripts['dev:backend'],'npm run dev --prefix backend');
  assert.match(scripts.dev,/dev:backend/);assert.match(scripts.dev,/dev:frontend/);
  assert.equal(scripts.build,'npm run build --prefix frontend');
  assert.equal(scripts.start,'npm run start --prefix backend');
  for(const value of Object.values(scripts))assert.doesNotMatch(value,/--prefix (?:client|server)\b/);
  for(const [script,command] of [['db:generate','generate'],['db:push','db push'],['db:migrate','migrate deploy']]){
    assert.equal(scripts[script],'npm run '+script+' --prefix backend');
    assert.equal(json('backend/package.json').scripts[script],'node scripts/prisma.mjs '+command);
  }
  assert.match(read('backend/src/index.js'),/loadBackendEnvironment\(\)/);
  assert.match(read('backend/scripts/prisma.mjs'),/loadBackendEnvironment\(\)/);
});
test('package names and dependency lockfile metadata agree in every folder',()=>{
  for(const directory of ['','frontend/','backend/']){
    const manifest=json(directory+'package.json'),lock=json(directory+'package-lock.json');
    assert.equal(lock.name,manifest.name);
    assert.equal(lock.packages[''].name,manifest.name);
    assert.deepEqual(lock.packages[''].dependencies||{},manifest.dependencies||{});
    assert.deepEqual(lock.packages[''].devDependencies||{},manifest.devDependencies||{});
  }
});
