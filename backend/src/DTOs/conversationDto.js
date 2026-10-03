import { normalizeState } from '../../../shared/chatContract.js';

export const conversationDto = {
  toResponse(conversation) {
    if (!conversation) return null;
    return {
      id: conversation.id,
      title: conversation.title,
      projectId: conversation.projectId ?? null,
      userId: conversation.userId ?? null,
      state: conversation.state ?? null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  },

  toSummary(conversation) {
    if (!conversation) return null;
    return {
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      messageCount:
        conversation._count?.messages ??
        (Array.isArray(conversation.messages) ? conversation.messages.length : 0),
    };
  },

  toDetail(conversation) {
    if (!conversation) return null;
    return {
      id: conversation.id,
      title: conversation.title,
      projectId: conversation.projectId ?? null,
      userId: conversation.userId ?? null,
      state: conversation.state ?? null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: Array.isArray(conversation.messages)
        ? conversation.messages
            .filter((m) => m.role !== 'SYSTEM')
            .map((m) => ({
              id: m.id,
              role: m.role === 'USER' ? 'user' : 'assistant',
              content: m.content,
              createdAt: m.createdAt,
            }))
        : [],
    };
  },

  fromCreateInput(input) {
    const title = typeof input?.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 120) : 'Разговор';
    const projectId = typeof input?.projectId === 'string' ? input.projectId.trim() || null : null;
    const userId = typeof input?.userId === 'string' ? input.userId.trim() || null : null;
    let state = null;
    if (input?.state) {
      try {
        state = normalizeState(input.state);
      } catch {
        const err = new Error('Невалиден сценарий в историята.');
        err.code = 'INVALID_STATE';
        err.status = 400;
        throw err;
      }
    }

    return {
      title,
      projectId,
      userId,
      state,
    };
  },

  fromUpdateInput(input) {
    const data = {};
    if (typeof input?.title === 'string' && input.title.trim()) {
      data.title = input.title.trim().slice(0, 120);
    }
    if (typeof input?.projectId === 'string') {
      data.projectId = input.projectId.trim() || null;
    } else if (input?.projectId === null) {
      data.projectId = null;
    }
    if (input?.state) {
      try {
        data.state = normalizeState(input.state);
      } catch {
        const err = new Error('Невалиден сценарий в историята.');
        err.code = 'INVALID_STATE';
        err.status = 400;
        throw err;
      }
    }
    return data;
  },
};

export default conversationDto;
