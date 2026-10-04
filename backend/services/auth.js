import { Router } from 'express';
import authController, { createAuthController } from '../controllers/authController.js';
import { createChatLimiter } from '../src/chat.js';

export function createAuthRouter({ controller = authController } = {}) {
  const router = Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});

  router.post('/register', createChatLimiter({ limit: 5 }), controller.register);
  router.post('/login', createChatLimiter({ limit: 5 }), controller.login);
  router.post('/verify-code', createChatLimiter({ limit: 15 }), controller.verify);
  router.post('/resend-code', createChatLimiter({ limit: 5 }), controller.resend);
  router.post('/forgot-password', createChatLimiter({ limit: 5 }), controller.forgotPassword);
  router.post('/logout', controller.logout);
  router.post('/refresh-token', createChatLimiter({ limit: 10 }), controller.refreshToken);
  router.post('/reset-password', createChatLimiter({ limit: 5 }), controller.resetPassword);
  router.get('/session', controller.session);

  return router;
}

const router = createAuthRouter();
export default router;
export { createAuthController };
