import { getDatabase } from '../database.js';

export const userDao = {
  async create(data, db = getDatabase()) {
    return db.user.create({ data });
  },

  async findById(id, db = getDatabase()) {
    return db.user.findUnique({ where: { id } });
  },

  async findByEmail(email, db = getDatabase()) {
    return db.user.findUnique({ where: { email } });
  },

  async findByUsername(username, db = getDatabase()) {
    return db.user.findUnique({ where: { username } });
  },

  async findMany(args = {}, db = getDatabase()) {
    return db.user.findMany(args);
  },

  async update(id, data, db = getDatabase()) {
    return db.user.update({ where: { id }, data });
  },

  async delete(id, db = getDatabase()) {
    return db.user.delete({ where: { id } });
  },

  // Connecting functions linking Foreign Keys & Primary Keys
  async getProjects(userId, db = getDatabase()) {
    return db.project.findMany({ where: { userId } });
  },

  async getSessions(userId, db = getDatabase()) {
    return db.session.findMany({ where: { userId } });
  },

  async getConversations(userId, db = getDatabase()) {
    return db.conversation.findMany({ where: { userId } });
  },

  async getMessages(userId, db = getDatabase()) {
    return db.message.findMany({ where: { userId } });
  },

  async findWithRelations(userId, { projects = false, sessions = false, conversations = false, messages = false } = {}, db = getDatabase()) {
    return db.user.findUnique({
      where: { id: userId },
      include: {
        ...(projects ? { projects: true } : {}),
        ...(sessions ? { sessions: true } : {}),
        ...(conversations ? { conversations: true } : {}),
        ...(messages ? { messages: true } : {}),
      },
    });
  },
};

export default userDao;
