# 运行基线与排障手册

## 当前运行基线

| 项 | 值 |
| --- | --- |
| 部署主机 | `chat-home-server` |
| 部署目录 | `/opt/chat-web-auth-service` |
| 容器名称 | `chat-web-auth-service` |
| Compose 项目 | `chat-web-service` |
| 容器端口 | `5050` |
| Docker 网络 | `chat-web-infrastructure`（外部） |
| Nacos Data ID | `chat-web-auth-service.yaml`（`DEFAULT_GROUP`） |
| MySQL | `chat_web_account`，与账号服务共享，只读 `tb_account_user` |
| Redis | index `0`，存放登录会话与图形验证码 |
| 健康检查 | `/health/live`（容器探针）、`/health/ready`（依赖就绪） |
| 网关前缀 | `/api/auth` |

## Nacos 配置清单

Data ID `chat-web-auth-service.yaml`（`DEFAULT_GROUP`）：

```yaml
server:
    port: 5050

# 共享账号数据库；只读取 tb_account_user，唯一写入字段是 last_login_time。
database:
    chat-web-account:
        host: chat-web-mysql
        port: 3306
        name: chat_web_account
        username: '<账号库用户名>'
        password: '<账号库密码>'
        charset: utf8mb4
        timezone: '+08:00'

# 登录会话与图形验证码；index 0 由本服务独占。
redis:
    host: chat-web-redis
    port: 6379
    database: 0
    tls: false
    connectTimeoutMs: 5000

# 令牌签发参数；必须与迁移前 chat-web-account-service.yaml 的值完全一致，
# 否则所有存量访问令牌和登录会话立即失效。
security:
    jwt:
        secret: '<至少32位随机串>'
        issuer: chat-web-account-service
        audience: chat-web
        accessTokenTtlSeconds: 36000
    session:
        prefix: '<与迁移前一致>'

# 内部内省接口的调用方凭据；与网关和各业务服务保持同一个值。
feign:
    service_token: '<服务间共享凭据>'

# 本服务自身的公开接口也经网关进入，因此同样需要身份上下文验签密钥。
gateway:
    principal:
        secret: '<与网关一致的至少32位随机串>'
        maxAgeSeconds: 60
```

> `security.jwt.*` 与 `security.session.prefix` 必须在删除账号服务同名配置**之前**原样复制过来。

## 常用排障命令

```bash
# 容器状态与健康
docker ps --filter name=chat-web-auth-service
docker inspect --format '{{.State.Health.Status}}' chat-web-auth-service

# 实时日志与最近错误
docker logs -f --tail 200 chat-web-auth-service
docker logs --since 30m chat-web-auth-service 2>&1 | grep -i error

# 就绪检查（含数据库、Redis 与 JWT 配置状态）
docker exec chat-web-auth-service node -e "require('http').get('http://127.0.0.1:5050/health/ready', r => { r.pipe(process.stdout) })"

# 内部内省协议连通性
curl -s -X POST http://127.0.0.1:5050/internal/auth/token/introspect \
  -H 'x-service-token: <service-token>' -H 'content-type: application/json' \
  -d '{"token":"<access-token>"}'

# 日志轮转配置核对（单文件 20m，保留 30 个）
docker inspect --format '{{json .HostConfig.LogConfig}}' chat-web-auth-service
```

## 常见故障

**启动即退出，报 `security.jwt.secret 必须至少32位`**
Nacos `chat-web-auth-service.yaml` 缺少或错配 JWT 配置。确认 `security.jwt.secret`、`issuer`、`audience`、`accessTokenTtlSeconds` 与账号服务历史值完全一致。

**启动即退出，报 `feign.service_token 未配置`**
内部认证是网关入口认证的必要依赖，缺失时刻意阻止启动。在 Nacos 补齐 `feign.service_token`。

**登录成功但访问其他服务返回 401**
检查各业务服务 Nacos 的 `feign.chat-web-auth.url` 是否指向本服务，`feign.service_token` 是否与本服务一致。

**所有用户被迫重新登录**
通常是 `security.session.prefix` 或 `security.jwt.secret` 与迁移前不一致。恢复原值即可，会话数据本身没有丢失。

**验证码始终提示过期**
确认本服务与账号服务的 Redis index 一致（`0`），且 `chat-web:account:captcha` 键前缀未被修改。

## 回滚

```bash
cd /opt/chat-web-auth-service
# deploy.sh 在健康检查失败时自动回滚到上一镜像；手动回滚指定镜像：
IMAGE=ghcr.io/wlisfes/chat-web-auth-service:<sha> docker compose -f compose.yml up -d --no-deps auth-service
```

网关侧回滚只需把 Nacos `gateway.auth.accountServiceName` 改回 `chat-web-account-service`，无需重新部署。禁止在任何 compose 命令中使用 `--remove-orphans`。
