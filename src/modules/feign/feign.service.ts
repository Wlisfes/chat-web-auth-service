import { Injectable } from '@nestjs/common'
import {
    AuthPermissionCacheInvalidateInput,
    AuthPermissionCacheInvalidateResult,
    AuthPermissionCheckInput,
    AuthPermissionCheckResult,
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

    public override async checkPermission(
        _authorization: string,
        input: AuthPermissionCheckInput
    ): Promise<AuthPermissionCheckResult> {
        return { allowed: await this.permissionService.checkPermission(input) }
    }

    public override async invalidatePermissionCache(
        _authorization: string,
        input: AuthPermissionCacheInvalidateInput
    ): Promise<AuthPermissionCacheInvalidateResult> {
        await this.permissionService.invalidateCache(input)
        return { success: true }
    }
}
