import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    TbAccountMenu,
    TbAccountRole,
    TbAccountRoleMenu,
    TbAccountUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { PermissionService } from '@/modules/permission/permission.service'

/** Auth 权限模块；只读 Account 数据库中的角色、菜单及关联关系。 */
@Global()
@Module({
    imports: [TypeOrmModule.forFeature([TbAccountRole, TbAccountUserRole, TbAccountMenu, TbAccountRoleMenu])],
    providers: [PermissionService],
    exports: [PermissionService]
})
export class PermissionModule {}
