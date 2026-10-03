import { normalizePreferences } from '../../../shared/preferences.js';

export const userDto = {
  toResponse(user) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username ?? null,
      email: user.email,
      name: user.name,
      realName: user.realName ?? null,
      phoneNumber: user.phoneNumber ?? null,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      role: user.role || 'USER',
      isActive: user.isActive !== false,
      isEmailVerified: Boolean(user.isEmailVerified),
      preferences: normalizePreferences(user.preferences),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  },

  toPublicProfile(user) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username ?? null,
      name: user.name,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
    };
  },

  toAuthSession(user, token) {
    return {
      user: this.toResponse(user),
      token,
    };
  },

  fromRegisterInput(input) {
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input?.password === 'string' ? input.password : '';
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const username = typeof input?.username === 'string' ? input.username.trim() : undefined;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      const err = new Error('Въведи валиден имейл.');
      err.code = 'INVALID_EMAIL';
      err.status = 400;
      throw err;
    }
    if (password.length < 15 || password.length > 128) {
      const err = new Error('Паролата трябва да е между 15 и 128 знака.');
      err.code = 'INVALID_PASSWORD';
      err.status = 400;
      throw err;
    }
    if (name.length < 2 || name.length > 60) {
      const err = new Error('Името трябва да е между 2 и 60 знака.');
      err.code = 'INVALID_NAME';
      err.status = 400;
      throw err;
    }

    return {
      email,
      password,
      name,
      ...(username ? { username } : {}),
      preferences: normalizePreferences(input?.preferences),
    };
  },

  fromUpdateInput(input) {
    const data = {};
    if (typeof input?.name === 'string') {
      const name = input.name.trim();
      if (name.length >= 2 && name.length <= 60) data.name = name;
    }
    if (typeof input?.realName === 'string') data.realName = input.realName.trim() || null;
    if (typeof input?.phoneNumber === 'string') data.phoneNumber = input.phoneNumber.trim() || null;
    if (typeof input?.avatarUrl === 'string') data.avatarUrl = input.avatarUrl.trim() || null;
    if (typeof input?.bio === 'string') data.bio = input.bio.trim() || null;
    if (typeof input?.username === 'string') data.username = input.username.trim() || null;
    if (input?.preferences && typeof input.preferences === 'object') {
      data.preferences = normalizePreferences(input.preferences);
    }
    return data;
  },
};

export default userDto;
