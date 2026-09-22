import { Injectable } from '@nestjs/common'
import type { AuthAuthorizedPrincipalResult, AuthPermissionCacheInvalidateInput } from '@wlisfes/chat-web-base-schema/feign'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import * as Schema from '@wlisfes/chat-web-base-schema'

import { InjectRepository, In, Repository } from '@wlisfes/chat-web-base-schema/database'
import { buildTree } from '@wlisfes/chat-web-base-schema/utils'
const CACHE_SECONDS = 60

/** Auth 服务统一权限判断；权限数据只读自 Account 数据库。 */
@Injectable()
export class PermissionService {
    constructor(
        @InjectRepository(Schema.TbAccountRole) private readonly roleRepository: Repository<Schema.TbAccountRole>,
        @InjectRepository(Schema.TbAccountUserRole) private readonly userRoleRepository: Repository<Schema.TbAccountUserRole>,
        @InjectRepository(Schema.TbAccountMenu) private readonly menuRepository: Repository<Schema.TbAccountMenu>,
        @InjectRepository(Schema.TbAccountRoleMenu) private readonly roleMenuRepository: Repository<Schema.TbAccountRoleMenu>,
        @InjectRepository(Schema.TbAccountRoleDataScope) private readonly dataScopeRepository: Repository<Schema.TbAccountRoleDataScope>,
        @InjectRepository(Schema.TbAccountRoleDataScopeOrganization)
        private readonly dataScopeOrganizationRepository: Repository<Schema.TbAccountRoleDataScopeOrganization>,
        @InjectRepository(Schema.TbAccountUserOrganization)
        private readonly userOrganizationRepository: Repository<Schema.TbAccountUserOrganization>,
        @InjectRepository(Schema.TbAccountOrganizationClosure)
        private readonly organizationClosureRepository: Repository<Schema.TbAccountOrganizationClosure>,
        private readonly redis: RedisService
    ) {}

    /** 返回当前用户启用角色、权限码和菜单树。 */
    public async resolveAccess(
        uid: string
    ): Promise<{ superAdmin: boolean; roleCodes: string[]; permissionCodes: string[]; menuTree: unknown[] }> {
        const links = await this.userRoleRepository.find({ where: { userUid: uid } })
        const roles = links.length
            ? await this.roleRepository.find({
                  where: { keyId: In(links.map(item => item.roleKeyId)), status: Schema.TbAccountRoleStatus.ENABLED }
              })
            : []
        const allMenus = await this.menuRepository.find({
            where: { status: Schema.TbAccountMenuStatus.ENABLED },
            order: { sort: 'ASC', keyId: 'ASC' }
        })
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
            permissionCodes: [
                ...new Set(selected.map(menu => menu.permissionCode).filter((value): value is string => Boolean(value?.trim())))
            ].sort(),
            menuTree: buildTree(allMenus.filter(menu => selectedIds.has(menu.keyId)))
        }
    }

    /** 计算当前请求的授权身份与可访问用户 UID 并集。 */
    public async resolveAuthorizedPrincipal(uid: string, permissionCodes: string[]): Promise<AuthAuthorizedPrincipalResult> {
        const codes = this.normalize(permissionCodes)
        const cacheKey = `auth:authorized:${uid}:${codes.join(',')}`
        const cached = await this.redis.get(cacheKey)
        if (cached) return JSON.parse(cached) as AuthAuthorizedPrincipalResult
        const result = await this.computeAuthorizedPrincipal(uid, codes)
        await this.redis.setEx(cacheKey, CACHE_SECONDS, JSON.stringify(result))
        const indexKey = `auth:authorized:index:${uid}`
        const indexed = await this.redis.get(indexKey)
        const keys = new Set(indexed ? (JSON.parse(indexed) as string[]) : [])
        keys.add(cacheKey)
        await this.redis.setEx(indexKey, CACHE_SECONDS, JSON.stringify([...keys]))
        return result
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
        await Promise.all(
            [...uids].map(async uid => {
                const indexKey = `auth:authorized:index:${uid}`
                const indexed = await this.redis.get(indexKey)
                const keys = indexed ? (JSON.parse(indexed) as string[]) : []
                await Promise.all([
                    this.redis.del(`auth:permission:${uid}`),
                    this.redis.del(indexKey),
                    ...keys.map(key => this.redis.del(key))
                ])
            })
        )
    }

    private normalize(permissionCodes: string[]): string[] {
        const codes = [...new Set(permissionCodes.map(code => code.trim()).filter(Boolean))]
        return codes.includes('*') ? ['*'] : codes.sort()
    }

    private async computeAuthorizedPrincipal(uid: string, codes: string[]): Promise<AuthAuthorizedPrincipalResult> {
        const skipCheck = codes.includes('*') || codes.length === 0
        const links = await this.userRoleRepository.find({ where: { userUid: uid } })
        const roles = links.length
            ? await this.roleRepository.find({
                  where: { keyId: In(links.map(item => item.roleKeyId)), status: Schema.TbAccountRoleStatus.ENABLED }
              })
            : []
        const roleCodes = roles.map(role => role.code).sort()
        const superAdmin = roles.some(role => role.code === 'super_admin')
        if (superAdmin) return { allowed: true, superAdmin: true, roleCodes, all: true, items: [] }

        if (!skipCheck) {
            const cacheKey = `auth:permission:${uid}`
            const cached = await this.redis.get(cacheKey)
            const permissions = cached ? (JSON.parse(cached) as string[]) : await this.loadPermissions(uid, cacheKey)
            if (!codes.some(code => permissions.includes(code))) {
                return { allowed: false, superAdmin: false, roleCodes, all: false, items: [] }
            }
        }

        const self: AuthAuthorizedPrincipalResult = { allowed: true, superAdmin: false, roleCodes, all: false, items: [uid] }
        if (!roles.length) return self

        let relatedRoleIds = roles.map(role => role.keyId)
        if (!skipCheck) {
            const roleMenus = await this.roleMenuRepository.find({ where: { roleKeyId: In(relatedRoleIds) } })
            if (!roleMenus.length) return self
            const menus = await this.menuRepository.find({
                where: { keyId: In(roleMenus.map(item => item.menuKeyId)), status: Schema.TbAccountMenuStatus.ENABLED }
            })
            const allowedCodes = new Set(codes)
            const menuCodes = new Map(menus.map(menu => [menu.keyId, menu.permissionCode?.trim() ?? '']))
            relatedRoleIds = [
                ...new Set(roleMenus.filter(item => allowedCodes.has(menuCodes.get(item.menuKeyId) ?? '')).map(item => item.roleKeyId))
            ]
            if (!relatedRoleIds.length) return self
        }

        const scopes = await this.dataScopeRepository.find({
            where: { roleKeyId: In(relatedRoleIds), status: Schema.TbAccountRoleDataScopeStatus.ENABLED }
        })
        if (!scopes.length) return self
        if (scopes.some(scope => scope.scopeType === Schema.TbAccountRoleDataScopeType.ALL)) {
            return { allowed: true, superAdmin: false, roleCodes, all: true, items: [] }
        }
        const items = new Set<string>()
        if (scopes.some(scope => scope.scopeType === Schema.TbAccountRoleDataScopeType.SELF)) items.add(uid)
        const organizationKeyIds = new Set<number>()
        const needPrimary = scopes.some(
            scope =>
                scope.scopeType === Schema.TbAccountRoleDataScopeType.ORGANIZATION ||
                scope.scopeType === Schema.TbAccountRoleDataScopeType.ORGANIZATION_TREE
        )
        const primaryIds = needPrimary
            ? (
                  await this.userOrganizationRepository.find({
                      where: { userUid: uid, isPrimary: true, status: Schema.TbAccountUserOrganizationStatus.ENABLED }
                  })
              ).map(item => item.organizationKeyId)
            : []
        if (scopes.some(scope => scope.scopeType === Schema.TbAccountRoleDataScopeType.ORGANIZATION)) {
            primaryIds.forEach(id => organizationKeyIds.add(id))
        }
        if (primaryIds.length && scopes.some(scope => scope.scopeType === Schema.TbAccountRoleDataScopeType.ORGANIZATION_TREE)) {
            const rows = await this.organizationClosureRepository.find({ where: { ancestorKeyId: In(primaryIds) } })
            rows.forEach(row => organizationKeyIds.add(row.descendantKeyId))
        }
        const custom = scopes.filter(scope => scope.scopeType === Schema.TbAccountRoleDataScopeType.CUSTOM)
        if (custom.length) {
            const grants = await this.dataScopeOrganizationRepository.find({
                where: { dataScopeKeyId: In(custom.map(scope => scope.keyId)) }
            })
            grants.filter(item => !item.includeChildren).forEach(item => organizationKeyIds.add(item.organizationKeyId))
            const childIds = grants.filter(item => item.includeChildren).map(item => item.organizationKeyId)
            if (childIds.length) {
                const rows = await this.organizationClosureRepository.find({ where: { ancestorKeyId: In(childIds) } })
                rows.forEach(row => organizationKeyIds.add(row.descendantKeyId))
            }
        }
        if (organizationKeyIds.size) {
            const members = await this.userOrganizationRepository.find({
                where: {
                    organizationKeyId: In([...organizationKeyIds]),
                    status: Schema.TbAccountUserOrganizationStatus.ENABLED
                }
            })
            members.forEach(item => items.add(item.userUid))
        }
        return { allowed: true, superAdmin: false, roleCodes, all: false, items: [...items].sort() }
    }

    private async loadPermissions(uid: string, cacheKey: string): Promise<string[]> {
        const userRoles = await this.userRoleRepository.find({ where: { userUid: uid } })
        if (userRoles.length === 0) {
            await this.redis.setEx(cacheKey, CACHE_SECONDS, JSON.stringify([]))
            return []
        }
        const roles = await this.roleRepository.find({
            where: { keyId: In(userRoles.map(item => item.roleKeyId)), status: Schema.TbAccountRoleStatus.ENABLED }
        })
        if (roles.some(role => role.code === 'super_admin')) {
            const all = await this.menuRepository.find({ where: { status: Schema.TbAccountMenuStatus.ENABLED } })
            const permissions = all.map(item => item.permissionCode).filter((value): value is string => Boolean(value?.trim()))
            await this.redis.setEx(cacheKey, CACHE_SECONDS, JSON.stringify(permissions))
            return permissions
        }
        const roleMenus = await this.roleMenuRepository.find({ where: { roleKeyId: In(roles.map(item => item.keyId)) } })
        if (roleMenus.length === 0) return []
        const menus = await this.menuRepository.find({
            where: { keyId: In(roleMenus.map(item => item.menuKeyId)), status: Schema.TbAccountMenuStatus.ENABLED }
        })
        const permissions = menus.map(item => item.permissionCode).filter((value): value is string => Boolean(value?.trim()))
        await this.redis.setEx(cacheKey, CACHE_SECONDS, JSON.stringify(permissions))
        return permissions
    }
}
