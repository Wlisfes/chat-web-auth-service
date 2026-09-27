import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    TbAccountSheet,
    TbAccountRole,
    TbAccountRoleSheet,
    TbAccountUserRole,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountUserOrganization,
    TbAccountOrganizationClosure
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { PermissionService } from '@/modules/permission/permission.service'

/** Auth 权限模块；只读 Account 数据库中的角色、菜单及关联关系。 */
@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([
            TbAccountRole,
            TbAccountUserRole,
            TbAccountSheet,
            TbAccountRoleSheet,
            TbAccountRoleDataScope,
            TbAccountRoleDataScopeOrganization,
            TbAccountUserOrganization,
            TbAccountOrganizationClosure
        ])
    ],
    providers: [PermissionService],
    exports: [PermissionService]
})
export class PermissionModule {}
