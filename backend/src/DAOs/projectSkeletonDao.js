import { getDatabase } from '../database.js';

export const projectSkeletonDao = {
  async create(data, db = getDatabase()) {
    return db.projectSkeleton.create({ data });
  },

  async findById(id, db = getDatabase()) {
    return db.projectSkeleton.findUnique({ where: { id } });
  },

  async findByProjectId(projectId, db = getDatabase()) {
    return db.projectSkeleton.findUnique({ where: { projectId } });
  },

  async update(id, data, db = getDatabase()) {
    return db.projectSkeleton.update({ where: { id }, data });
  },

  async delete(id, db = getDatabase()) {
    return db.projectSkeleton.delete({ where: { id } });
  },

  // Connecting functions linking Foreign Keys & Primary Keys
  async linkProject(skeletonId, projectId, db = getDatabase()) {
    return db.projectSkeleton.update({
      where: { id: skeletonId },
      data: { projectId },
    });
  },

  async getProject(skeletonId, db = getDatabase()) {
    const skeleton = await db.projectSkeleton.findUnique({
      where: { id: skeletonId },
      select: { project: true },
    });
    return skeleton?.project || null;
  },
};

export default projectSkeletonDao;
