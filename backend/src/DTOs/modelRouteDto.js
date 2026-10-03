export const modelRouteDto = {
  toResponse(route) {
    if (!route) return null;
    return {
      id: route.id,
      messageId: route.messageId,
      model: route.model,
      confidence: route.confidence,
      complexity: route.complexity,
      checks: route.checks,
      latencyMs: route.latencyMs ?? null,
      inputTokens: route.inputTokens ?? null,
      outputTokens: route.outputTokens ?? null,
      estimatedCost: route.estimatedCost != null ? Number(route.estimatedCost) : null,
      createdAt: route.createdAt,
    };
  },

  fromCreateInput(input) {
    const messageId = typeof input?.messageId === 'string' ? input.messageId.trim() : '';
    if (!messageId) {
      const err = new Error('Липсва ID на съобщение за маршрута.');
      err.code = 'INVALID_MESSAGE_ID';
      err.status = 400;
      throw err;
    }

    const model = typeof input?.model === 'string' ? input.model.trim() : '';
    if (!model) {
      const err = new Error('Липсва модел за маршрута.');
      err.code = 'INVALID_MODEL';
      err.status = 400;
      throw err;
    }

    const confidence = Number.isInteger(input?.confidence) ? input.confidence : 100;
    const complexity = Number.isInteger(input?.complexity) ? input.complexity : 1;
    const checks = input?.checks && typeof input.checks === 'object' ? input.checks : {};
    const latencyMs = Number.isInteger(input?.latencyMs) ? input.latencyMs : null;
    const inputTokens = Number.isInteger(input?.inputTokens) ? input.inputTokens : null;
    const outputTokens = Number.isInteger(input?.outputTokens) ? input.outputTokens : null;
    const estimatedCost = input?.estimatedCost != null ? Number(input.estimatedCost) : null;

    return {
      messageId,
      model,
      confidence,
      complexity,
      checks,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCost,
    };
  },
};

export default modelRouteDto;
