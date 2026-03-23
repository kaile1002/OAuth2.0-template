import crypto from 'crypto';

export function randomString(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Base64Url(value) {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

export function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
