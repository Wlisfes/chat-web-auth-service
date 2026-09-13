import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { AuthPermissionCacheInvalidateInput, AuthPermissionCheckInput } from '@wlisfes/chat-web-base-schema/feign'
import {
    TbAccountMenu,
    TbAccountMenuStatus,
    TbAccountRole,
    TbAccountRoleStatus,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleDataScopeStatus,
    TbAccountRoleDataScopeType,
    TbAccountRoleMenu,
    TbAccountUserRole,
    TbAccountUserOrganization,
    TbAccountUserOrganizationStatus,
    TbAccountOrganizationClosure
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import { In, Repository } from 'typeorm'
import { buildTree } from '@wlisfes/chat-web-base-schema/utils'

const CACHE_SECONDS = 60

/** Auth 服务统一权限判断；权限数据只读自 Account 数据库。 */
@Injectable()
export class PermissionService {
    constructor(
        @InjectRepository(TbAccountRole) private readonly roleRepository: Repository<TbAccountRole>,
        @InjectRepository(TbAccountUserRole) private readonly userRoleRepository: Repository<TbAccountUserRole>,
        @InjectRepository(TbAccountMenu) private readonly menuRepository: Repository<TbAccountMenu>,
        @InjectRepository(TbAccountRoleMenu) private readonly roleMenuRepository: Repository<TbAccountRoleMenu>,
        @InjectRepository(TbAccountRoleDataScope) private readonly dataScopeRepository: Repository<TbAccountRoleDataScope>,
        @InjectRepository(TbAccountRoleDataScopeOrganization) private readonly dataScopeOrganizationRepository: Repository<TbAccountRoleDataScopeOrganization>,
        @InjectRepository(TbAccountUserOrganization) private readonly userOrganizationRepository: Repository<TbAccountUserOrganization>,
        @InjectRepository(TbAccountOrganizationClosure) private readonly organizationClosureRepository: Repository<TbAccountOrganizationClosure>,
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

    /** 返回当前用户启用角色、权限码和菜单树。 */
    public async resolveAccess(uid: string): Promise<{ superAdmin: boolean; roleCodes: string[]; permissionCodes: string[]; menuTree: unknown[] }> {
        const links = await this.userRoleRepository.find({ where: { userUid: uid } })
        const roles = links.length
            ? await this.roleRepository.find({ where: { keyId: In(links.map(item => item.roleKeyId)), status: TbAccountRoleStatus.ENABLED } })
            : []
        const allMenus = await this.menuRepository.find({ where: { status: TbAccountMenuStatus.ENABLED }, order: { sort: 'ASC', keyId: 'ASC' } })
        const superAdmin = roles.some(role => role.code === 'super_admin')
        const menuIds = superAdmin
            ? allMenus.map(menu => menu.keyId)
            : (await this.roleMenuRepository.find({ where: { roleKeyId: In(roles.map(role => role.keyId)) } })).map(item => item.menuKeyId)
        const selected = allMenus.filter(menu => menuIds.includes(menu.keyId))
        const selectedIds = new Set(selected.map(menu => menu.keyId))
        selected.forEach(menu => {
            let parent = menu.parentKeyId
            while (parent) {
                selectedIds.add(parent)
                parent = allMenus.find(item => item.keyId === parent)?.parentKeyId
            }
        })
        return {
            superAdmin,
            roleCodes: roles.map(role => role.code).sort(),
            permissionCodes: [...new Set(selected.map(menu => menu.permissionCode).filter((value): value is string => Boolean(value?.trim())))].sort(),
            menuTree: buildTree(allMenus.filter(menu => selectedIds.has(menu.keyId)))
        }
    }

    /** 判断用户是否为启用的超级管理员。 */
    public async isSuperAdmin(uid: string): Promise<boolean> {
        const links = await this.userRoleRepository.find({ where: { userUid: uid } })
        if (!links.length) return false
        const roles = await this.roleRepository.find({ where: { keyId: In(links.map(item => item.roleKeyId)), status: TbAccountRoleStatus.ENABLED } })
        return roles.some(role => role.code === 'super_admin')
    }

    /** 计算用户对业务资源的数据范围。 */
    public async resolveDataScope(uid: string, resourceCode: string): Promise<{ all: boolean; includeSelf: boolean; organizationKeyIds: number[] }> {
        if (await this.isSuperAdmin(uid)) return { all: true, includeSelf: true, organizationKeyIds: [] }
        const links = await this.userRoleRepository.find({ where: { userUid: uid } })
        const roles = await this.roleRepository.find({ where: { keyId: In(links.map(item => item.roleKeyId)), status: TbAccountRoleStatus.ENABLED } })
        if (!roles.length) return { all: false, includeSelf: false, organizationKeyIds: [] }
        const scopes = await this.dataScopeRepository.find({ where: { roleKeyId: In(roles.map(item => item.keyId)), resourceCode: In([resourceCode.trim(), '*']), status: TbAccountRoleDataScopeStatus.ENABLED } })
        const selected = roles.flatMap(role => {
            const own = scopes.filter(scope => scope.roleKeyId === role.keyId)
            const exact = own.find(scope => scope.resourceCode === resourceCode.trim())
            return exact ? [exact] : own.filter(scope => scope.resourceCode === '*')
        })
        if (selected.some(scope => scope.scopeType === TbAccountRoleDataScopeType.ALL)) return { all: true, includeSelf: true, organizationKeyIds: [] }
        const includeSelf = selected.some(scope => scope.scopeType === TbAccountRoleDataScopeType.SELF)
        const organizationKeyIds = new Set<number>()
        const primary = await this.userOrganizationRepository.find({ where: { userUid: uid, isPrimary: true, status: TbAccountUserOrganizationStatus.ENABLED } })
        const primaryIds = primary.map(item => item.organizationKeyId)
        if (selected.some(scope => scope.scopeType === TbAccountRoleDataScopeType.ORGANIZATION)) primaryIds.forEach(id => organizationKeyIds.add(id))
        if (selected.some(scope => scope.scopeType === TbAccountRoleDataScopeType.ORGANIZATION_TREE)) {
            const rows = await this.organizationClosureRepository.find({ where: { ancestorKeyId: In(primaryIds) } })
            rows.forEach(row => organizationKeyIds.add(row.descendantKeyId))
        }
        const custom = selected.filter(scope => scope.scopeType === TbAccountRoleDataScopeType.CUSTOM)
        if (custom.length) {
            const grants = await this.dataScopeOrganizationRepository.find({ where: { dataScopeKeyId: In(custom.map(scope => scope.keyId)) } })
            grants.filter(item => !item.includeChildren).forEach(item => organizationKeyIds.add(item.organizationKeyId))
            const rows = await this.organizationClosureRepository.find({ where: { ancestorKeyId: In(grants.filter(item => item.includeChildren).map(item => item.organizationKeyId)) } })
            rows.forEach(row => organizationKeyIds.add(row.descendantKeyId))
        }
        return { all: false, includeSelf, organizationKeyIds: [...organizationKeyIds].sort((a, b) => a - b) }
    }

    /** 清理受影响用户的权限缓存；角色变更时按关联用户批量清理。 */
    public async invalidateCache(input: AuthPermissionCacheInvalidateInput): Promise<void> {
        const uids = new Set(input.uids ?? [])
        if (!input.uids?.length && !input.roleKeyIds?.length) {
            const relations = await this.userRoleRepository.find({ select: { userUid: true } })
            relations.forEach(item => uids.add(item.userUid))
        }
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
