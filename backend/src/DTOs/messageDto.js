export const messageDto = {
  toResponse(message) {
    if (!message) return null;
    return {
      id: message.id,
      conversationId: message.conversationId,
      userId: message.userId ?? null,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      ...(message.route
        ? {
            route: {
              id: message.route.id,
              model: message.route.model,
              confidence: message.route.confidence,
              complexity: message.route.complexity,
              latencyMs: message.route.latencyMs,
            },
          }
        : {}),
    };
  },

  fromCreateInput(input) {
    const conversationId = typeof input?.conversationId === 'string' ? input.conversationId.trim() : '';
    if (!conversationId) {
      const err = new Error('Липсва ID на разговор за съобщението.');
      err.code = 'INVALID_CONVERSATION_ID';
      err.status = 400;
      throw err;
    }

    const userId = typeof input?.userId === 'string' ? input.userId.trim() || null : null;
    const rawRole = String(input?.role || '').toUpperCase();
    const role = ['USER', 'ASSISTANT', 'SYSTEM'].includes(rawRole)
      ? rawRole
      : rawRole === 'USER' || rawRole === 'ASSISTANT'
        ? rawRole
        : null;

    if (!role) {
      const err = new Error('Невалидна роля на съобщение.');
      err.code = 'INVALID_MESSAGE_ROLE';
      err.status = 400;
      throw err;
    }

    const content = typeof input?.content === 'string' ? input.content : '';
    if (!content.trim() || content.length > 6000) {
      const err = new Error('Съобщението не може да бъде празно или над 6000 знака.');
      err.code = 'INVALID_MESSAGE_CONTENT';
      err.status = 400;
      throw err;
    }

    return {
      conversationId,
      userId,
      role,
      content,
    };
  },
};

export default messageDto;
