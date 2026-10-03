import { getDatabase } from '../database.js';

export const sessionDao = {
  async create(data, db = getDatabase()) {
    return db.session.create({ data });
  },

  async findByTokenHash(tokenHash, { includeUser = false } = {}, db = getDatabase()) {
    return db.session.findUnique({
      where: { tokenHash },
      include: {
        ...(includeUser ? { user: true } : {}),
      },
    });
  },

  async findByUserId(userId, db = getDatabase()) {
    return db.session.findMany({ where: { userId } });
  },

  async delete(tokenHash, db = getDatabase()) {
    return db.session.delete({ where: { tokenHash } });
  },

  async deleteMany(where = {}, db = getDatabase()) {
    return db.session.deleteMany({ where });
  },

  async deleteExpired(now = new Date(), db = getDatabase()) {
    return db.session.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });
  },

  // Connecting functions linking Foreign Keys & Primary Keys
  async linkUser(tokenHash, userId, db = getDatabase()) {
    return db.session.update({
      where: { tokenHash },
      data: { userId },
    });
  },

  async getUser(tokenHash, db = getDatabase()) {
    const session = await db.session.findUnique({
      where: { tokenHash },
      select: { user: true },
    });
    return session?.user || null;
  },
};

export default sessionDao;
