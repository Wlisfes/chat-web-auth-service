import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { AuthPrincipalResponseDto, InternalAuthGuard, Public, TokenIntrospectionDto } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator } from '@wlisfes/chat-web-base-schema/decorator'
import { PreserveHttpStatus } from '@wlisfes/chat-web-base-schema/filters'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { AuthService } from '@/modules/auth/auth.service'

/** 只供网关和可信服务调用的认证基础设施接口。 */
@Controller('internal/auth')
export class InternalAuthController {
    constructor(private readonly authService: AuthService) {}

    /** 由服务凭据保护，校验用户访问令牌并返回身份主体。 */
    @Public()
    @UseGuards(InternalAuthGuard)
    @PreserveHttpStatus()
    @HttpCode(HttpStatus.OK)
    @ApiServiceDecorator(Post('token/introspect'), {
        operation: { summary: '供网关和内部服务校验用户访问令牌并获取身份主体' },
        request: { source: 'body', type: TokenIntrospectionDto },
        response: { type: AuthPrincipalResponseDto, description: '令牌对应的身份主体' },
        bearerAuth: false
    })
    public async httpBaseAuthIntrospectToken(@Body() input: TokenIntrospectionDto): Promise<AuthPrincipal> {
        return this.authService.httpBaseAuthIntrospectToken(input.token)
    }
}
