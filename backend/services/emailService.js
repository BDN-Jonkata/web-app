import { createHmac, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';

const DEFAULT_SECRET = process.env.EMAIL_VERIFICATION_SECRET || 'energy-bulgaria-secret-key-2026';
const DEFAULT_FROM = process.env.EMAIL_FROM || '"Energy Bulgaria" <noreply@energy-bulgaria.test>';

// In-memory record of sent emails for inspection and automated tests
let sentEmails = [];

export function getSentEmails() {
  return [...sentEmails];
}

export function getLastSentEmail() {
  return sentEmails[sentEmails.length - 1] || null;
}

export function clearSentEmails() {
  sentEmails = [];
}

let etherealAccountPromise = null;

/**
 * Creates or configures the mail transporter.
 * If SMTP environment variables are defined, uses real SMTP.
 * In development without SMTP, uses an Ethereal test inbox for live browser preview.
 * In unit tests, falls back to a fast in-memory mock.
 */
export function createEmailTransporter({
  host = process.env.SMTP_HOST,
  port = Number(process.env.SMTP_PORT) || 587,
  user = process.env.SMTP_USER,
  pass = process.env.SMTP_PASS,
  secure = process.env.SMTP_SECURE === 'true',
} = {}) {
  // 1. Unit tests mode: ALWAYS fast in-memory mock transporter
  if (process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('.test.js'))) {
    return {
      async sendMail(mailOptions) {
        const record = {
          ...mailOptions,
          sentAt: new Date(),
          messageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        };
        sentEmails.push(record);
        return { messageId: record.messageId, response: '250 Mock message delivered' };
      },
    };
  }

  // 2. Real configured SMTP
  if (host) {
    const transportOptions = {
      host,
      port,
      secure,
    };
    if (user) {
      transportOptions.auth = { user, pass };
    }
    const realTransporter = nodemailer.createTransport(transportOptions);
    return {
      async sendMail(mailOptions) {
        const record = {
          ...mailOptions,
          sentAt: new Date(),
          messageId: `smtp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        };
        sentEmails.push(record);
        try {
          const info = await realTransporter.sendMail(mailOptions);
          console.log('\n================================================================================');
          console.log(`📧 [EMAIL DELIVERED via SMTP to: ${mailOptions.to}]`);
          console.log(`Subject: ${mailOptions.subject}`);
          if (mailOptions._directVerifyUrl) {
            console.log(`👉 DIRECT VERIFICATION LINK: ${mailOptions._directVerifyUrl}`);
          }
          console.log('================================================================================\n');
          return info;
        } catch (err) {
          console.error('\n⚠️ [SMTP DELIVERY FAILED]:', err.message);
          if (err.code === 'EAUTH' && host.includes('gmail')) {
            console.error('💡 TIP FOR GMAIL: Google requires a 16-character App Password, not your standard password.');
            console.error('   Generate one at: https://myaccount.google.com/apppasswords');
          }
          if (mailOptions._directVerifyUrl) {
            console.log(`👉 FALLBACK DIRECT LINK: ${mailOptions._directVerifyUrl}`);
          }
          console.log('================================================================================\n');
          return { messageId: record.messageId, response: '250 Fallback local delivery' };
        }
      },
    };
  }

  // 3. Development mode without SMTP configured:
  // Use Ethereal test account for real SMTP transmission + clickable web browser preview.
  let etherealTransporter = null;

  return {
    async sendMail(mailOptions) {
      const record = {
        ...mailOptions,
        sentAt: new Date(),
        messageId: `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };
      sentEmails.push(record);

      let previewUrl = null;
      try {
        if (!etherealTransporter) {
          if (!etherealAccountPromise) {
            etherealAccountPromise = nodemailer.createTestAccount();
          }
          const testAccount = await etherealAccountPromise;
          etherealTransporter = nodemailer.createTransport({
            host: testAccount.smtp.host,
            port: testAccount.smtp.port,
            secure: testAccount.smtp.secure,
            auth: {
              user: testAccount.user,
              pass: testAccount.pass,
            },
          });
        }
        const info = await etherealTransporter.sendMail({
          ...mailOptions,
          from: mailOptions.from || `Energy Bulgaria <${etherealTransporter.options.auth.user}>`,
        });
        previewUrl = nodemailer.getTestMessageUrl(info);
      } catch {
        // Safe fallback if offline or ethereal fails
      }

      console.log('\n================================================================================');
      console.log(`📧 [EMAIL SENT to: ${mailOptions.to}]`);
      console.log(`Subject: ${mailOptions.subject}`);
      if (previewUrl) {
        console.log(`🔗 VIEW EMAIL IN BROWSER (Ethereal): ${previewUrl}`);
      }
      if (mailOptions._directVerifyUrl) {
        console.log(`👉 DIRECT VERIFICATION LINK: ${mailOptions._directVerifyUrl}`);
      }
      console.log('================================================================================\n');

      return {
        messageId: record.messageId,
        previewUrl,
        response: previewUrl ? `250 Preview at ${previewUrl}` : '250 Message delivered locally',
      };
    },
  };
}

let activeTransporter = createEmailTransporter();

export function setTransporter(transporter) {
  activeTransporter = transporter;
}

/**
 * Generates an HMAC-SHA256 signed tamper-proof token for email verification or password reset.
 */
export function generateToken({
  userId,
  email,
  type = 'verify_email',
  expiresInMs = 24 * 60 * 60 * 1000,
  secret = DEFAULT_SECRET,
}) {
  const payload = {
    u: userId,
    e: email.trim().toLowerCase(),
    t: type,
    exp: Date.now() + expiresInMs,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

/**
 * Validates the HMAC signature and expiration timestamp of a token.
 */
export function verifyToken(token, { type = 'verify_email', secret = DEFAULT_SECRET } = {}) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    const err = new Error('Липсва или е невалиден токен за потвърждение.');
    err.code = 'INVALID_TOKEN';
    err.status = 400;
    throw err;
  }

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    const err = new Error('Липсва или е невалиден токен за потвърждение.');
    err.code = 'INVALID_TOKEN';
    err.status = 400;
    throw err;
  }

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    const err = new Error('Невалиден или подправен токен.');
    err.code = 'INVALID_TOKEN';
    err.status = 400;
    throw err;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    const err = new Error('Невалидна структура на токена.');
    err.code = 'INVALID_TOKEN';
    err.status = 400;
    throw err;
  }

  if (payload.t !== type) {
    const err = new Error('Несъответстващ тип на токена.');
    err.code = 'INVALID_TOKEN';
    err.status = 400;
    throw err;
  }

  if (payload.exp < Date.now()) {
    const err = new Error('Токенът за потвърждение е изтекъл. Поискай нов.');
    err.code = 'TOKEN_EXPIRED';
    err.status = 400;
    throw err;
  }

  return {
    userId: payload.u,
    email: payload.e,
  };
}

/**
 * Renders the HTML template containing the requested square box that says "VERIFY EMAIL".
 */
export function renderVerificationEmailHtml({ name, verifyUrl }) {
  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Потвърди своя имейл адрес / Verify your email</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #064e3b; padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">⚡ Energy Bulgaria</h1>
              <p style="margin: 6px 0 0 0; color: #a7f3d0; font-size: 14px;">Система за енергийна статистика и симулация</p>
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #111827;">
                Здравей, ${name || 'потребител'}!
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #4b5563;">
                Благодарим ти за регистрацията в <strong>Energy Bulgaria</strong>. За да активираш пълните възможности на профила си и да запазваш своите симулации, моля потвърди своя имейл адрес, като натиснеш полето по-долу:
              </p>
              
              <!-- Square Box Action Button -->
              <div style="text-align: center; margin: 34px 0;">
                <a href="${verifyUrl}"
                   target="_blank"
                   style="display: inline-block; padding: 18px 40px; background-color: #059669; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 800; border-radius: 0px; border: 3px solid #047857; text-transform: uppercase; letter-spacing: 1.5px; box-shadow: 0 4px 10px rgba(5, 150, 105, 0.35);">
                  VERIFY EMAIL
                </a>
                <div style="margin-top: 10px; font-size: 12px; color: #6b7280; font-weight: 500;">
                  (ПОТВЪРДИ ИМЕЙЛ)
                </div>
              </div>

              <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.5; color: #6b7280;">
                Ако бутонът в квадратната кутия не работи, копирай и отвори следния линк в своя браузър:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 12px; word-break: break-all; background-color: #f9fafb; padding: 12px; border: 1px dashed #d1d5db; border-radius: 4px; color: #047857;">
                ${verifyUrl}
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 16px;">
                Този линк е валиден за 24 часа. Ако не си създавал профил, можеш спокойно да игнорираш това съобщение.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Energy Bulgaria. Всички права запазени.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Renders the HTML template for password reset.
 */
export function renderPasswordResetEmailHtml({ name, resetUrl }) {
  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Възстановяване на парола / Reset your password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <tr>
            <td style="background-color: #1e3a8a; padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">⚡ Energy Bulgaria</h1>
              <p style="margin: 6px 0 0 0; color: #bfdbfe; font-size: 14px;">Възстановяване на достъп до профила</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #111827;">
                Здравей, ${name || 'потребител'}!
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #4b5563;">
                Получихме заявка за смяна на паролата за твоя профил в <strong>Energy Bulgaria</strong>. За да зададеш нова парола, натисни бутона в квадратната кутия по-долу:
              </p>
              
              <div style="text-align: center; margin: 34px 0;">
                <a href="${resetUrl}"
                   target="_blank"
                   style="display: inline-block; padding: 18px 40px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 800; border-radius: 0px; border: 3px solid #1d4ed8; text-transform: uppercase; letter-spacing: 1.5px; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.35);">
                  RESET PASSWORD
                </a>
                <div style="margin-top: 10px; font-size: 12px; color: #6b7280; font-weight: 500;">
                  (СМЯНА НА ПАРОЛА)
                </div>
              </div>

              <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.5; color: #6b7280;">
                Ако бутонът не се отваря, използвай този директен линк:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 12px; word-break: break-all; background-color: #f9fafb; padding: 12px; border: 1px dashed #d1d5db; border-radius: 4px; color: #1d4ed8;">
                ${resetUrl}
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 16px;">
                Този линк е валиден за 1 час. Ако не си заявител на тази промяна, препоръчваме да прегледаш сигурността на акаунта си.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Energy Bulgaria. Всички права запазени.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Renders the HTML confirmation page when an email is successfully verified.
 */
export function renderVerificationSuccessHtml({ appUrl = process.env.CLIENT_ORIGIN || 'http://localhost:5173' } = {}) {
  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="4;url=${appUrl}">
  <title>Имейлът е потвърден | Energy Bulgaria</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background-color: #f3f4f6; color: #111827; }
    .card { background: white; padding: 48px 40px; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); text-align: center; max-width: 480px; width: 90%; border: 1px solid #e5e7eb; }
    .badge { display: inline-flex; align-items: center; justify-content: center; width: 72px; height: 72px; background: #ecfdf5; color: #059669; border-radius: 50%; font-size: 36px; margin-bottom: 20px; font-weight: bold; border: 2px solid #a7f3d0; }
    h1 { font-size: 24px; font-weight: 700; margin: 0 0 12px; color: #064e3b; }
    p { color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 28px; }
    .btn { display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 700; font-size: 15px; transition: background-color 0.15s; }
    .btn:hover { background-color: #047857; }
    .note { margin-top: 20px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓</div>
    <h1>Имейлът е потвърден!</h1>
    <p>Твоят имейл адрес беше успешно потвърден. Профилът ти в <strong>Energy Bulgaria</strong> вече е напълно активиран.</p>
    <a href="${appUrl}" class="btn">Към приложението</a>
    <div class="note">Ще бъдете пренасочени автоматично след няколко секунди...</div>
  </div>
</body>
</html>`;
}

/**
 * Renders the HTML error page when an email verification link is invalid, expired, or missing.
 */
export function renderVerificationErrorHtml({ errorMessage = 'Невалиден или изтекъл токен за потвърждение.', appUrl = process.env.CLIENT_ORIGIN || 'http://localhost:5173' } = {}) {
  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Грешка при потвърждение | Energy Bulgaria</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background-color: #f3f4f6; color: #111827; }
    .card { background: white; padding: 48px 40px; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); text-align: center; max-width: 480px; width: 90%; border: 1px solid #fee2e2; }
    .badge { display: inline-flex; align-items: center; justify-content: center; width: 72px; height: 72px; background: #fef2f2; color: #dc2626; border-radius: 50%; font-size: 36px; margin-bottom: 20px; font-weight: bold; border: 2px solid #fecaca; }
    h1 { font-size: 24px; font-weight: 700; margin: 0 0 12px; color: #991b1b; }
    p { color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 28px; }
    .btn { display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 700; font-size: 15px; transition: background-color 0.15s; }
    .btn:hover { background-color: #b91c1c; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✕</div>
    <h1>Неуспешно потвърждение</h1>
    <p>${errorMessage}<br><br>Потвърждението на имейл става <strong>единствено през бутона в получения имейл</strong>. Ако токенът е изтекъл, влезте в профила си и заявете нов имейл.</p>
    <a href="${appUrl}" class="btn">Към Energy Bulgaria</a>
  </div>
</body>
</html>`;
}

export const emailService = {
  /**
   * Sends an email verification message containing the square "VERIFY EMAIL" button.
   */
  async sendVerificationEmail({ email, name = '', token, clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173' }) {
    const verifyUrl = `${clientOrigin.replace(/\/$/, '')}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    const html = renderVerificationEmailHtml({ name, verifyUrl });
    const text = `Здравей, ${name}!\n\nМоля, потвърди своя имейл адрес за Energy Bulgaria, като отвориш следния линк:\n${verifyUrl}\n\nЛинкът е валиден 24 часа.`;

    return activeTransporter.sendMail({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Потвърди своя имейл адрес | Verify Email - Energy Bulgaria',
      text,
      html,
      _directVerifyUrl: verifyUrl,
    });
  },

  /**
   * Sends a password reset email message containing the square "RESET PASSWORD" button.
   */
  async sendPasswordResetEmail({ email, name = '', token, clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173' }) {
    const resetUrl = `${clientOrigin.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    const html = renderPasswordResetEmailHtml({ name, resetUrl });
    const text = `Здравей, ${name}!\n\nПолучихме заявка за промяна на паролата в Energy Bulgaria. Отвори следния линк за нова парола:\n${resetUrl}\n\nЛинкът е валиден 1 час.`;

    return activeTransporter.sendMail({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Възстановяване на парола | Password Reset - Energy Bulgaria',
      text,
      html,
      _directVerifyUrl: resetUrl,
    });
  },
};

export default emailService;
