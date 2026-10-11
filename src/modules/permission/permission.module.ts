import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    TbSkylineSheet,
    TbSkylineRole,
    TbSkylineRoleSheet,
    TbSkylineUserRole,
    TbSkylineRoleDataScope,
    TbSkylineRoleDataScopeOrganization,
    TbSkylineUserOrganization,
    TbSkylineOrganizationClosure
} from '@wlisfes/chat-web-base-schema/chat-web-skyline-mysql'
import { PermissionService } from '@/modules/permission/permission.service'

/** Auth 权限模块；只读 Skyline 数据库中的角色、菜单及关联关系。 */
@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([
            TbSkylineRole,
            TbSkylineUserRole,
            TbSkylineSheet,
            TbSkylineRoleSheet,
            TbSkylineRoleDataScope,
            TbSkylineRoleDataScopeOrganization,
            TbSkylineUserOrganization,
            TbSkylineOrganizationClosure
        ])
    ],
    providers: [PermissionService],
    exports: [PermissionService]
})
export class PermissionModule {}
