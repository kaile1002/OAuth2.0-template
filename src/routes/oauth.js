import express from 'express';
import {
  consumeAuthorizationCode,
  createAuthorizationCode,
  getClient,
  getRefreshToken,
  getUserByEmail,
  getUserById,
  markRefreshTokenUsed,
  revokeRefreshToken,
  revokeRefreshTokenFamily,
  saveAccessToken,
  saveRefreshToken
} from '../services/store.js';
import { randomString, sha256Base64Url } from '../services/crypto.js';
import { config } from '../config.js';
import { signIdToken } from '../services/oidc.js';

const router = express.Router();

router.get('/authorize', async (req, res) => {
  const {
    response_type,
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
    nonce
  } = req.query;

  if (response_type !== 'code') {
    return res.status(400).send('unsupported_response_type');
  }

  const client = await getClient(client_id);
  if (!client || client.redirect_uri !== redirect_uri) {
    return res.status(400).send('invalid_client_or_redirect_uri');
  }

  if (!state || !code_challenge || code_challenge_method !== 'S256') {
    return res.status(400).send('invalid_request');
  }

  res.send(`
    <html><body>
      <h2>企业授权登录</h2>
      <p>client: ${client_id}</p>
      <form method="post" action="/oauth/authorize/decision">
        <input type="hidden" name="client_id" value="${client_id}" />
        <input type="hidden" name="redirect_uri" value="${redirect_uri}" />
        <input type="hidden" name="scope" value="${scope}" />
        <input type="hidden" name="state" value="${state}" />
        <input type="hidden" name="code_challenge" value="${code_challenge}" />
        <input type="hidden" name="code_challenge_method" value="${code_challenge_method}" />
        <input type="hidden" name="nonce" value="${nonce || ''}" />
        <label>邮箱: <input name="email" value="alice@company.com" /></label><br/><br/>
        <label>密码: <input type="password" name="password" value="P@ssw0rd!" /></label><br/><br/>
        <button type="submit" name="decision" value="approve">同意授权</button>
        <button type="submit" name="decision" value="deny">拒绝</button>
      </form>
    </body></html>
  `);
});

router.post('/authorize/decision', async (req, res) => {
  const {
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
    nonce,
    email,
    password,
    decision
  } = req.body;

  if (decision === 'deny') {
    return res.redirect(`${redirect_uri}?error=access_denied&state=${encodeURIComponent(state)}`);
  }

  const user = await getUserByEmail(email);
  if (!user || user.password !== password) {
    return res.status(401).send('invalid_user_credentials');
  }

  const code = randomString(24);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await createAuthorizationCode({
    code,
    clientId: client_id,
    userId: user.id,
    redirectUri: redirect_uri,
    scope,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method,
    nonce,
    expiresAt
  });

  res.redirect(`${redirect_uri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
});

router.post('/token', async (req, res) => {
  const { grant_type } = req.body;

  if (grant_type === 'authorization_code') {
    const { code, redirect_uri, client_id, client_secret, code_verifier } = req.body;

    const client = await getClient(client_id);
    if (!client || client.client_secret !== client_secret || client.redirect_uri !== redirect_uri) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    const authCode = await consumeAuthorizationCode(code);
    if (!authCode) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    if (authCode.code_challenge_method !== 'S256') {
      return res.status(400).json({ error: 'invalid_request' });
    }

    if (sha256Base64Url(code_verifier) !== authCode.code_challenge) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    const user = await getUserById(authCode.user_id);
    const accessToken = randomString(32);
    const refreshToken = randomString(32);
    const familyId = randomString(12);
    const accessExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await saveAccessToken({
      token: accessToken,
      userId: user.id,
      clientId: authCode.client_id,
      scope: authCode.scope,
      expiresAt: accessExpiresAt
    });

    await saveRefreshToken({
      token: refreshToken,
      userId: user.id,
      clientId: authCode.client_id,
      scope: authCode.scope,
      familyId,
      rotatedFrom: null,
      expiresAt: refreshExpiresAt
    });

    const idToken = await signIdToken({
      sub: String(user.id),
      nonce: authCode.nonce,
      email: user.email,
      name: user.full_name
    });

    return res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 600,
      refresh_token: refreshToken,
      id_token: idToken,
      scope: authCode.scope
    });
  }

  if (grant_type === 'refresh_token') {
    const { refresh_token, client_id, client_secret } = req.body;
    const client = await getClient(client_id);
    if (!client || client.client_secret !== client_secret) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    const current = await getRefreshToken(refresh_token);
    if (!current) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    if (current.revoked_at || new Date(current.expires_at) < new Date()) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    if (current.used_at) {
      await revokeRefreshTokenFamily(current.family_id);
      return res.status(400).json({ error: 'invalid_grant', error_description: 'refresh token replay detected; family revoked' });
    }

    await markRefreshTokenUsed(current.id);

    const newRefreshToken = randomString(32);
    const newAccessToken = randomString(32);
    const newRefreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const accessExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await saveAccessToken({
      token: newAccessToken,
      userId: current.user_id,
      clientId: current.client_id,
      scope: current.scope,
      expiresAt: accessExpiresAt
    });

    await saveRefreshToken({
      token: newRefreshToken,
      userId: current.user_id,
      clientId: current.client_id,
      scope: current.scope,
      familyId: current.family_id,
      rotatedFrom: current.id,
      expiresAt: newRefreshExpiresAt
    });

    await revokeRefreshToken(current.id, newRefreshToken.slice(0, 16));

    return res.json({
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: 600,
      refresh_token: newRefreshToken,
      scope: current.scope
    });
  }

  return res.status(400).json({ error: 'unsupported_grant_type' });
});

export default router;
