import {
    TbSkylineSheet,
    TbSkylineOrganizationClosure,
    TbSkylineRole,
    TbSkylineRoleDataScope,
    TbSkylineRoleDataScopeOrganization,
    TbSkylineRoleSheet,
    TbSkylineUser,
    TbSkylineUserOrganization,
    TbSkylineUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-skyline-mysql'

/**
 * Nacos 中鉴权服务 MySQL 配置的根路径。
 *
 * 鉴权服务与 Skyline 服务共享 `chat-web-skyline` 数据库：账号、角色、菜单等表由 Skyline 服务负责建表和写入，
 * 鉴权服务只读取登录和权限计算所需数据，唯一写入的字段是 `tb_skyline_user.last_login_time`。
 */
export const AUTH_MYSQL_CONFIG_KEY = 'database.chat-web-skyline'

/** 鉴权服务需要访问的 TypeORM 实体；只包含登录与权限计算所需的 Skyline 表。 */
export const AUTH_MYSQL_ENTITIES = [
    TbSkylineUser,
    TbSkylineRole,
    TbSkylineUserRole,
    TbSkylineSheet,
    TbSkylineRoleSheet,
    TbSkylineRoleDataScope,
    TbSkylineRoleDataScopeOrganization,
    TbSkylineUserOrganization,
    TbSkylineOrganizationClosure
]
