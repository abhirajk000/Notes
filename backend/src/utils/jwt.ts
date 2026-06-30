import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../types';

const SECRET = process.env.JWT_SECRET!;
const EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'];

if (!SECRET) {
  throw new Error('JWT_SECRET environment variable is not set.');
}

export function signToken(userId: string): string {
  const payload: JwtPayload = { sub: userId };
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN, algorithm: 'HS256' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] }) as JwtPayload;
}
