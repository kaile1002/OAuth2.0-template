# OAuth2/OIDC Node BFF Skeleton (Node.js + MySQL)

这是一个可运行的最小骨架，实现了你确认的方案：

- OIDC + OAuth2 Authorization Code + PKCE
- Portal 采用 Node BFF
- Refresh Token Rotation + Replay Detection

## 快速启动

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

3. 初始化数据库

```bash
mysql -uroot -proot -e "CREATE DATABASE IF NOT EXISTS oauth_demo;"
mysql -uroot -proot oauth_demo < src/db/schema.sql
mysql -uroot -proot oauth_demo < src/db/seed.sql
```

4. 启动

```bash
npm run dev
```

5. 浏览器访问

- `http://localhost:3000`
- 点击“使用企业账号登录”
- 在授权页使用预置账号 `alice@company.com / P@ssw0rd!`

## 核心接口

- `GET /oauth/authorize`
- `POST /oauth/authorize/decision`
- `POST /oauth/token` (`authorization_code` / `refresh_token`)
- `GET /auth/login`
- `GET /auth/callback`
- `GET /auth/refresh`
- `GET /auth/logout`

## 安全说明（MVP）

- 当前示例为了快速演示，用户密码为明文种子，生产必须替换为哈希。
- `id_token` 采用 HS256 对称签名，生产建议改为 RS256 + JWKS。
- session 默认内存存储，生产建议 Redis。
