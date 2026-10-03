import { getDatabase } from '../database.js';

export const projectDao = {
  async create(data, db = getDatabase()) {
    return db.project.create({ data });
  },

  async findById(id, db = getDatabase()) {
    return db.project.findUnique({ where: { id } });
  },

  async findMany(args = {}, db = getDatabase()) {
    return db.project.findMany(args);
  },

  async update(id, data, db = getDatabase()) {
    return db.project.update({ where: { id }, data });
  },

  async delete(id, db = getDatabase()) {
    return db.project.delete({ where: { id } });
  },

  // Connecting functions linking Foreign Keys & Primary Keys
  async linkUser(projectId, userId, db = getDatabase()) {
    return db.project.update({
      where: { id: projectId },
      data: { userId },
    });
  },

  async unlinkUser(projectId, db = getDatabase()) {
    return db.project.update({
      where: { id: projectId },
      data: { userId: null },
    });
  },

  async getUser(projectId, db = getDatabase()) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { user: true },
    });
    return project?.user || null;
  },

  async findByUserId(userId, db = getDatabase()) {
    return db.project.findMany({ where: { userId } });
  },

  async getSkeleton(projectId, db = getDatabase()) {
    return db.projectSkeleton.findUnique({ where: { projectId } });
  },

  async getConversations(projectId, db = getDatabase()) {
    return db.conversation.findMany({ where: { projectId } });
  },

  async findWithRelations(projectId, { user = false, skeleton = false, conversations = false } = {}, db = getDatabase()) {
    return db.project.findUnique({
      where: { id: projectId },
      include: {
        ...(user ? { user: true } : {}),
        ...(skeleton ? { skeleton: true } : {}),
        ...(conversations ? { conversations: true } : {}),
      },
    });
  },
};

export default projectDao;
