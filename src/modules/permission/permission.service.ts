import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { AuthPermissionCacheInvalidateInput, AuthPermissionCheckInput } from '@wlisfes/chat-web-base-schema/feign'
import {
    TbAccountMenu,
    TbAccountMenuStatus,
    TbAccountRole,
    TbAccountRoleStatus,
    TbAccountRoleMenu,
    TbAccountUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import { In, Repository } from 'typeorm'

const CACHE_SECONDS = 60

/** Auth 服务统一权限判断；权限数据只读自 Account 数据库。 */
@Injectable()
export class PermissionService {
    constructor(
        @InjectRepository(TbAccountRole) private readonly roleRepository: Repository<TbAccountRole>,
        @InjectRepository(TbAccountUserRole) private readonly userRoleRepository: Repository<TbAccountUserRole>,
        @InjectRepository(TbAccountMenu) private readonly menuRepository: Repository<TbAccountMenu>,
        @InjectRepository(TbAccountRoleMenu) private readonly roleMenuRepository: Repository<TbAccountRoleMenu>,
        private readonly redis: RedisService
    ) {}

    /** 校验用户是否同时拥有指定权限码；结果缓存 60 秒并支持主动失效。 */
    public async checkPermission(input: AuthPermissionCheckInput): Promise<boolean> {
        const codes = [...new Set(input.permissionCodes.map(code => code.trim()).filter(Boolean))]
        if (codes.length === 0) return true
        const cacheKey = `auth:permission:${input.uid}`
        const cached = await this.redis.get(cacheKey)
        const permissions = cached ? (JSON.parse(cached) as string[]) : await this.loadPermissions(input.uid, cacheKey)
        return codes.every(code => permissions.includes(code))
    }

    /** 清理受影响用户的权限缓存；角色变更时按关联用户批量清理。 */
    public async invalidateCache(input: AuthPermissionCacheInvalidateInput): Promise<void> {
        const uids = new Set(input.uids ?? [])
        if (input.roleKeyIds?.length) {
            const relations = await this.userRoleRepository.find({ where: { roleKeyId: In(input.roleKeyIds) } })
            relations.forEach(item => uids.add(item.userUid))
        }
        await Promise.all([...uids].map(uid => this.redis.del(`auth:permission:${uid}`)))
    }

    private async loadPermissions(uid: string, cacheKey: string): Promise<string[]> {
        const userRoles = await this.userRoleRepository.find({ where: { userUid: uid } })
        if (userRoles.length === 0) {
            await this.redis.setEx(cacheKey, CACHE_SECONDS, JSON.stringify([]))
            return []
        }
        const roles = await this.roleRepository.find({
            where: { keyId: In(userRoles.map(item => item.roleKeyId)), status: TbAccountRoleStatus.ENABLED }
        })
        if (roles.some(role => role.code === 'super_admin')) {
            const all = await this.menuRepository.find({ where: { status: TbAccountMenuStatus.ENABLED } })
            const permissions = all.map(item => item.permissionCode).filter((value): value is string => Boolean(value?.trim()))
            await this.redis.setEx(cacheKey, CACHE_SECONDS, JSON.stringify(permissions))
            return permissions
        }
        const roleMenus = await this.roleMenuRepository.find({ where: { roleKeyId: In(roles.map(item => item.keyId)) } })
        if (roleMenus.length === 0) return []
        const menus = await this.menuRepository.find({
            where: { keyId: In(roleMenus.map(item => item.menuKeyId)), status: TbAccountMenuStatus.ENABLED }
        })
        const permissions = menus.map(item => item.permissionCode).filter((value): value is string => Boolean(value?.trim()))
        await this.redis.setEx(cacheKey, CACHE_SECONDS, JSON.stringify(permissions))
        return permissions
    }
}
