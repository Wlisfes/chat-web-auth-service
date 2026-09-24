import { Injectable } from '@nestjs/common'
import * as FeignSchema from '@wlisfes/chat-web-base-schema/feign'
import { PermissionService } from '@/modules/permission/permission.service'

/** Auth Feign 接口实现；服务间凭据由共享 Feign 基类统一校验。 */
@Injectable()
export class FeignService extends FeignSchema.FeignClientAuthManager implements FeignSchema.FeignClientAuthImplementation {
    constructor(private readonly permissionService: PermissionService) {
        super()
    }

    /** 校验权限码并返回授权身份、角色与数据范围。 */
    public override async httpBaseAuthAuthorizedPrincipalResolver(
        _authorization: string,
        input: FeignSchema.AuthAuthorizedPrincipalInput
    ): Promise<FeignSchema.AuthAuthorizedPrincipalResult> {
        return this.permissionService.resolveAuthorizedPrincipal(input.uid, input.permissionCodes)
    }

    /** 按账号 UID 清理权限缓存。 */
    public override async httpBaseAuthInvalidatePermissionCache(
        _authorization: string,
        input: FeignSchema.AuthPermissionCacheInvalidateInput
    ): Promise<FeignSchema.AuthPermissionCacheInvalidateResult> {
        await this.permissionService.invalidateCache(input)
        return { success: true }
    }
}
