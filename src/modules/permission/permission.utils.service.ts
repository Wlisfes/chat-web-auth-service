import { Injectable } from '@nestjs/common'
import * as Schema from '@wlisfes/chat-web-base-schema'

import { InjectRepository, DataBaseService, In, Repository } from '@wlisfes/chat-web-base-schema/database'
@Injectable()
export class PermissionUtilsService {
    constructor(
        @InjectRepository(Schema.TbAccountRole) private readonly roleRepository: Repository<Schema.TbAccountRole>,
        @InjectRepository(Schema.TbAccountOrganizationClosure)
        private readonly organizationClosureRepository: Repository<Schema.TbAccountOrganizationClosure>,
        private readonly database: DataBaseService
    ) {}

    /**获取账号当前启用的角色*/
    public async getEnabledRoles(userUid: string): Promise<Schema.TbAccountRole[]> {
        const relations = await this.roleRepository.manager.find(Schema.TbAccountUserRole, { where: { userUid } })
        if (relations.length === 0) {
            return []
        }
        return this.database.builder(this.roleRepository, qb =>
            qb
                .where('t.keyId IN (:...roleKeyIds)', { roleKeyIds: relations.map(relation => relation.roleKeyId) })
                .andWhere('t.status = :status', { status: Schema.TbAccountRoleStatus.ENABLED })
                .orderBy('t.sort', 'ASC')
                .addOrderBy('t.keyId', 'ASC')
                .getMany()
        )
    }

    /**补齐授权菜单的全部祖先节点*/
    public includeMenuAncestors(grantedMenus: Schema.TbAccountMenu[], allMenus: Schema.TbAccountMenu[]): Set<number> {
        const byKeyId = new Map(allMenus.map(menu => [menu.keyId, menu]))
        const result = new Set<number>()
        for (const menu of grantedMenus) {
            let current = menu
            while (!result.has(current.keyId)) {
                result.add(current.keyId)
                if (!current.parentKeyId) break
                const parent = byKeyId.get(current.parentKeyId)
                if (!parent) break
                current = parent
            }
        }
        return result
    }

    /**展开组织树根节点的全部下级组织*/
    public async expandOrganizationTrees(rootKeyIds: number[]): Promise<number[]> {
        if (rootKeyIds.length === 0) {
            return []
        }
        const rows = await this.database.builder(this.organizationClosureRepository, qb =>
            qb.where('t.ancestorKeyId IN (:...rootKeyIds)', { rootKeyIds: [...new Set(rootKeyIds)] }).getMany()
        )
        return [...new Set(rows.map(row => row.descendantKeyId))]
    }
}
