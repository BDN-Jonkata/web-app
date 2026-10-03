import { userDto } from './userDto.js';

export const sessionDto = {
  toResponse(session) {
    if (!session) return null;
    return {
      tokenHash: session.tokenHash,
      userId: session.userId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      user: session.user ? userDto.toResponse(session.user) : undefined,
    };
  },

  fromCreateInput(input) {
    const tokenHash = typeof input?.tokenHash === 'string' ? input.tokenHash.trim() : '';
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) {
      const err = new Error('Невалиден токен хеш за сесия.');
      err.code = 'INVALID_TOKEN_HASH';
      err.status = 400;
      throw err;
    }

    const userId = typeof input?.userId === 'string' ? input.userId.trim() : '';
    if (!userId) {
      const err = new Error('Липсва потребителски идентификатор за сесия.');
      err.code = 'INVALID_USER_ID';
      err.status = 400;
      throw err;
    }

    const expiresAt = input?.expiresAt instanceof Date ? input.expiresAt : new Date(input?.expiresAt);
    if (isNaN(expiresAt.getTime())) {
      const err = new Error('Невалидна дата на изтичане на сесия.');
      err.code = 'INVALID_EXPIRY';
      err.status = 400;
      throw err;
    }

    return {
      tokenHash,
      userId,
      expiresAt,
    };
  },
};

export default sessionDto;
