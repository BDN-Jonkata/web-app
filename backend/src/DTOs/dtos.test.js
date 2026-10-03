import test from 'node:test';
import assert from 'node:assert/strict';

import {
  userDto,
  projectDto,
  projectSkeletonDto,
  conversationDto,
  messageDto,
  sessionDto,
  modelRouteDto,
} from './index.js';

import topLevelDtos, {
  userDto as topUserDto,
  projectDto as topProjectDto,
} from '../../DTOs/index.js';

test('DTOs are plain objects and top-level bridge matches src/DTOs', () => {
  assert.equal(typeof userDto, 'object');
  assert.equal(typeof projectDto, 'object');
  assert.equal(typeof projectSkeletonDto, 'object');
  assert.equal(typeof conversationDto, 'object');
  assert.equal(typeof messageDto, 'object');
  assert.equal(typeof sessionDto, 'object');
  assert.equal(typeof modelRouteDto, 'object');

  assert.equal(topUserDto, userDto);
  assert.equal(topProjectDto, projectDto);
  assert.equal(topLevelDtos.userDto, userDto);
});

test('userDto sanitizes passwords, outputs profiles and formats auth responses', () => {
  const user = {
    id: 'usr-1',
    username: 'alex',
    email: 'alex@example.test',
    name: 'Alexander',
    realName: 'Alexander Ivanov',
    passwordHash: 'scrypt$1234$abcdef',
    phoneNumber: '+359888123456',
    avatarUrl: 'https://example.com/avatar.jpg',
    bio: 'Software engineer',
    role: 'USER',
    isActive: true,
    isEmailVerified: true,
    preferences: { theme: 'forest', language: 'bg' },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  };

  const response = userDto.toResponse(user);
  assert.equal(response.id, 'usr-1');
  assert.equal(response.username, 'alex');
  assert.equal(response.email, 'alex@example.test');
  assert.equal('passwordHash' in response, false);
  assert.equal('password' in response, false);
  assert.equal(response.preferences.theme, 'forest');

  const publicProfile = userDto.toPublicProfile(user);
  assert.deepEqual(Object.keys(publicProfile).sort(), ['avatarUrl', 'bio', 'id', 'name', 'username']);

  const authSession = userDto.toAuthSession(user, 'opaque_token_string');
  assert.equal(authSession.token, 'opaque_token_string');
  assert.equal('passwordHash' in authSession.user, false);

  // Input validation
  const valid = userDto.fromRegisterInput({
    email: ' TEST@EXAMPLE.COM ',
    password: 'a very long valid password 12345',
    name: ' Alexander ',
    preferences: { theme: 'dark' },
  });
  assert.equal(valid.email, 'test@example.com');
  assert.equal(valid.name, 'Alexander');
  assert.equal(valid.preferences.theme, 'dark');

  assert.throws(() => userDto.fromRegisterInput({ email: 'bad-email', password: 'valid long password 12345', name: 'Al' }));
  assert.throws(() => userDto.fromRegisterInput({ email: 'ok@a.bg', password: 'short', name: 'Al' }));
  assert.throws(() => userDto.fromRegisterInput({ email: 'ok@a.bg', password: 'valid long password 12345', name: 'A' }));

  const update = userDto.fromUpdateInput({
    bio: 'Updated bio',
    phoneNumber: '+359000000000',
    ignoredProp: 'injection',
  });
  assert.equal(update.bio, 'Updated bio');
  assert.equal(update.phoneNumber, '+359000000000');
  assert.equal('ignoredProp' in update, false);
});

test('projectDto and projectSkeletonDto validate and serialize entities', () => {
  const project = {
    id: 'p-1',
    name: 'Solar Grid Sofia',
    repository: 'https://github.com/energy/solar',
    userId: 'u-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: 'u-1', name: 'Ivan', email: 'ivan@test.bg' },
    skeleton: { id: 'sk-1', fileCount: 15, tokenCount: 4000, contentHash: 'h1' },
    conversations: [{ id: 'c-1', title: 'Planning', updatedAt: new Date() }],
  };

  const simple = projectDto.toResponse(project);
  assert.equal(simple.id, 'p-1');
  assert.equal(simple.name, 'Solar Grid Sofia');

  const detailed = projectDto.toDetail(project);
  assert.equal(detailed.user.name, 'Ivan');
  assert.equal(detailed.skeleton.fileCount, 15);
  assert.equal(detailed.conversations.length, 1);

  const input = projectDto.fromCreateInput({ name: ' Wind Farm ', repository: 'repo' });
  assert.equal(input.name, 'Wind Farm');
  assert.equal(input.repository, 'repo');

  assert.throws(() => projectDto.fromCreateInput({ name: '' }));

  // Skeleton
  const skeleton = {
    id: 'sk-1',
    projectId: 'p-1',
    content: { tree: {} },
    fileCount: 5,
    tokenCount: 120,
    contentHash: 'hash-abc',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const skResponse = projectSkeletonDto.toResponse(skeleton);
  assert.equal(skResponse.fileCount, 5);
  assert.equal(skResponse.projectId, 'p-1');

  const skInput = projectSkeletonDto.fromCreateInput({
    projectId: 'p-1',
    content: { a: 1 },
    fileCount: 2,
    tokenCount: 50,
    contentHash: 'hash',
  });
  assert.equal(skInput.projectId, 'p-1');
  assert.equal(skInput.fileCount, 2);
  assert.throws(() => projectSkeletonDto.fromCreateInput({ projectId: '' }));
});

test('conversationDto formats summary, details and filters system messages', () => {
  const convo = {
    id: 'c-1',
    title: 'Discussion',
    projectId: 'p-1',
    userId: 'u-1',
    state: { season: 'summer' },
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { messages: 3 },
    messages: [
      { id: 'm-1', role: 'SYSTEM', content: 'Internal instructions', createdAt: new Date() },
      { id: 'm-2', role: 'USER', content: 'What is energy output?', createdAt: new Date() },
      { id: 'm-3', role: 'ASSISTANT', content: 'Output is 100MW.', createdAt: new Date() },
    ],
  };

  const summary = conversationDto.toSummary(convo);
  assert.equal(summary.id, 'c-1');
  assert.equal(summary.messageCount, 3);

  const detail = conversationDto.toDetail(convo);
  assert.equal(detail.messages.length, 2);
  assert.equal(detail.messages[0].role, 'user');
  assert.equal(detail.messages[0].content, 'What is energy output?');
  assert.equal(detail.messages[1].role, 'assistant');

  const fromCreate = conversationDto.fromCreateInput({ title: ' New Chat ' });
  assert.equal(fromCreate.title, 'New Chat');
});

test('messageDto and sessionDto validate structures and format responses', () => {
  const msg = {
    id: 'm-1',
    conversationId: 'c-1',
    userId: 'u-1',
    role: 'USER',
    content: 'Test content',
    createdAt: new Date(),
    route: { id: 'r-1', model: 'groq/qwen', confidence: 99, complexity: 1, latencyMs: 120 },
  };

  const msgRes = messageDto.toResponse(msg);
  assert.equal(msgRes.id, 'm-1');
  assert.equal(msgRes.route.model, 'groq/qwen');

  const msgInput = messageDto.fromCreateInput({
    conversationId: 'c-1',
    role: 'user',
    content: 'Valid content',
  });
  assert.equal(msgInput.role, 'USER');
  assert.equal(msgInput.content, 'Valid content');

  assert.throws(() => messageDto.fromCreateInput({ conversationId: 'c-1', role: 'invalid', content: 'Valid' }));
  assert.throws(() => messageDto.fromCreateInput({ conversationId: 'c-1', role: 'user', content: '' }));

  // Session
  const validHash = 'b'.repeat(64);
  const sessInput = sessionDto.fromCreateInput({
    tokenHash: validHash,
    userId: 'u-1',
    expiresAt: new Date(Date.now() + 60000),
  });
  assert.equal(sessInput.tokenHash, validHash);
  assert.throws(() => sessionDto.fromCreateInput({ tokenHash: 'invalid-hash', userId: 'u-1', expiresAt: new Date() }));
});

test('modelRouteDto serializes and validates routing telemetry', () => {
  const route = {
    id: 'r-1',
    messageId: 'm-1',
    model: 'groq/qwen',
    confidence: 90,
    complexity: 3,
    checks: { length: true },
    latencyMs: 150,
    inputTokens: 50,
    outputTokens: 120,
    estimatedCost: '0.000450',
    createdAt: new Date(),
  };

  const res = modelRouteDto.toResponse(route);
  assert.equal(res.id, 'r-1');
  assert.equal(res.estimatedCost, 0.00045);
  assert.equal(res.latencyMs, 150);

  const input = modelRouteDto.fromCreateInput({
    messageId: 'm-1',
    model: 'groq/qwen',
    confidence: 85,
    complexity: 2,
  });
  assert.equal(input.model, 'groq/qwen');
  assert.equal(input.confidence, 85);
  assert.throws(() => modelRouteDto.fromCreateInput({ messageId: '', model: 'groq' }));
});
