import {
  createAccountService,
  readSessionToken,
  SESSION_COOKIE,
  SESSION_MS,
  accountError,
} from '../src/accounts.js';

const defaultService = createAccountService();
const cookieOptions = { httpOnly: true, sameSite: 'strict', path: '/api', maxAge: SESSION_MS };

export const authController = {
  async register(req, res) {
    try {
      const result = await defaultService.register(req.body);
      await defaultService.logout(readSessionToken(req));
      res.cookie(SESSION_COOKIE, result.token, cookieOptions).status(201).json({ user: result.user, token: result.token });
    } catch (err) {
      res.status(err.status || 400).json({ code: err.code || 'REGISTRATION_FAILED', error: err.message });
    }
  },

  async login(req, res) {
    try {
      const result = await defaultService.login(req.body);
      await defaultService.logout(readSessionToken(req));
      res.cookie(SESSION_COOKIE, result.token, cookieOptions).status(200).json({ user: result.user, token: result.token });
    } catch (err) {
      res.status(err.status || 401).json({ code: err.code || 'INVALID_CREDENTIALS', error: err.message });
    }
  },

  async logout(req, res) {
    try {
      const token = readSessionToken(req);
      await defaultService.logout(token);
      res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', path: '/api' }).json({ user: null });
    } catch (err) {
      res.status(err.status || 400).json({ code: err.code || 'LOGOUT_FAILED', error: err.message });
    }
  },

  async refreshToken(req, res) {
    try {
      const token = req.body?.token || req.body?.refreshToken || readSessionToken(req);
      const result = await defaultService.refreshToken(token);
      res.cookie(SESSION_COOKIE, result.token, cookieOptions).status(200).json({ user: result.user, token: result.token });
    } catch (err) {
      res.status(err.status || 401).json({ code: err.code || 'INVALID_TOKEN', error: err.message });
    }
  },

  async forgotPassword(req, res) {
    try {
      const result = await defaultService.forgotPassword(req.body);
      res.status(200).json(result);
    } catch (err) {
      res.status(err.status || 400).json({ code: err.code || 'FORGOT_PASSWORD_FAILED', error: err.message });
    }
  },
};

export default authController;
