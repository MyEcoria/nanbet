import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Middleware: verifyTurnstile
 *
 * Expects the client to send a Cloudflare Turnstile token in the request body
 * as `cf_turnstile_response`. Verifies it against Cloudflare's Siteverify API.
 *
 * Required env var: CLOUDFLARE_TURNSTILE_SECRET_KEY
 *
 * Usage in route:
 *   router.post('/spin-wheel', verifyToken, verifyTurnstile, spinWheel);
 */
export async function verifyTurnstile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    logger.error('CLOUDFLARE_TURNSTILE_SECRET_KEY is not set — Turnstile check skipped');
    // Fail open only in development so you can run locally without Turnstile
    if (process.env.NODE_ENV === 'development') {
      next();
      return;
    }
    res.status(500).json({ success: false, message: 'Server misconfiguration' });
    return;
  }

  const token: unknown = req.body?.cf_turnstile_response;

  if (!token || typeof token !== 'string' || token.trim() === '') {
    res.status(400).json({
      success: false,
      message: 'Missing Turnstile token. Please complete the CAPTCHA.',
    });
    return;
  }

  // Forward the real client IP so Cloudflare can apply its own risk scoring
  const clientIp =
    req.ip ||
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '';

  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (clientIp) formData.append('remoteip', clientIp);

    const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData,
    });

    if (!verifyRes.ok) {
      logger.error('Turnstile API returned non-200 status', { status: verifyRes.status });
      res.status(502).json({
        success: false,
        message: 'Could not verify CAPTCHA. Please try again.',
      });
      return;
    }

    const data = (await verifyRes.json()) as TurnstileVerifyResponse;

    if (!data.success) {
      logger.warn('Turnstile verification failed', {
        errorCodes: data['error-codes'],
        ip: clientIp,
      });
      res.status(403).json({
        success: false,
        message: 'CAPTCHA verification failed. Please refresh and try again.',
        errorCodes: data['error-codes'],
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Turnstile verification error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      message: 'Could not verify CAPTCHA. Please try again.',
    });
  }
}
