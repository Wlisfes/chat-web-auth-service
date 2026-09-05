# Repository instructions

本文件在本仓库内独立生效，不依赖 `F:/chat-web-service/AGENTS.md` 或其他工作区文件。

## 通用工程规则

- 使用 Node.js 22、Yarn 1.22.22、NestJS 11 和 TypeScript；源码使用 UTF-8，Shell、YAML 和 Dockerfile 使用 LF。
- 统一使用 4 空格、无分号、单引号、`printWidth: 140`、无尾随逗号；内部源码统一使用 `@/*` 路径别名。
- 文件名使用小写 kebab-case 和职责后缀；类、接口、枚举使用 PascalCase，变量、函数和实例属性使用 camelCase，常量和注入 Token 使用 UPPER_SNAKE_CASE。
- 日志、校验消息、Swagger 描述和面向维护者的错误信息使用中文，代码标识符使用英文。
- 业务源码和配置文件必须编写清晰、必要的中文注释；配置文件包括 Nacos YAML、Compose、Dockerfile、Actions 和 `.env.example`。新增配置项必须同步说明用途，修改或格式化时必须保留既有注释，不得删除、覆盖或改写；注释中不得出现真实密码、Token、私钥等敏感信息。
- HTTP Controller 只允许 GET、POST；GET 使用 query，POST 使用 body；多选参数必须是数组，禁止使用 `/:uid` 等路径参数。
- 如新增分页接口，统一使用 `page`（从 1 开始）和 `size`（默认 50、最大 100）作为入参，响应统一返回 `page`、`size`、`total`、`list`；禁止使用 `pageSize`、`items`、`records` 或 `rows` 作为同义字段。
- 请求日志必须包含 logId、方法、URL、状态码、来源、入参和耗时，并脱敏密码、Token 等敏感字段。
- TypeORM 必须保持 `synchronize: false` 和 `migrationsRun: false`；数据库和表结构由账号服务和外部 Schema SQL 管理，本服务不得建表或改表。
- Nacos 配置、服务发现、公开路由和跨域白名单统一维护在 Nacos，不在业务代码中硬编码生产配置。
- `.env.example` 只列出启动所需参数和明确占位符；真实密钥、Token、私钥和生产 `.env` 不得提交。
- 涉及容器部署时必须遵守本文件部署章节中的主机、Runner、网络、健康检查和回滚约束，禁止使用 `--remove-orphans`。
- 每次改动至少执行格式检查、TypeScript 类型检查、Nest 构建和完整测试；涉及数据库、认证协议、服务发现或部署时增加运行级验证。

## 单机部署规则

- 本服务只部署到当前主机 `chat-home-server`，不得创建多机部署矩阵。
- GitHub Actions 使用 `chat-home-server` Runner 标签和 `production-home` Environment，只构建一次完整 Git SHA 镜像并部署到 `/opt/chat-web-auth-service`。
- 本仓库使用独立 Self-hosted Runner；Compose 项目名为 `chat-web-service`，并接入 `chat-web-infrastructure` 外部网络。
- 部署必须包含健康检查、部署后验证和失败自动回滚，不得使用 `--remove-orphans`。

## 服务数据边界

- 本服务是 JWT 密钥、令牌签发和登录会话的唯一所有者。其他服务不得持有 `security.jwt.*`、不得读取登录会话存储，只能通过内部认证协议校验令牌。
- 本服务与账号服务**共享** MySQL 数据库 `chat_web_account`，这是经过评估的特例，不适用于其他任何服务组合。共享边界必须严格遵守：
    - 本服务只注册 `TbAccountUser` 一个实体，只按登录标识和 UID 读取账号。
    - 本服务对共享库的唯一写入是 `tb_account_user.last_login_time`；其余字段、其余全部表只由账号服务写入。
    - 本服务不得建表、改表、执行迁移，也不得注册账号服务的组织、角色、菜单、权限、客户等实体。
    - `chat-web-base-schema` 中 `tb_account_user` 的任何结构变更必须同时评估账号服务和本服务，两个仓库的共享包依赖需要成对升级。
- 本服务独占 Redis index `0`，只存放登录会话和图形验证码，不得写入其他 index，账号服务迁移后不再使用该索引。
- 授权（权限码校验）不属于本服务职责，`RequirePermissions` 相关逻辑留在账号服务。
- 网关入口认证使用 `/internal/auth/token/introspect` 独立协议：用户令牌通过请求体传递，调用方身份通过 `X-Service-Token` 校验，服务凭据读取 Nacos `feign.service_token`。该路由不得加入 `gateway.routes`，也不得通过公开网关前缀暴露。
- 本服务不需要配置 `feign.gateway.url`，也不作为业务 Feign 调用方；Gateway 通过 Nacos 服务发现直接访问本服务的内部内省地址。
- 本服务需要其他业务数据时必须使用共享包的强类型 HTTP 客户端，不得连接其他服务数据库或执行跨业务库 SQL。

## HTTP 模块实现基准

- `chat-web-account-service/src/modules/sheet/` 是本工作区 HTTP 业务模块的结构基准；本仓库按认证域适配，不得另建接口风格。
- Controller 必须保持为薄协议层：除装饰器、`query`/`body` DTO、当前身份参数和调用同名 Service 方法外，不得进行 DTO 拆包、字段转换、默认值注入、数据库访问、业务校验或响应结构拼装。
- Cookie 读写、Header 解析、流或文件响应、SVG 输出等依赖 Express 的纯 HTTP 协议适配允许保留在 Controller。禁止把 `Request`、`Response`、Cookie、Header 或响应发送逻辑传入业务 Service；协议例外必须写中文职责注释。
- 公开 HTTP 方法统一声明为 `public async`，命名使用 `httpBaseAuth<Action><Resource>`；Controller 与对应 Service 的方法名称必须完全相同并直接返回调用结果。
- 每个接口入参必须使用模块 `dto/` 下独立 DTO，或复用共享包导出的协议 DTO；确实无入参的接口直接省略 request 配置，禁止为文档形式制造空 DTO。
- 业务 Service 引用本模块请求 DTO 时统一使用 `import * as <Module>Dto` 命名空间归组；响应 DTO 按需使用命名导入。
- 每个接口必须通过 `ApiServiceDecorator` 完整声明请求的 `source`、`type` 和响应的 `type`、`isArray`（数组响应时）及中文说明。
- 对应 Service 的公开 HTTP 方法必须添加简洁中文职责注释、声明明确的 `Promise<返回类型>` 并负责完整业务响应。
- DTO 字段必须提供 Swagger 示例/说明、必要的类型转换和中文校验消息；优先使用 `PickType`、`PartialType`、`IntersectionType` 复用共享 DTO。
- Entity 查询优先使用公共 `DataBaseService.builder`，QueryBuilder 别名固定为 `t`。
- 可复用的实体查找、状态校验和转换必须抽到 `<module>.utils.service.ts`，使用 `@Injectable()` 并在对应 Module 的 `providers` 中注册；仅调用一次且无复用价值的简单步骤不得机械拆分。
- 普通可选入参使用 `isEmpty`/`isNotEmpty` 判断，禁止使用 `value === undefined`、`value === null` 或隐式 truthy 判空。实体或 Map 查询结果可使用 `if (!entity)` 获得类型收窄；数组使用明确的 `length === 0`/`length > 0`。
- 重构不得改变现有路由、HTTP 方法、认证方式、响应字段和异常消息；协议变更必须同步管理端、回归测试和部署变更记录，并提供回滚方法。

## 部署变更记录

任何会影响 Docker 构建、服务启动、运行参数、Nacos、端口、健康检查、Runner、部署目录或外部网络的修改，都必须在同一次改动中更新 `deploy/CHANGELOG.md`。

变更记录至少包含：日期、影响机器、关联版本、变更内容、机器侧操作、验证命令和回滚方法。禁止在文档中记录密码、Token、私钥或完整 `.env`。

修改以下文件时默认属于部署变更：

- `Dockerfile`、`.dockerignore`
- `.github/workflows/**`
- `deploy/**`
- `.env.example`
- Nacos 配置结构、Data ID、Group、Namespace、服务名
- 服务端口、数据库地址、Redis index、Docker 网络和健康检查

排障命令和当前运行基线维护在 `deploy/RUNBOOK.md`。

## 分支生命周期

- 远程仓库只保留 `main`、`developer` 两个长期分支；临时需求分支必须先合并到 `developer`，发布时同步合并到 `main`，合并并验证通过后立即删除远程和本地临时分支。

## Git 提交规范

- 所有提交信息必须使用 Conventional Commits 类型前缀，格式固定为 `<type>: 中文摘要`；如需填写作用域，使用 `<type>(<scope>): 中文摘要`。
- `type` 只能使用以下类型：`init`（项目初始化）、`feat`（添加新特性）、`fix`（修复缺陷）、`docs`（仅修改文档）、`style`（仅调整格式或样式）、`refactor`（代码重构）、`perf`（性能优化）、`test`（增加或调整测试）、`build`（构建或依赖变更）、`ci`（持续集成或部署配置）、`chore`（工程工具或其他维护性变更）。
- 提交摘要、正文和脚注必须使用中文；类型前缀保留上述英文小写关键字，代码标识符、命令和版本号可按实际需要保留原文。
- 每个提交应聚焦单一目的，摘要使用动词开头并准确说明影响范围，禁止使用 `update`、`modify` 等无意义描述或整句英文提交信息。

## 共享 Schema 依赖联动

- 当任务包含 `chat-web-base-schema` 公共能力变更时，Agent 必须自行等待共享包发布，随后将本服务升级到明确的新版本，不得要求用户手动更新依赖。
- 升级后应优先使用共享包导出的实现并删除本地重复代码，运行仓库要求的完整测试，并按部署规则同步变更记录。
- `tb_account_user` 相关变更必须与 `chat-web-account-service` 成对升级并同时验证。
