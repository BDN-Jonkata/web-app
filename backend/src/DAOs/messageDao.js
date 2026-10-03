import { getDatabase } from '../database.js';

export const messageDao = {
  async create(data, db = getDatabase()) {
    return db.message.create({ data });
  },

  async createMany(data, db = getDatabase()) {
    return db.message.createMany({ data });
  },

  async findById(id, db = getDatabase()) {
    return db.message.findUnique({ where: { id } });
  },

  async findMany(args = {}, db = getDatabase()) {
    return db.message.findMany(args);
  },

  async update(id, data, db = getDatabase()) {
    return db.message.update({ where: { id }, data });
  },

  async delete(id, db = getDatabase()) {
    return db.message.delete({ where: { id } });
  },

  async deleteByConversationId(conversationId, db = getDatabase()) {
    return db.message.deleteMany({ where: { conversationId } });
  },

  // Connecting functions linking Foreign Keys & Primary Keys
  async linkConversation(messageId, conversationId, db = getDatabase()) {
    return db.message.update({
      where: { id: messageId },
      data: { conversationId },
    });
  },

  async getConversation(messageId, db = getDatabase()) {
    const message = await db.message.findUnique({
      where: { id: messageId },
      select: { conversation: true },
    });
    return message?.conversation || null;
  },

  async findByConversationId(conversationId, { orderBy = { createdAt: 'asc' } } = {}, db = getDatabase()) {
    return db.message.findMany({
      where: { conversationId },
      orderBy,
    });
  },

  async linkUser(messageId, userId, db = getDatabase()) {
    return db.message.update({
      where: { id: messageId },
      data: { userId },
    });
  },

  async unlinkUser(messageId, db = getDatabase()) {
    return db.message.update({
      where: { id: messageId },
      data: { userId: null },
    });
  },

  async getUser(messageId, db = getDatabase()) {
    const message = await db.message.findUnique({
      where: { id: messageId },
      select: { user: true },
    });
    return message?.user || null;
  },

  async findByUserId(userId, { orderBy = { createdAt: 'desc' } } = {}, db = getDatabase()) {
    return db.message.findMany({
      where: { userId },
      orderBy,
    });
  },

  async getRoute(messageId, db = getDatabase()) {
    return db.modelRoute.findUnique({ where: { messageId } });
  },

  async findWithRelations(messageId, { user = false, conversation = false, route = false } = {}, db = getDatabase()) {
    return db.message.findUnique({
      where: { id: messageId },
      include: {
        ...(user ? { user: true } : {}),
        ...(conversation ? { conversation: true } : {}),
        ...(route ? { route: true } : {}),
      },
    });
  },
};

export default messageDao;
