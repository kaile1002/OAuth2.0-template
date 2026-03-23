import express from 'express';
import session from 'express-session';
import { config } from './config.js';
import oauthRoutes from './routes/oauth.js';
import portalRoutes from './routes/portal.js';
import { pingDb } from './db/mysql.js';

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  session({
    name: 'portal.sid',
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 2 * 60 * 60 * 1000
    }
  })
);

app.use('/oauth', oauthRoutes);
app.use('/', portalRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error', message: err.message });
});

async function bootstrap() {
  try {
    await pingDb();
    console.log('MySQL connected');
  } catch (error) {
    console.warn('MySQL not connected. Check DB settings before using OAuth flows.', error.message);
  }

  app.listen(config.app.port, () => {
    console.log(`Server running on ${config.app.baseUrl}`);
  });
}

bootstrap();
