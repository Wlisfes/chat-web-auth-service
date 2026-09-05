# 部署变更记录

## 2026-09-05 统一网关入口认证职责

- 影响机器：`chat-home-server`。
- 关联版本：Auth 当前 `developer` 分支改动。
- 变更内容：Auth 仅通过内部 `POST /internal/auth/token/introspect` 接收 Gateway 的用户令牌校验请求；该协议使用 `X-Service-Token` 校验调用方，不属于业务 Feign 路由。Auth 不配置 `feign.gateway` 或任何逐服务地址。
- 机器侧操作：在 `chat-web-auth-service.yaml` 保留数据库、Redis、JWT、会话配置和 `feign.service_token`；确认该凭据与 Gateway 一致。内部内省路径不得加入公开 `gateway.routes`。
- 验证命令：`yarn format:check && yarn typecheck && yarn test`；部署后分别验证登录、验证码和内部令牌内省。
- 回滚方法：恢复上一完整 Git SHA；不要把 Auth 的认证配置复制回业务服务。

## 2026-09-05 初始化鉴权服务

- 影响机器：`chat-home-server`
- 关联版本：仓库首个版本，依赖 `@wlisfes/chat-web-base-schema@1.5.0`
- 变更内容：
    - 新建 `chat-web-auth-service`，从账号服务迁出登录、图形验证码、令牌签发与轮换、登录会话和访问令牌内省。
    - 容器端口 `5050`，部署目录 `/opt/chat-web-auth-service`，Compose 项目名 `chat-web-service`，接入 `chat-web-infrastructure` 外部网络。
    - 与账号服务共享 MySQL 数据库 `chat_web_account`，只读取 `tb_account_user`，唯一写入字段为 `last_login_time`。
    - 接管 Redis index `0`；会话键前缀沿用账号服务原值，存量登录会话不失效。
    - 健康检查使用 `/health/live`，就绪检查使用 `/health/ready`。
- 机器侧操作：
    1. 创建部署目录 `/opt/chat-web-auth-service` 并授予 Runner 写权限。
    2. 依据 `deploy/.env.example` 创建 `/opt/chat-web-auth-service/.env`，填写真实 Nacos 命名空间与凭据。
    3. 注册本仓库专用 Self-hosted Runner，标签包含 `self-hosted`、`linux`、`chat-home-server`。
    4. 在 Nacos 创建 Data ID `chat-web-auth-service.yaml`，从 `chat-web-account-service.yaml` 原样复制 `security.jwt.*` 与 `security.session.prefix`，两者的值必须完全一致，否则存量令牌和会话全部失效。
    5. 在各调用方 Nacos 配置中追加 `feign.chat-web-auth.url` 与 `feign.chat-web-auth.timeout`。
- 验证命令：
    ```bash
    docker inspect --format '{{.State.Health.Status}}' chat-web-auth-service
    docker exec chat-web-auth-service node -e "require('http').get('http://127.0.0.1:5050/health/ready', r => process.exit(r.statusCode === 200 ? 0 : 1))"
    curl -s -X POST http://127.0.0.1:5050/internal/auth/token/introspect \
      -H 'x-service-token: <service-token>' -H 'content-type: application/json' \
      -d '{"token":"<access-token>"}'
    ```
- 回滚方法：
    1. 将 Nacos `gateway.auth.accountServiceName` 改回 `chat-web-account-service`，配置热更新即刻生效。
    2. 将各服务 Nacos 的 `feign.chat-web-auth.url` 指回账号服务，或回退共享包依赖版本。
    3. 如需完全下线，执行 `docker compose -f /opt/chat-web-auth-service/compose.yml down`，禁止使用 `--remove-orphans`。
