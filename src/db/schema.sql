CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(128) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(128) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_clients (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  client_id VARCHAR(128) NOT NULL UNIQUE,
  client_secret VARCHAR(255) NOT NULL,
  redirect_uri VARCHAR(255) NOT NULL,
  scopes VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(255) NOT NULL UNIQUE,
  client_id VARCHAR(128) NOT NULL,
  user_id BIGINT NOT NULL,
  redirect_uri VARCHAR(255) NOT NULL,
  scope VARCHAR(255) NOT NULL,
  code_challenge VARCHAR(255) NOT NULL,
  code_challenge_method VARCHAR(16) NOT NULL,
  nonce VARCHAR(255),
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_code_expires_at (expires_at)
);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id BIGINT NOT NULL,
  client_id VARCHAR(128) NOT NULL,
  scope VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_access_token_expires_at (expires_at)
);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id BIGINT NOT NULL,
  client_id VARCHAR(128) NOT NULL,
  scope VARCHAR(255) NOT NULL,
  family_id VARCHAR(128) NOT NULL,
  rotated_from BIGINT,
  replaced_by VARCHAR(64),
  used_at DATETIME,
  revoked_at DATETIME,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_refresh_family (family_id),
  INDEX idx_refresh_expires_at (expires_at)
);
