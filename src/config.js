import 'dotenv/config';

export const config = {
  app: {
    port: Number(process.env.PORT || 3000),
    baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000'
  },
  session: {
    secret: process.env.SESSION_SECRET || 'dev-session-secret'
  },
  oauth: {
    issuer: process.env.OAUTH_ISSUER || 'http://localhost:3000',
    authorizationEndpoint: '/oauth/authorize',
    tokenEndpoint: '/oauth/token',
    clientId: process.env.PORTAL_CLIENT_ID || 'portal-web',
    clientSecret: process.env.PORTAL_CLIENT_SECRET || 'portal-secret',
    redirectUri: process.env.PORTAL_REDIRECT_URI || 'http://localhost:3000/auth/callback'
  },
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'root',
    database: process.env.MYSQL_DATABASE || 'oauth_demo'
  }
};
