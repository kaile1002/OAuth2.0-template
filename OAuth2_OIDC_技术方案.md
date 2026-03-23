# 公司员工平台 OAuth2.0 授权登录技术方案（Node.js + MySQL）

> 目标：实现类似 GitHub Login 的“点击授权按钮 -> 跳转授权页 -> 用户确认授权 -> 回跳首页并登录成功”的企业内部统一登录能力。

## 1. 方案结论（先给结论）

基于 2026 年仍然主流且安全基线更高的做法，本项目建议采用：

- 协议：**OAuth 2.0 Authorization Code + PKCE**（即便是机密客户端也建议开启 PKCE）。
- 身份层：**OpenID Connect (OIDC)**，通过 `id_token` 获取标准化用户身份信息。
- 安全基线：按 **OAuth 2.0 Security BCP (RFC 9700)** 执行（禁隐式模式、严格重定向 URI、state 防 CSRF、短期 access token、refresh token 轮换等）。
- 规范演进：参考 **OAuth 2.1 草案（draft-ietf-oauth-v2-1）** 的方向（合并 OAuth2 实战最佳实践）。
- 服务形态：
  - `authorization-server`（Node.js）：授权端点、令牌端点、用户信息端点、JWK/发现端点。
  - `employee-portal`（Node.js）：业务前端与会话管理（或 BFF），提供“登录按钮”和回调处理。
- 存储：MySQL 存储 client、授权码、token、用户、同意记录、审计日志。

---

## 2. 架构设计

```text
[Browser]
   | 1. 点击“企业登录”
   v
[Employee Portal (Client/BFF)] ---2. 302---> [Authorization Server]
   ^                                         | 3. 用户登录+授权
   | 7. 建立业务会话                           v
   |<---6. code + state--- 浏览器回调 <---4. 302 回调
   |
   | 8. 后端直连 /token (code_verifier)
   v
[Authorization Server] ---9. 返回 access_token/id_token/refresh_token---> [Portal]
```

推荐部署域名示例：

- 门户：`https://portal.company.com`
- 授权服务：`https://auth.company.com`

---

## 3. 登录流程（GitHub 风格）

### Step A：用户点击登录按钮
前端跳转到授权端点 `/authorize`，示例：

```http
GET /authorize?
 response_type=code
&client_id=portal-web
&redirect_uri=https%3A%2F%2Fportal.company.com%2Fauth%2Fcallback
&scope=openid%20profile%20email
&state=2fF2x...随机串
&code_challenge=Jt3...Base64URL
&code_challenge_method=S256
&nonce=n-0S6...随机串
```

### Step B：授权服务器认证+授权
- 若用户未登录，先企业账号登录（如账号密码/企业 SSO）。
- 展示授权确认页（可记住授权同意）。

### Step C：回调
授权成功后跳转：

```http
302 Location: https://portal.company.com/auth/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=2fF2x...
```

### Step D：换 Token（后端到后端）
Portal 后端带 `code_verifier` 请求 `/token`：

```http
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https%3A%2F%2Fportal.company.com%2Fauth%2Fcallback
&client_id=portal-web
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

返回：

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 600,
  "refresh_token": "...",
  "id_token": "...",
  "scope": "openid profile email"
}
```

### Step E：建立本地登录态
- 校验 `state`、`nonce`、`id_token` 签名与 claims。
- 创建平台会话（推荐 HttpOnly + Secure + SameSite Cookie）。
- 重定向到首页，登录成功。

---

## 4. 授权流程参数“完整说明”

> 按“请求参数 / 响应参数 / Token Claims / 常见错误”分类，便于开发与联调。

### 4.1 `/authorize` 请求参数

| 参数 | 必填 | 示例 | 说明 | 安全要点 |
|---|---|---|---|---|
| `response_type` | 是 | `code` | 授权类型。此方案固定使用授权码模式。 | 禁用 `token`（隐式流）。 |
| `client_id` | 是 | `portal-web` | 客户端标识。由授权服务注册分配。 | 不可猜测、不可复用。 |
| `redirect_uri` | 是 | `https://portal.company.com/auth/callback` | 用户授权后回跳地址。 | 必须与预注册值**精确匹配**。 |
| `scope` | 是 | `openid profile email` | 权限范围。`openid` 表示 OIDC 登录。 | 最小权限原则。 |
| `state` | 强烈必填 | 随机串 | 客户端防 CSRF 的关联值。回调时必须一致。 | 每次请求唯一，校验失败立即拒绝。 |
| `code_challenge` | PKCE 必填 | `base64url(sha256(code_verifier))` | PKCE 挑战值。 | 必须配合 `S256`。 |
| `code_challenge_method` | PKCE 必填 | `S256` | 挑战算法。 | 禁 `plain`。 |
| `nonce` | OIDC 推荐 | 随机串 | 绑定 `id_token`，防重放。 | 回调时与 `id_token` 中 nonce 对比。 |
| `prompt` | 可选 | `login` / `consent` / `none` | 控制是否强制登录或授权页展示。 | `none` 失败要处理。 |
| `login_hint` | 可选 | `alice@company.com` | 登录提示。 | 不要泄漏敏感信息。 |
| `ui_locales` | 可选 | `zh-CN` | 界面语言偏好。 | 仅体验参数。 |

### 4.2 回调参数（`redirect_uri`）

| 参数 | 场景 | 说明 | 校验 |
|---|---|---|---|
| `code` | 成功 | 短期一次性授权码。 | 只能使用一次，短有效期。 |
| `state` | 成功 | 原样回传客户端 state。 | 必须完全一致。 |
| `error` | 失败 | 如 `access_denied`。 | 记录审计并给用户友好提示。 |
| `error_description` | 失败 | 人类可读描述。 | 不回显内部栈信息。 |
| `error_uri` | 失败 | 错误文档地址。 | 可用于诊断链接。 |

### 4.3 `/token` 请求参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `grant_type` | 是 | `authorization_code`（换 token）或 `refresh_token`（刷新）。 |
| `code` | 授权码模式必填 | 从回调获得的授权码。 |
| `redirect_uri` | 推荐必填 | 必须与授权请求一致。 |
| `client_id` | 是 | 客户端 ID。 |
| `client_secret` | 机密客户端必填 | 若采用机密客户端认证则需要。 |
| `code_verifier` | PKCE 必填 | 与原始 challenge 匹配。 |
| `refresh_token` | 刷新模式必填 | 用于获取新 access token。 |
| `scope` | 可选 | 通常刷新时可缩小 scope，不可提升权限。 |

### 4.4 `/token` 响应参数

| 参数 | 说明 | 建议 |
|---|---|---|
| `access_token` | 访问受保护资源的令牌。 | 短时效（如 5~15 分钟）。 |
| `token_type` | 通常 `Bearer`。 | 资源端按 Bearer 解析。 |
| `expires_in` | access_token 过期秒数。 | 前后端统一过期策略。 |
| `refresh_token` | 刷新令牌。 | 启用轮换（Rotation）。 |
| `id_token` | OIDC 身份 JWT。 | 必须验签 + 验 claim。 |
| `scope` | 实际授予 scope。 | 以返回值为准。 |

### 4.5 `id_token` 关键 Claims 说明

| Claim | 说明 | 校验规则 |
|---|---|---|
| `iss` | 颁发者（授权服务 URL）。 | 必须等于预期 issuer。 |
| `sub` | 用户唯一标识。 | 作为内部用户映射主键之一。 |
| `aud` | 受众（client_id）。 | 必须包含当前 client_id。 |
| `exp` | 过期时间。 | 当前时间必须小于 exp。 |
| `iat` | 签发时间。 | 不能过旧，考虑时钟偏差。 |
| `nonce` | 与登录请求 nonce 对应。 | 必须一致。 |
| `auth_time` | 用户认证时间。 | 高安全场景可要求最近认证。 |
| `email`/`name` 等 | 用户资料。 | 仅作展示，敏感字段按最小化。 |

### 4.6 常见错误码

| 错误码 | 含义 | 常见原因 |
|---|---|---|
| `invalid_request` | 请求参数有误 | 缺参数、格式不合法 |
| `unauthorized_client` | 客户端无权使用该授权方式 | client 配置不允许 |
| `access_denied` | 用户拒绝授权 | 用户在授权页取消 |
| `unsupported_response_type` | 不支持的响应类型 | 传了 `token` 等不允许类型 |
| `invalid_scope` | scope 非法 | 请求超出注册权限 |
| `server_error` | 服务端内部错误 | AS 异常 |
| `temporarily_unavailable` | 服务暂不可用 | 维护/限流 |
| `invalid_grant` | 授权码/刷新令牌无效 | 过期、已使用、已撤销 |
| `invalid_client` | 客户端认证失败 | client_secret 错误 |

---

## 5. MySQL 数据模型（可先用模拟数据）

> 下面是首版最小可用表，后续可平滑扩展。

- `users`：员工账户（`id`, `email`, `password_hash`, `status`, `created_at`）
- `oauth_clients`：客户端注册信息（`client_id`, `client_secret_hash`, `redirect_uris`, `scopes`, `is_confidential`）
- `oauth_authorization_codes`：授权码（`code`, `user_id`, `client_id`, `redirect_uri`, `code_challenge`, `expires_at`, `consumed_at`）
- `oauth_access_tokens`：访问令牌（`jti`, `user_id`, `client_id`, `scope`, `expires_at`, `revoked_at`）
- `oauth_refresh_tokens`：刷新令牌（`jti`, `parent_jti`, `rotated_from`, `user_id`, `client_id`, `expires_at`, `revoked_at`）
- `oauth_consents`：授权同意记录（`user_id`, `client_id`, `scopes`, `granted_at`）
- `audit_logs`：审计日志（登录、授权、撤销、异常）

实现上建议：
- token 仅存哈希（不可逆）。
- refresh token rotation + 重放检测（发现旧 refresh token 重用则吊销整条链）。

---

## 6. Node.js 落地建议（2026 推荐）

### 6.1 组件建议

- Authorization Server：
  - 可选成熟实现：`node-oidc-provider`（OIDC/OAuth2 AS，生态成熟）。
  - 自研时需覆盖：授权码、PKCE、JWKS、发现端点、撤销、内省、审计。
- Portal Client：
  - 服务端应用可用 `openid-client` 对接标准 OIDC Provider。
- 会话：
  - Portal 侧采用服务端 session（Redis/MySQL）+ HttpOnly Cookie。

### 6.2 安全配置清单

- 强制 HTTPS（生产环境）。
- `state`、`nonce` 每次登录随机且一次性。
- 仅允许 `response_type=code`。
- PKCE 强制 `S256`。
- 精确匹配 `redirect_uri`。
- `id_token` 必做签名和 claim 校验。
- access token 短期有效，refresh token 轮换。
- 增加 `/revoke`（用户登出或管理员强制失效）。
- 增加速率限制、登录风控、异常告警。

---

## 7. 分阶段实施计划

### Phase 1（MVP，1~2 周）
- 完成登录按钮、授权页、授权码流程、回调登录。
- MySQL 落库（用户/客户端/授权码/token）。
- 支持 `openid profile email`。
- 模拟员工数据可先写死 2~3 个账号。

### Phase 2（安全增强）
- refresh token rotation + replay 检测。
- `/revoke`、`/userinfo`、`/.well-known/openid-configuration`、`/jwks`。
- 审计日志与基础监控。

### Phase 3（企业化）
- 多租户/多应用 client 管理台。
- SSO 单点登录与统一登出（前后端联动）。
- 细粒度 scope 与动态同意管理。

---

## 8. 本方案“模拟数据”说明

为了便于先联调，可先模拟：

- 员工账户：`alice@company.com / P@ssw0rd!`、`bob@company.com / P@ssw0rd!`
- client：
  - `client_id`: `portal-web`
  - `redirect_uri`: `https://portal.company.com/auth/callback`
  - `scopes`: `openid profile email`

后续替换为真实员工目录（如 AD/LDAP/企业主数据）即可。

---

## 9. 参考标准与最新依据（2026-03）

1. OAuth 2.0 Security Best Current Practice, RFC 9700（已发布，2025）
2. The OAuth 2.1 Authorization Framework, draft-ietf-oauth-v2-1-15（2026-03-02 更新）
3. OpenID Connect Core 1.0（OIDC 核心规范）
4. OAuth 2.0 (RFC 6749) / Bearer Token Usage (RFC 6750)
5. OAuth 2.0 for Native Apps (RFC 8252)

---

## 10. 需要你确认的决策点（请先确认再进入编码）

1. 是否采用 **OIDC + OAuth2 授权码 + PKCE** 作为最终方案？
2. Portal 是纯前端 SPA，还是 **Node BFF（推荐）**？
3. 刷新令牌策略：是否默认启用 **轮换 + 重放熔断**？
4. 员工账号源：先本地 MySQL，后续是否对接企业目录（LDAP/AD/HR 系统）？
5. 是否需要我下一步直接生成可运行的 Node.js + MySQL 项目骨架（含授权页、登录按钮、回调、token 接口）？


## 11. 决策确认结果（2026-03-23）

- ✅ 最终方案：OIDC + 授权码 + PKCE
- ✅ Portal 形态：Node BFF
- ✅ Token 策略：Refresh Token 轮换 + 重放检测
- ✅ 下一步：开始生成可运行项目骨架（已执行）
