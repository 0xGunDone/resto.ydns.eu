import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';

// Use getter functions to read secrets at runtime, allowing tests to set env vars
const getJwtSecret = (): Secret => process.env.JWT_SECRET || 'your-secret-key';
const getJwtRefreshSecret = (): Secret => process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const getJwtExpiresIn = (): SignOptions['expiresIn'] => 
  process.env.JWT_EXPIRES_IN ? (process.env.JWT_EXPIRES_IN as SignOptions['expiresIn']) : '24h';
const getJwtRefreshExpiresIn = (): SignOptions['expiresIn'] => 
  process.env.JWT_REFRESH_EXPIRES_IN ? (process.env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn']) : '7d';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getJwtExpiresIn(),
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, getJwtRefreshSecret(), {
    expiresIn: getJwtRefreshExpiresIn(),
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, getJwtSecret()) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, getJwtRefreshSecret()) as TokenPayload;
};

