# chat-web-auth-service

Chat Web 鉴权服务。负责登录、图形验证码、令牌签发与轮换、登录会话管理，以及供网关和内部服务调用的访问令牌内省。

## 职责边界

- 本服务是 JWT 密钥和登录会话的唯一持有者，其他服务不得持有密钥或读取会话存储。
- 本服务与账号服务共享 MySQL 数据库 `chat_web_account`，但只读取 `tb_account_user`；唯一写入的字段是 `last_login_time`，其余字段和全部其他表只由账号服务写入。
- 用户资料、组织、角色、菜单和权限归账号服务；本服务不承担授权（权限码）校验。
- 登录会话独占 Redis index `0`。

## 公开路由

网关前缀为 `/api/auth`。

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/auth/codex/write` | 公开 | 获取图形验证码，同时下发验证码 Cookie |
| POST | `/auth/token/login` | 公开 | 使用工号、手机号或邮箱登录并签发 Bearer Token |
| POST | `/auth/token/continue` | Bearer | 续期并轮换当前登录会话 |
| POST | `/auth/token/logout` | Bearer | 退出并撤销当前登录会话 |
| GET | `/auth/token/resolver` | Bearer | 获取当前登录账号资料 |
| GET | `/health` `/health/live` `/health/ready` | 公开 | 运行状态检查 |

## 内部路由

| 方法 | 路径 | 保护方式 | 说明 |
| --- | --- | --- | --- |
| POST | `/internal/auth/token/introspect` | `X-Service-Token` | 校验用户访问令牌并返回身份主体 |

内部路由不加入网关 `gateway.routes`，外网不可达。用户令牌通过请求体传递，调用方身份通过 `X-Service-Token` 校验，两种凭据严格分离。

## 环境变量

启动只需要 `NODE_ENV`、`PORT` 和 Nacos 连接参数，完整清单见 `.env.example`；部署变量见 `deploy/.env.example`。

## Nacos 配置

Data ID `chat-web-auth-service.yaml` 必须提供：

- `database.chat-web-account`：共享账号数据库连接。
- `redis`：登录会话存储，`database` 固定为 `0`。
- `security.jwt.secret` / `issuer` / `audience` / `accessTokenTtlSeconds`：令牌签发参数。
- `security.session.prefix`：登录会话键前缀。
- `feign.service_token`：内部认证接口的服务间共享凭据。

## 本地开发

```bash
yarn install
yarn dev
```

Swagger 文档：`http://127.0.0.1:5050/api/swagger`

## 验证

```bash
yarn format:check
yarn typecheck
yarn test
```

## 部署

只部署到主机 `chat-home-server`，部署目录 `/opt/chat-web-auth-service`，容器端口 `5050`。运行基线和排障命令见 `deploy/RUNBOOK.md`，变更记录见 `deploy/CHANGELOG.md`。
