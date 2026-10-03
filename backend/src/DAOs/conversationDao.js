import { getDatabase } from '../database.js';

export const conversationDao = {
  async create(data, db = getDatabase()) {
    return db.conversation.create({ data });
  },

  async findById(id, db = getDatabase()) {
    return db.conversation.findUnique({ where: { id } });
  },

  async findMany(args = {}, db = getDatabase()) {
    return db.conversation.findMany(args);
  },

  async update(id, data, db = getDatabase()) {
    return db.conversation.update({ where: { id }, data });
  },

  async delete(id, db = getDatabase()) {
    return db.conversation.delete({ where: { id } });
  },

  // Connecting functions linking Foreign Keys & Primary Keys
  async linkUser(conversationId, userId, db = getDatabase()) {
    return db.conversation.update({
      where: { id: conversationId },
      data: { userId },
    });
  },

  async unlinkUser(conversationId, db = getDatabase()) {
    return db.conversation.update({
      where: { id: conversationId },
      data: { userId: null },
    });
  },

  async getUser(conversationId, db = getDatabase()) {
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { user: true },
    });
    return conversation?.user || null;
  },

  async findByUserId(userId, { orderBy = { updatedAt: 'desc' }, take, skip } = {}, db = getDatabase()) {
    return db.conversation.findMany({
      where: { userId },
      orderBy,
      ...(take !== undefined ? { take } : {}),
      ...(skip !== undefined ? { skip } : {}),
    });
  },

  async linkProject(conversationId, projectId, db = getDatabase()) {
    return db.conversation.update({
      where: { id: conversationId },
      data: { projectId },
    });
  },

  async unlinkProject(conversationId, db = getDatabase()) {
    return db.conversation.update({
      where: { id: conversationId },
      data: { projectId: null },
    });
  },

  async getProject(conversationId, db = getDatabase()) {
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { project: true },
    });
    return conversation?.project || null;
  },

  async findByProjectId(projectId, { orderBy = { updatedAt: 'desc' }, take, skip } = {}, db = getDatabase()) {
    return db.conversation.findMany({
      where: { projectId },
      orderBy,
      ...(take !== undefined ? { take } : {}),
      ...(skip !== undefined ? { skip } : {}),
    });
  },

  async getMessages(conversationId, { orderBy = { createdAt: 'asc' } } = {}, db = getDatabase()) {
    return db.message.findMany({
      where: { conversationId },
      orderBy,
    });
  },

  async findWithRelations(conversationId, { user = false, project = false, messages = false } = {}, db = getDatabase()) {
    return db.conversation.findUnique({
      where: { id: conversationId },
      include: {
        ...(user ? { user: true } : {}),
        ...(project ? { project: true } : {}),
        ...(messages ? { messages: { orderBy: { createdAt: 'asc' } } } : {}),
      },
    });
  },
};

export default conversationDao;
