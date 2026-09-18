import { Injectable } from '@nestjs/common'
import {
    AuthAuthorizedPrincipalResult,
    AuthPermissionCacheInvalidateInput,
    AuthPermissionCacheInvalidateResult,
    AuthPermissionCheckInput,
    AuthPermissionCheckResult,
    AuthDataScopeInput,
    AuthDataScopeResult,
    AuthSuperAdminResult,
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

    public override async checkPermission(_authorization: string, input: AuthPermissionCheckInput): Promise<AuthPermissionCheckResult> {
        return { allowed: await this.permissionService.checkPermission(input) }
    }

    public override async invalidatePermissionCache(
        _authorization: string,
        input: AuthPermissionCacheInvalidateInput
    ): Promise<AuthPermissionCacheInvalidateResult> {
        await this.permissionService.invalidateCache(input)
        return { success: true }
    }

    public override async resolveDataScope(_authorization: string, input: AuthDataScopeInput): Promise<AuthDataScopeResult> {
        return this.permissionService.resolveDataScope(input.uid, input.resourceCode)
    }

    public override async checkSuperAdmin(_authorization: string, input: { uid: string }): Promise<AuthSuperAdminResult> {
        return { superAdmin: await this.permissionService.isSuperAdmin(input.uid) }
    }

    public override async resolveAuthorizedPrincipal(
        _authorization: string,
        input: AuthPermissionCheckInput
    ): Promise<AuthAuthorizedPrincipalResult> {
        return this.permissionService.resolveAuthorizedPrincipal(input.uid, input.permissionCodes)
    }
}
