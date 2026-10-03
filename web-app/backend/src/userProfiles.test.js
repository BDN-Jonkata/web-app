import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const schema=readFileSync(new URL('../prisma/schema.prisma',import.meta.url),'utf8');
const migration=readFileSync(new URL('../prisma/migrations/20261003101500_user_profiles/migration.sql',import.meta.url),'utf8');
const model=name=>schema.match(new RegExp('model '+name+' \\{([\\s\\S]*?)\\n\\}'))?.[1]||'';

test('user profile additions retain hash-only passwords and safe defaults',()=>{
  const user=model('User');
  for(const field of ['username','realName','phoneNumber','avatarUrl','bio'])assert.match(user,new RegExp('\\b'+field+'\\s+String\\?'));
  assert.match(user,/username\s+String\?\s+@unique/);
  assert.match(user,/role\s+UserRole\s+@default\(USER\)/);
  assert.match(user,/isActive\s+Boolean\s+@default\(true\)/);
  assert.match(user,/isEmailVerified\s+Boolean\s+@default\(false\)/);
  assert.match(user,/passwordHash\s+String/);
  assert.doesNotMatch(user,/\bpassword\s+String/);
  assert.doesNotMatch(migration,/ADD COLUMN "password"/);
  assert.match(schema,/enum UserRole\s*\{\s*USER\s+ADMIN\s+MODERATOR\s*\}/);
});
test('ownership relations and lookup indexes match the new database columns',()=>{
  assert.match(model('Project'),/user\s+User\?\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(model('Message'),/user\s+User\?\s+@relation\(fields: \[userId\], references: \[id\], onDelete: SetNull\)/);
  for(const [name,fields] of [['Project','userId'],['Message','userId'],['Message','conversationId'],['Conversation','projectId']]){
    assert.ok(model(name).includes('@@index(['+fields+'])'));
    assert.ok(migration.includes('CREATE INDEX "'+name+'_'+fields+'_idx"'));
  }
});
test('migration backfills existing timestamps and user-message owners before constraints',()=>{
  const added=migration.indexOf('ADD COLUMN "updatedAt" TIMESTAMP(3);');
  const populated=migration.indexOf('UPDATE "User" SET "updatedAt" = "createdAt";');
  const constrained=migration.indexOf('ALTER COLUMN "updatedAt" SET NOT NULL;');
  assert.ok(added>=0&&added<populated&&populated<constrained);
  assert.match(migration,/ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP/);
  assert.match(model('User'),/updatedAt\s+DateTime\s+@default\(now\(\)\) @updatedAt/);
  assert.match(migration,/SET "userId" = conversation\."userId"/);
  assert.match(migration,/message\."role" = 'USER'/);
  assert.ok(migration.includes('BEGIN;')&&migration.trim().endsWith('COMMIT;'));
});
