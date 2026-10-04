import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../../config/env.js';
import { ErrorCode, unauthorized } from '../errors/index.js';

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

// jsonwebtoken types expiresIn as a template literal union from `ms`; ours is a validated env string.
const accessExpiresIn = config.auth.access.expiresIn as SignOptions['expiresIn'];
const refreshExpiresIn = config.auth.refresh.expiresIn as SignOptions['expiresIn'];

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ email: payload.email }, config.auth.access.secret, {
    subject: payload.userId,
    expiresIn: accessExpiresIn,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign({}, config.auth.refresh.secret, {
    subject: payload.userId,
    jwtid: payload.tokenId,
    expiresIn: refreshExpiresIn,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.auth.access.secret);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.email !== 'string') {
      throw unauthorized('Invalid access token');
    }
    return { userId: decoded.sub, email: decoded.email };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw unauthorized('Access token expired', ErrorCode.ACCESS_TOKEN_EXPIRED);
    }
    throw unauthorized('Invalid access token');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, config.auth.refresh.secret);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.jti !== 'string') {
      throw unauthorized('Invalid refresh token');
    }
    return { userId: decoded.sub, tokenId: decoded.jti };
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }
}
