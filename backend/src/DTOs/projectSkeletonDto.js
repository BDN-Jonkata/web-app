export const projectSkeletonDto = {
  toResponse(skeleton) {
    if (!skeleton) return null;
    return {
      id: skeleton.id,
      projectId: skeleton.projectId,
      content: skeleton.content,
      fileCount: skeleton.fileCount,
      tokenCount: skeleton.tokenCount,
      contentHash: skeleton.contentHash,
      createdAt: skeleton.createdAt,
      updatedAt: skeleton.updatedAt,
    };
  },

  fromCreateInput(input) {
    const projectId = typeof input?.projectId === 'string' ? input.projectId.trim() : '';
    if (!projectId) {
      const err = new Error('Липсва ID на проекта за скелета.');
      err.code = 'INVALID_PROJECT_SKELETON';
      err.status = 400;
      throw err;
    }

    if (!input?.content || typeof input.content !== 'object') {
      const err = new Error('Невалидно съдържание на скелета.');
      err.code = 'INVALID_SKELETON_CONTENT';
      err.status = 400;
      throw err;
    }

    const fileCount = Number.isInteger(input.fileCount) && input.fileCount >= 0 ? input.fileCount : 0;
    const tokenCount = Number.isInteger(input.tokenCount) && input.tokenCount >= 0 ? input.tokenCount : 0;
    const contentHash = typeof input.contentHash === 'string' ? input.contentHash.trim() : '';

    return {
      projectId,
      content: input.content,
      fileCount,
      tokenCount,
      contentHash,
    };
  },
};

export default projectSkeletonDto;
