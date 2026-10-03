import {
  createAccountService,
  readSessionToken,
  SESSION_COOKIE,
  SESSION_MS,
  accountError,
} from '../src/accounts.js';

function handleAuthError(err, res, defaultCode = 'AUTH_FAILED', defaultStatus = 400) {
  if (!err.status || !err.code) {
    console.error('Unhandled database/API error:', err);
  }
  const safe =
    err.status && err.code
      ? err
      : accountError(
          503,
          'DATABASE_UNAVAILABLE',
          'Базата данни за вход и история не е достъпна. Стартирай PostgreSQL и изпълни npm run db:migrate от web-app.'
        );
  return res.status(safe.status || defaultStatus).json({
    code: safe.code || defaultCode,
    error: safe.message,
  });
}

export function createAuthController({
  service = createAccountService(),
  secure = process.env.NODE_ENV === 'production',
} = {}) {
  const cookieOptions = { httpOnly: true, secure, sameSite: 'strict', path: '/api', maxAge: SESSION_MS };

  return {
    async register(req, res) {
      try {
        const result = await service.register(req.body);
        await service.logout(readSessionToken(req));
        res
          .cookie(SESSION_COOKIE, result.token, cookieOptions)
          .status(201)
          .json({ user: result.user, token: result.token });
      } catch (err) {
        handleAuthError(err, res, 'REGISTRATION_FAILED', 400);
      }
    },

    async login(req, res) {
      try {
        const result = await service.login(req.body);
        await service.logout(readSessionToken(req));
        res
          .cookie(SESSION_COOKIE, result.token, cookieOptions)
          .status(200)
          .json({ user: result.user, token: result.token });
      } catch (err) {
        handleAuthError(err, res, 'INVALID_CREDENTIALS', 401);
      }
    },

    async session(req, res) {
      try {
        const token = readSessionToken(req);
        const user = await service.current(token);
        res.status(200).json({ user });
      } catch (err) {
        handleAuthError(err, res, 'SESSION_FAILED', 500);
      }
    },

    async logout(req, res) {
      try {
        const token = readSessionToken(req);
        await service.logout(token);
        res
          .clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: 'strict', path: '/api' })
          .json({ user: null });
      } catch (err) {
        handleAuthError(err, res, 'LOGOUT_FAILED', 400);
      }
    },

    async refreshToken(req, res) {
      try {
        const token = req.body?.token || req.body?.refreshToken || readSessionToken(req);
        const result = await service.refreshToken(token);
        res
          .cookie(SESSION_COOKIE, result.token, cookieOptions)
          .status(200)
          .json({ user: result.user, token: result.token });
      } catch (err) {
        handleAuthError(err, res, 'INVALID_TOKEN', 401);
      }
    },

    async resetPassword(req, res) {
      try {
        const sessionToken = readSessionToken(req);
        const token = req.body?.token || sessionToken;
        const password = req.body?.password;
        const result = await service.resetPassword({ token, password, sessionToken });
        res.status(200).json(result);
      } catch (err) {
        handleAuthError(err, res, 'RESET_PASSWORD_FAILED', 400);
      }
    },
  };
}

export const authController = createAuthController();
export default authController;
