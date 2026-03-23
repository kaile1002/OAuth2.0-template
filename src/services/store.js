import { pool } from '../db/mysql.js';
import { hashToken } from './crypto.js';

export async function getClient(clientId) {
  const [rows] = await pool.query(
    'SELECT client_id, client_secret, redirect_uri, scopes FROM oauth_clients WHERE client_id = ? LIMIT 1',
    [clientId]
  );
  return rows[0] || null;
}

export async function getUserByEmail(email) {
  const [rows] = await pool.query(
    'SELECT id, email, password, full_name FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

export async function getUserById(id) {
  const [rows] = await pool.query(
    'SELECT id, email, full_name FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

export async function createAuthorizationCode({ code, clientId, userId, redirectUri, scope, codeChallenge, codeChallengeMethod, nonce, expiresAt }) {
  await pool.query(
    `INSERT INTO oauth_authorization_codes
      (code, client_id, user_id, redirect_uri, scope, code_challenge, code_challenge_method, nonce, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, clientId, userId, redirectUri, scope, codeChallenge, codeChallengeMethod, nonce, expiresAt]
  );
}

export async function consumeAuthorizationCode(code) {
  const [rows] = await pool.query(
    'SELECT * FROM oauth_authorization_codes WHERE code = ? LIMIT 1',
    [code]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.consumed_at) return null;
  if (new Date(row.expires_at) < new Date()) return null;

  await pool.query(
    'UPDATE oauth_authorization_codes SET consumed_at = NOW() WHERE code = ? AND consumed_at IS NULL',
    [code]
  );

  return row;
}

export async function saveAccessToken({ token, userId, clientId, scope, expiresAt }) {
  const tokenHash = hashToken(token);
  await pool.query(
    `INSERT INTO oauth_access_tokens
      (token_hash, user_id, client_id, scope, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [tokenHash, userId, clientId, scope, expiresAt]
  );
}

export async function saveRefreshToken({ token, userId, clientId, scope, familyId, rotatedFrom, expiresAt }) {
  const tokenHash = hashToken(token);
  await pool.query(
    `INSERT INTO oauth_refresh_tokens
      (token_hash, user_id, client_id, scope, family_id, rotated_from, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tokenHash, userId, clientId, scope, familyId, rotatedFrom, expiresAt]
  );
}

export async function getRefreshToken(token) {
  const tokenHash = hashToken(token);
  const [rows] = await pool.query(
    'SELECT * FROM oauth_refresh_tokens WHERE token_hash = ? LIMIT 1',
    [tokenHash]
  );
  return rows[0] || null;
}

export async function markRefreshTokenUsed(id) {
  await pool.query('UPDATE oauth_refresh_tokens SET used_at = NOW() WHERE id = ?', [id]);
}

export async function revokeRefreshTokenFamily(familyId) {
  await pool.query(
    'UPDATE oauth_refresh_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL',
    [familyId]
  );
}

export async function revokeRefreshToken(id, replacedBy) {
  await pool.query(
    'UPDATE oauth_refresh_tokens SET revoked_at = NOW(), replaced_by = ? WHERE id = ?',
    [replacedBy, id]
  );
}
