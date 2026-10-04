import {
  createAccountService,
  readSessionToken,
  SESSION_COOKIE,
  SESSION_MS,
  accountError,
} from '../src/accounts.js';
import {createEmailAuthService,readChallengeToken,CHALLENGE_COOKIE,CHALLENGE_MS} from '../src/emailAuth.js';
import {requestMetadata} from '../src/email.js';

function handleAuthError(err, res, defaultCode = 'AUTH_FAILED', defaultStatus = 400) {
  // Database and SMTP errors can contain credentials; never log the raw error.
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
  emailAuth = createEmailAuthService(),
  secure = process.env.NODE_ENV === 'production',
} = {}) {
  const cookieOptions = { httpOnly: true, secure, sameSite: 'strict', path: '/api', maxAge: SESSION_MS };
  const challengeOptions={...cookieOptions,maxAge:CHALLENGE_MS};
  const clearOptions={httpOnly:true,secure,sameSite:'strict',path:'/api'};
  function challenge(res,result){
    const {challengeToken,...publicResult}=result;
    return res.cookie(CHALLENGE_COOKIE,challengeToken,challengeOptions).status(202).json(publicResult);
  }

  return {
    async register(req, res) {
      try {
        challenge(res,await emailAuth.register(req.body));
      } catch (err) {
        handleAuthError(err, res, 'REGISTRATION_FAILED', 400);
      }
    },

    async login(req, res) {
      try {
        challenge(res,await emailAuth.login(req.body));
      } catch (err) {
        handleAuthError(err, res, 'INVALID_CREDENTIALS', 401);
      }
    },

    async verify(req,res){
      try {
        const result=await emailAuth.verify({token:readChallengeToken(req),code:req.body?.code,sessionToken:readSessionToken(req)});
        res.clearCookie(CHALLENGE_COOKIE,clearOptions).cookie(SESSION_COOKIE,result.token,cookieOptions).json(result);
      }catch(error){handleAuthError(error,res)}
    },
    async resend(req,res){
      try {
        const started=Date.now(),result=await emailAuth.resend(readChallengeToken(req));
        await new Promise(resolve=>setTimeout(resolve,Math.max(0,400-(Date.now()-started))));
        res.json(result);
      }catch(error){handleAuthError(error,res)}
    },
    async forgotPassword(req,res){
      try {
        const started=Date.now(),result=await emailAuth.forgotPassword(req.body);
        // SMTP sending is asynchronous here, avoiding an account-existence timing leak.
        await new Promise(resolve=>setTimeout(resolve,Math.max(0,400-(Date.now()-started))));
        challenge(res,result);
      }catch(error){handleAuthError(error,res)}
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
          .clearCookie(CHALLENGE_COOKIE, { httpOnly: true, secure, sameSite: 'strict', path: '/api' })
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
        const result=await emailAuth.resetPassword({token:readChallengeToken(req),code:req.body?.code,
          password:req.body?.password,confirmPassword:req.body?.confirmPassword,metadata:requestMetadata(req)});
        res.clearCookie(CHALLENGE_COOKIE,clearOptions).clearCookie(SESSION_COOKIE,clearOptions).status(200).json(result);
      } catch (err) {
        handleAuthError(err, res, 'RESET_PASSWORD_FAILED', 400);
      }
    },
  };
}

export const authController = createAuthController();
export default authController;
