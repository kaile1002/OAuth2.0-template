INSERT INTO users(email, password, full_name)
VALUES
  ('alice@company.com', 'P@ssw0rd!', 'Alice Zhang'),
  ('bob@company.com', 'P@ssw0rd!', 'Bob Li')
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO oauth_clients(client_id, client_secret, redirect_uri, scopes)
VALUES
  ('portal-web', 'portal-secret', 'http://localhost:3000/auth/callback', 'openid profile email')
ON DUPLICATE KEY UPDATE redirect_uri = VALUES(redirect_uri), scopes = VALUES(scopes);
