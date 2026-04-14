import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const secret = process.env.JWT_SECRET || 'dev-only-change-me';

export function signUserToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    secret,
    { expiresIn: '14d' }
  );
}

export function verifyUserToken(token) {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}
