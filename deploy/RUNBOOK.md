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
