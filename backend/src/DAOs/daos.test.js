import test from 'node:test';
import assert from 'node:assert/strict';

import {
  userDao,
  projectDao,
  projectSkeletonDao,
  conversationDao,
  messageDao,
  sessionDao,
  modelRouteDao,
  relationsDao,
} from './index.js';

import topLevelDaos, {
  userDao as topUserDao,
  relationsDao as topRelationsDao,
} from '../../DAOs/index.js';

function createMockDatabase() {
  const users = new Map();
  const projects = new Map();
  const skeletons = new Map();
  const conversations = new Map();
  const messages = new Map();
  const sessions = new Map();
  const routes = new Map();

  return {
    user: {
      async create({ data }) {
        const record = { id: data.id || `u-${users.size + 1}`, ...data };
        users.set(record.id, record);
        return record;
      },
      async findUnique({ where, include }) {
        const record = where.id
          ? users.get(where.id)
          : [...users.values()].find((u) => u.email === where.email || u.username === where.username);
        if (!record) return null;
        const res = { ...record };
        if (include?.projects) res.projects = [...projects.values()].filter((p) => p.userId === record.id);
        if (include?.sessions) res.sessions = [...sessions.values()].filter((s) => s.userId === record.id);
        if (include?.conversations) res.conversations = [...conversations.values()].filter((c) => c.userId === record.id);
        if (include?.messages) res.messages = [...messages.values()].filter((m) => m.userId === record.id);
        return res;
      },
      async findMany(args = {}) {
        return [...users.values()];
      },
      async update({ where, data }) {
        const record = users.get(where.id);
        if (!record) throw new Error('Not found');
        const updated = { ...record, ...data };
        users.set(where.id, updated);
        return updated;
      },
      async delete({ where }) {
        const record = users.get(where.id);
        users.delete(where.id);
        return record;
      },
    },

    project: {
      async create({ data }) {
        const record = { id: data.id || `p-${projects.size + 1}`, ...data };
        projects.set(record.id, record);
        return record;
      },
      async findUnique({ where, select, include }) {
        const record = projects.get(where.id);
        if (!record) return null;
        if (select?.user) return { user: record.userId ? users.get(record.userId) || null : null };
        const res = { ...record };
        if (include?.user) res.user = record.userId ? users.get(record.userId) || null : null;
        if (include?.skeleton) res.skeleton = skeletons.get(record.id) || null;
        if (include?.conversations) res.conversations = [...conversations.values()].filter((c) => c.projectId === record.id);
        return res;
      },
      async findMany(args = {}) {
        let list = [...projects.values()];
        if (args.where?.userId !== undefined) list = list.filter((p) => p.userId === args.where.userId);
        return list;
      },
      async update({ where, data }) {
        const record = projects.get(where.id);
        if (!record) throw new Error('Not found');
        const updated = { ...record, ...data };
        projects.set(where.id, updated);
        return updated;
      },
      async delete({ where }) {
        const record = projects.get(where.id);
        projects.delete(where.id);
        return record;
      },
    },

    projectSkeleton: {
      async create({ data }) {
        const record = { id: data.id || `sk-${skeletons.size + 1}`, ...data };
        skeletons.set(record.id, record);
        return record;
      },
      async findUnique({ where, select }) {
        const record = where.id
          ? skeletons.get(where.id)
          : [...skeletons.values()].find((s) => s.projectId === where.projectId);
        if (!record) return null;
        if (select?.project) return { project: projects.get(record.projectId) || null };
        return record;
      },
      async update({ where, data }) {
        const record = skeletons.get(where.id);
        if (!record) throw new Error('Not found');
        const updated = { ...record, ...data };
        skeletons.set(where.id, updated);
        return updated;
      },
      async delete({ where }) {
        const record = skeletons.get(where.id);
        if (record) skeletons.delete(where.id);
        return record;
      },
    },

    conversation: {
      async create({ data }) {
        const record = { id: data.id || `c-${conversations.size + 1}`, ...data };
        conversations.set(record.id, record);
        return record;
      },
      async findUnique({ where, select, include }) {
        const record = conversations.get(where.id);
        if (!record) return null;
        if (select?.user) return { user: record.userId ? users.get(record.userId) || null : null };
        if (select?.project) return { project: record.projectId ? projects.get(record.projectId) || null : null };
        const res = { ...record };
        if (include?.user) res.user = record.userId ? users.get(record.userId) || null : null;
        if (include?.project) res.project = record.projectId ? projects.get(record.projectId) || null : null;
        if (include?.messages) res.messages = [...messages.values()].filter((m) => m.conversationId === record.id);
        return res;
      },
      async findMany(args = {}) {
        let list = [...conversations.values()];
        if (args.where?.userId !== undefined) list = list.filter((c) => c.userId === args.where.userId);
        if (args.where?.projectId !== undefined) list = list.filter((c) => c.projectId === args.where.projectId);
        return list;
      },
      async update({ where, data }) {
        const record = conversations.get(where.id);
        if (!record) throw new Error('Not found');
        const updated = { ...record, ...data };
        conversations.set(where.id, updated);
        return updated;
      },
      async delete({ where }) {
        const record = conversations.get(where.id);
        conversations.delete(where.id);
        return record;
      },
    },

    message: {
      async create({ data }) {
        const record = { id: data.id || `m-${messages.size + 1}`, ...data };
        messages.set(record.id, record);
        return record;
      },
      async createMany({ data }) {
        const list = Array.isArray(data) ? data : [data];
        for (const item of list) {
          const record = { id: item.id || `m-${messages.size + 1}`, ...item };
          messages.set(record.id, record);
        }
        return { count: list.length };
      },
      async findUnique({ where, select, include }) {
        const record = messages.get(where.id);
        if (!record) return null;
        if (select?.conversation) return { conversation: conversations.get(record.conversationId) || null };
        if (select?.user) return { user: record.userId ? users.get(record.userId) || null : null };
        const res = { ...record };
        if (include?.conversation) res.conversation = conversations.get(record.conversationId) || null;
        if (include?.user) res.user = record.userId ? users.get(record.userId) || null : null;
        if (include?.route) res.route = routes.get(record.id) || null;
        return res;
      },
      async findMany(args = {}) {
        let list = [...messages.values()];
        if (args.where?.conversationId !== undefined) list = list.filter((m) => m.conversationId === args.where.conversationId);
        if (args.where?.userId !== undefined) list = list.filter((m) => m.userId === args.where.userId);
        return list;
      },
      async update({ where, data }) {
        const record = messages.get(where.id);
        if (!record) throw new Error('Not found');
        const updated = { ...record, ...data };
        messages.set(where.id, updated);
        return updated;
      },
      async delete({ where }) {
        const record = messages.get(where.id);
        messages.delete(where.id);
        return record;
      },
      async deleteMany({ where }) {
        let count = 0;
        for (const [id, m] of messages.entries()) {
          if (where.conversationId && m.conversationId === where.conversationId) {
            messages.delete(id);
            count++;
          }
        }
        return { count };
      },
    },

    session: {
      async create({ data }) {
        sessions.set(data.tokenHash, data);
        return data;
      },
      async findUnique({ where, select, include }) {
        const record = sessions.get(where.tokenHash);
        if (!record) return null;
        if (select?.user) return { user: users.get(record.userId) || null };
        const res = { ...record };
        if (include?.user) res.user = users.get(record.userId) || null;
        return res;
      },
      async findMany(args = {}) {
        let list = [...sessions.values()];
        if (args.where?.userId !== undefined) list = list.filter((s) => s.userId === args.where.userId);
        return list;
      },
      async update({ where, data }) {
        const record = sessions.get(where.tokenHash);
        if (!record) throw new Error('Not found');
        const updated = { ...record, ...data };
        sessions.set(where.tokenHash, updated);
        return updated;
      },
      async delete({ where }) {
        const record = sessions.get(where.tokenHash);
        sessions.delete(where.tokenHash);
        return record;
      },
      async deleteMany({ where }) {
        let count = 0;
        for (const [token, s] of sessions.entries()) {
          if (where.expiresAt?.lt && s.expiresAt < where.expiresAt.lt) {
            sessions.delete(token);
            count++;
          }
        }
        return { count };
      },
    },

    modelRoute: {
      async create({ data }) {
        const record = { id: data.id || `r-${routes.size + 1}`, ...data };
        routes.set(record.id, record);
        return record;
      },
      async findUnique({ where, select }) {
        const record = where.id
          ? routes.get(where.id)
          : [...routes.values()].find((r) => r.messageId === where.messageId);
        if (!record) return null;
        if (select?.message) return { message: messages.get(record.messageId) || null };
        return record;
      },
      async update({ where, data }) {
        const record = routes.get(where.id);
        if (!record) throw new Error('Not found');
        const updated = { ...record, ...data };
        routes.set(where.id, updated);
        return updated;
      },
      async delete({ where }) {
        const record = routes.get(where.id);
        if (record) routes.delete(where.id);
        return record;
      },
    },
  };
}

test('DAOs are plain objects and exports match expected structure', () => {
  assert.equal(typeof userDao, 'object');
  assert.equal(typeof projectDao, 'object');
  assert.equal(typeof projectSkeletonDao, 'object');
  assert.equal(typeof conversationDao, 'object');
  assert.equal(typeof messageDao, 'object');
  assert.equal(typeof sessionDao, 'object');
  assert.equal(typeof modelRouteDao, 'object');
  assert.equal(typeof relationsDao, 'object');

  assert.equal(topUserDao, userDao);
  assert.equal(topRelationsDao, relationsDao);
  assert.equal(topLevelDaos.userDao, userDao);
});

test('userDao performs CRUD and connects to related tables', async () => {
  const db = createMockDatabase();
  const created = await userDao.create({ email: 'test@bg.test', name: 'Ivan', passwordHash: 'hash123' }, db);
  assert.equal(created.email, 'test@bg.test');

  const found = await userDao.findById(created.id, db);
  assert.equal(found.id, created.id);

  const byEmail = await userDao.findByEmail('test@bg.test', db);
  assert.equal(byEmail.id, created.id);

  const updated = await userDao.update(created.id, { name: 'Ivan Petrov' }, db);
  assert.equal(updated.name, 'Ivan Petrov');

  // Relational link tests
  await db.project.create({ data: { id: 'p-1', name: 'Alpha', userId: created.id } });
  await db.session.create({ data: { tokenHash: 'tok123', userId: created.id, expiresAt: new Date() } });
  await db.conversation.create({ data: { id: 'c-1', title: 'Chat', userId: created.id } });
  await db.message.create({ data: { id: 'm-1', conversationId: 'c-1', userId: created.id, role: 'USER', content: 'Hi' } });

  const userProjects = await userDao.getProjects(created.id, db);
  assert.equal(userProjects.length, 1);
  assert.equal(userProjects[0].name, 'Alpha');

  const userSessions = await userDao.getSessions(created.id, db);
  assert.equal(userSessions.length, 1);

  const userConversations = await userDao.getConversations(created.id, db);
  assert.equal(userConversations.length, 1);

  const userMessages = await userDao.getMessages(created.id, db);
  assert.equal(userMessages.length, 1);

  const withRel = await userDao.findWithRelations(created.id, { projects: true, conversations: true }, db);
  assert.equal(withRel.projects.length, 1);
  assert.equal(withRel.conversations.length, 1);

  await userDao.delete(created.id, db);
  assert.equal(await userDao.findById(created.id, db), null);
});

test('projectDao and projectSkeletonDao link primary and foreign keys', async () => {
  const db = createMockDatabase();
  const user = await userDao.create({ email: 'owner@bg.test', name: 'Owner', passwordHash: 'hash' }, db);
  const project = await projectDao.create({ name: 'Solar Grid' }, db);

  // Link user to project
  await projectDao.linkUser(project.id, user.id, db);
  const owner = await projectDao.getUser(project.id, db);
  assert.equal(owner.id, user.id);

  const userProjects = await projectDao.findByUserId(user.id, db);
  assert.equal(userProjects.length, 1);

  // Unlink user
  await projectDao.unlinkUser(project.id, db);
  assert.equal(await projectDao.getUser(project.id, db), null);

  // Project <-> Skeleton
  const skeleton = await projectSkeletonDao.create(
    { projectId: project.id, content: { files: [] }, fileCount: 1, tokenCount: 10, contentHash: 'abc' },
    db
  );
  assert.equal(skeleton.projectId, project.id);

  const projSkeleton = await projectDao.getSkeleton(project.id, db);
  assert.equal(projSkeleton.id, skeleton.id);

  const skProj = await projectSkeletonDao.getProject(skeleton.id, db);
  assert.equal(skProj.id, project.id);
});

test('conversationDao and messageDao connecting functions operate smoothly', async () => {
  const db = createMockDatabase();
  const user = await userDao.create({ email: 'chat@bg.test', name: 'User', passwordHash: 'hash' }, db);
  const project = await projectDao.create({ name: 'Project 1' }, db);

  const convo = await conversationDao.create({ title: 'New convo' }, db);

  // Link user and project
  await conversationDao.linkUser(convo.id, user.id, db);
  await conversationDao.linkProject(convo.id, project.id, db);

  assert.equal((await conversationDao.getUser(convo.id, db)).id, user.id);
  assert.equal((await conversationDao.getProject(convo.id, db)).id, project.id);
  assert.equal((await conversationDao.findByUserId(user.id, {}, db)).length, 1);
  assert.equal((await conversationDao.findByProjectId(project.id, {}, db)).length, 1);

  // Message linking
  const msg = await messageDao.create({ conversationId: convo.id, role: 'USER', content: 'Hello' }, db);
  await messageDao.linkUser(msg.id, user.id, db);

  assert.equal((await messageDao.getUser(msg.id, db)).id, user.id);
  assert.equal((await messageDao.getConversation(msg.id, db)).id, convo.id);

  const msgs = await conversationDao.getMessages(convo.id, {}, db);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].id, msg.id);

  // Model route linking
  const route = await modelRouteDao.create(
    { messageId: msg.id, model: 'groq/qwen', confidence: 95, complexity: 2, checks: {} },
    db
  );
  const msgRoute = await messageDao.getRoute(msg.id, db);
  assert.equal(msgRoute.id, route.id);
  assert.equal((await modelRouteDao.getMessage(route.id, db)).id, msg.id);
});

test('sessionDao operates with hashed tokens and user linking', async () => {
  const db = createMockDatabase();
  const user = await userDao.create({ email: 'session@bg.test', name: 'Sess', passwordHash: 'h' }, db);
  const token = 'a'.repeat(64);

  await sessionDao.create({ tokenHash: token, userId: 'temp', expiresAt: new Date(Date.now() + 10000) }, db);
  await sessionDao.linkUser(token, user.id, db);

  assert.equal((await sessionDao.getUser(token, db)).id, user.id);
  const byUser = await sessionDao.findByUserId(user.id, db);
  assert.equal(byUser.length, 1);

  await sessionDao.delete(token, db);
  assert.equal(await sessionDao.findByTokenHash(token, {}, db), null);
});

test('relationsDao links foreign keys and primary keys across entities', async () => {
  const db = createMockDatabase();
  const user = await userDao.create({ email: 'rel@bg.test', name: 'Rel', passwordHash: 'h' }, db);
  const project = await projectDao.create({ name: 'Rel Project' }, db);
  const convo = await conversationDao.create({ title: 'Rel Convo' }, db);
  const msg = await messageDao.create({ conversationId: convo.id, role: 'USER', content: 'Rel Msg' }, db);
  const sk = await projectSkeletonDao.create({ projectId: 'tmp', content: {}, fileCount: 0, tokenCount: 0, contentHash: 'h' }, db);
  const route = await modelRouteDao.create({ messageId: 'tmp', model: 'm', confidence: 1, complexity: 1, checks: {} }, db);

  // Connect user & project
  await relationsDao.connectUserAndProject(user.id, project.id, db);
  assert.equal((await projectDao.findById(project.id, db)).userId, user.id);

  // Connect project & skeleton
  await relationsDao.connectProjectAndSkeleton(project.id, sk.id, db);
  assert.equal((await projectSkeletonDao.findById(sk.id, db)).projectId, project.id);

  // Connect user & conversation
  await relationsDao.connectUserAndConversation(user.id, convo.id, db);
  assert.equal((await conversationDao.findById(convo.id, db)).userId, user.id);

  // Connect project & conversation
  await relationsDao.connectProjectAndConversation(project.id, convo.id, db);
  assert.equal((await conversationDao.findById(convo.id, db)).projectId, project.id);

  // Connect conversation & message
  await relationsDao.connectConversationAndMessage(convo.id, msg.id, db);
  assert.equal((await messageDao.findById(msg.id, db)).conversationId, convo.id);

  // Connect user & message
  await relationsDao.connectUserAndMessage(user.id, msg.id, db);
  assert.equal((await messageDao.findById(msg.id, db)).userId, user.id);

  // Connect message & route
  await relationsDao.connectMessageAndRoute(msg.id, route.id, db);
  assert.equal((await modelRouteDao.findById(route.id, db)).messageId, msg.id);

  // Disconnect tests
  await relationsDao.disconnectUserAndProject(project.id, db);
  assert.equal((await projectDao.findById(project.id, db)).userId, null);

  await relationsDao.disconnectProjectAndConversation(convo.id, db);
  assert.equal((await conversationDao.findById(convo.id, db)).projectId, null);

  await relationsDao.disconnectUserAndConversation(convo.id, db);
  assert.equal((await conversationDao.findById(convo.id, db)).userId, null);

  await relationsDao.disconnectUserAndMessage(msg.id, db);
  assert.equal((await messageDao.findById(msg.id, db)).userId, null);
});
