export const projectDto = {
  toResponse(project) {
    if (!project) return null;
    return {
      id: project.id,
      name: project.name,
      repository: project.repository ?? null,
      userId: project.userId ?? null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  },

  toDetail(project) {
    if (!project) return null;
    const base = this.toResponse(project);
    return {
      ...base,
      user: project.user
        ? {
            id: project.user.id,
            name: project.user.name,
            email: project.user.email,
          }
        : null,
      skeleton: project.skeleton
        ? {
            id: project.skeleton.id,
            fileCount: project.skeleton.fileCount,
            tokenCount: project.skeleton.tokenCount,
            contentHash: project.skeleton.contentHash,
          }
        : null,
      conversations: Array.isArray(project.conversations)
        ? project.conversations.map((c) => ({
            id: c.id,
            title: c.title,
            updatedAt: c.updatedAt,
          }))
        : undefined,
    };
  },

  fromCreateInput(input) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 120) {
      const err = new Error('Името на проекта трябва да е между 1 и 120 знака.');
      err.code = 'INVALID_PROJECT_NAME';
      err.status = 400;
      throw err;
    }
    const repository = typeof input?.repository === 'string' ? input.repository.trim() || null : null;
    const userId = typeof input?.userId === 'string' ? input.userId.trim() || null : null;

    return {
      name,
      repository,
      userId,
    };
  },

  fromUpdateInput(input) {
    const data = {};
    if (typeof input?.name === 'string') {
      const name = input.name.trim();
      if (name && name.length <= 120) data.name = name;
    }
    if (typeof input?.repository === 'string') {
      data.repository = input.repository.trim() || null;
    } else if (input?.repository === null) {
      data.repository = null;
    }
    if (typeof input?.userId === 'string') {
      data.userId = input.userId.trim() || null;
    } else if (input?.userId === null) {
      data.userId = null;
    }
    return data;
  },
};

export default projectDto;
