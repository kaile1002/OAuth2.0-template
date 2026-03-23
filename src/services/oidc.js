import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

const secret = new TextEncoder().encode(process.env.ID_TOKEN_SECRET || 'dev-id-token-secret-change-me');

export async function signIdToken({ sub, nonce, email, name }) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub,
    email,
    name,
    nonce
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(config.oauth.issuer)
    .setAudience(config.oauth.clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .setSubject(sub)
    .sign(secret);
}

export async function verifyIdToken(idToken, nonce) {
  const { payload } = await jwtVerify(idToken, secret, {
    issuer: config.oauth.issuer,
    audience: config.oauth.clientId
  });

  if (payload.nonce !== nonce) {
    throw new Error('nonce mismatch');
  }

  return payload;
}
