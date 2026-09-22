import { Injectable } from '@nestjs/common'
import {
    AuthAuthorizedPrincipalResult,
    AuthPermissionCacheInvalidateInput,
    AuthPermissionCacheInvalidateResult,
    AuthAuthorizedPrincipalInput,
    FeignClientAuthImplementation,
    FeignClientAuthManager
} from '@wlisfes/chat-web-base-schema/feign'
import { PermissionService } from '@/modules/permission/permission.service'

/** Auth Feign 接口实现；服务间凭据由共享 Feign 基类统一校验。 */
@Injectable()
export class FeignService extends FeignClientAuthManager implements FeignClientAuthImplementation {
    constructor(private readonly permissionService: PermissionService) {
        super()
    }

    public override async resolveAuthorizedPrincipal(
        _authorization: string,
        input: AuthAuthorizedPrincipalInput
    ): Promise<AuthAuthorizedPrincipalResult> {
        return this.permissionService.resolveAuthorizedPrincipal(input.uid, input.permissionCodes)
    }

    public override async invalidatePermissionCache(
        _authorization: string,
        input: AuthPermissionCacheInvalidateInput
    ): Promise<AuthPermissionCacheInvalidateResult> {
        await this.permissionService.invalidateCache(input)
        return { success: true }
    }
}
