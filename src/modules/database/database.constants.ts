import { TbAccountUser } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'

/**
 * Nacos 中鉴权服务 MySQL 配置的根路径。
 *
 * 鉴权服务与账号服务共享 `chat_web_account` 数据库：账号表由账号服务负责建表和写入，
 * 鉴权服务只按登录标识和 UID 读取账号，唯一写入的字段是最近登录时间。
 */
export const AUTH_MYSQL_CONFIG_KEY = 'database.chat-web-account'

/** 鉴权服务需要访问的 TypeORM 实体；只包含账号表，不注册其他业务实体。 */
export const AUTH_MYSQL_ENTITIES = [TbAccountUser]
