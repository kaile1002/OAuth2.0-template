import express from 'express';
import { config } from '../config.js';
import { randomString, sha256Base64Url } from '../services/crypto.js';
import { verifyIdToken } from '../services/oidc.js';

const router = express.Router();

router.get('/', (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.send(`
      <html><body>
      <h1>公司门户</h1>
      <p>未登录</p>
      <a href="/auth/login"><button>使用企业账号登录</button></a>
      </body></html>
    `);
  }

  res.send(`
    <html><body>
    <h1>公司门户</h1>
    <p>欢迎：${user.name} (${user.email})</p>
    <p>sub: ${user.sub}</p>
    <a href="/auth/logout"><button>退出登录</button></a>
    </body></html>
  `);
});

router.get('/auth/login', (req, res) => {
  const state = randomString(16);
  const nonce = randomString(16);
  const codeVerifier = randomString(48);
  const codeChallenge = sha256Base64Url(codeVerifier);

  req.session.oauth = { state, nonce, codeVerifier };

  const authUrl = new URL(config.oauth.authorizationEndpoint, config.app.baseUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', config.oauth.clientId);
  authUrl.searchParams.set('redirect_uri', config.oauth.redirectUri);
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('nonce', nonce);

  res.redirect(authUrl.toString());
});

router.get('/auth/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.status(400).send(`授权失败: ${error}`);
    }

    const pending = req.session.oauth;
    if (!pending || pending.state !== state) {
      return res.status(400).send('state 校验失败');
    }

    const tokenResponse = await fetch(new URL(config.oauth.tokenEndpoint, config.app.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.oauth.redirectUri,
        client_id: config.oauth.clientId,
        client_secret: config.oauth.clientSecret,
        code_verifier: pending.codeVerifier
      })
    });

    if (!tokenResponse.ok) {
      const payload = await tokenResponse.text();
      return res.status(400).send(`换 token 失败: ${payload}`);
    }

    const tokenPayload = await tokenResponse.json();
    const claims = await verifyIdToken(tokenPayload.id_token, pending.nonce);

    req.session.user = {
      sub: claims.sub,
      email: claims.email,
      name: claims.name,
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token
    };

    req.session.oauth = null;
    return res.redirect('/');
  } catch (error) {
    return next(error);
  }
});

router.get('/auth/refresh', async (req, res) => {
  const user = req.session.user;
  if (!user?.refreshToken) {
    return res.status(401).json({ error: 'not_logged_in' });
  }

  const tokenResponse = await fetch(new URL(config.oauth.tokenEndpoint, config.app.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: user.refreshToken,
      client_id: config.oauth.clientId,
      client_secret: config.oauth.clientSecret
    })
  });

  const payload = await tokenResponse.json();
  if (!tokenResponse.ok) {
    return res.status(400).json(payload);
  }

  req.session.user.accessToken = payload.access_token;
  req.session.user.refreshToken = payload.refresh_token;
  return res.json({ ok: true, expires_in: payload.expires_in });
});

router.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

export default router;
