import { getDatabase } from '../database.js';

export const modelRouteDao = {
  async create(data, db = getDatabase()) {
    return db.modelRoute.create({ data });
  },

  async findById(id, db = getDatabase()) {
    return db.modelRoute.findUnique({ where: { id } });
  },

  async findByMessageId(messageId, db = getDatabase()) {
    return db.modelRoute.findUnique({ where: { messageId } });
  },

  async update(id, data, db = getDatabase()) {
    return db.modelRoute.update({ where: { id }, data });
  },

  async delete(id, db = getDatabase()) {
    return db.modelRoute.delete({ where: { id } });
  },

  // Connecting functions linking Foreign Keys & Primary Keys
  async linkMessage(routeId, messageId, db = getDatabase()) {
    return db.modelRoute.update({
      where: { id: routeId },
      data: { messageId },
    });
  },

  async getMessage(routeId, db = getDatabase()) {
    const route = await db.modelRoute.findUnique({
      where: { id: routeId },
      select: { message: true },
    });
    return route?.message || null;
  },
};

export default modelRouteDao;
