import { Body, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common'
import { CurrentPrincipal, Public } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import type { Request, Response } from 'express'
import { AuthService } from '@/modules/auth/auth.service'
import { AUTH_CAPTCHA_COOKIE } from '@/modules/auth/captcha.service'
import { CodexWriteQueryDto, LoginDto } from '@/modules/auth/dto/login.dto'
import { AccessTokenResponseDto, AccountUserResponseDto, LoginResponseDto } from '@/dto/api-response.dto'

@ApifoxController('身份认证', 'auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Public()
    @ApiServiceDecorator(Get('codex/write'), {
        operation: { summary: '获取图形验证码' },
        request: { source: 'query', type: CodexWriteQueryDto },
        response: {
            envelope: false,
            contentType: 'image/svg+xml',
            schema: { type: 'string', example: '<svg xmlns="http://www.w3.org/2000/svg">...</svg>' },
            description: 'SVG 图形验证码'
        }
    })
    public async httpBaseAuthWriteCodex(@Req() request: Request, @Res() response: Response, @Query() query: CodexWriteQueryDto) {
        const captcha = await this.authService.httpBaseAuthWriteCodex(query)
        response.cookie(AUTH_CAPTCHA_COOKIE, captcha.sid, {
            httpOnly: true,
            maxAge: captcha.expiresIn * 1000,
            path: '/',
            sameSite: 'lax',
            secure: request.secure || request.header('x-forwarded-proto') === 'https'
        })
        response.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0'
        })
        return response.type('image/svg+xml').send(captcha.svg)
    }

    @Public()
    @HttpCode(HttpStatus.OK)
    @ApiServiceDecorator(Post('token/login'), {
        operation: { summary: '使用工号、手机号或邮箱登录' },
        request: { source: 'body', type: LoginDto },
        response: { type: LoginResponseDto, description: '登录成功并返回 Bearer Token' }
    })
    public async httpBaseAuthLoginToken(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() input: LoginDto) {
        const result = await this.authService.httpBaseAuthLoginToken(input, this.getCookie(request, AUTH_CAPTCHA_COOKIE))
        response.clearCookie(AUTH_CAPTCHA_COOKIE, { path: '/' })
        return result
    }

    @HttpCode(HttpStatus.OK)
    @ApiServiceDecorator(Post('token/continue'), {
        operation: { summary: '续期并轮换当前登录会话' },
        response: { type: AccessTokenResponseDto, description: '轮换后的 Bearer Token' },
        bearerAuth: true
    })
    public async httpBaseAuthContinueToken(@CurrentPrincipal() principal: AuthPrincipal) {
        return this.authService.httpBaseAuthContinueToken(principal)
    }

    @HttpCode(HttpStatus.OK)
    @ApiServiceDecorator(Post('token/logout'), {
        operation: { summary: '退出并撤销当前登录会话' },
        response: { type: SuccessResponseDataDto, description: '退出登录结果' },
        bearerAuth: true
    })
    public async httpBaseAuthLogoutToken(@CurrentPrincipal() principal: AuthPrincipal) {
        return this.authService.httpBaseAuthLogoutToken(principal)
    }

    @ApiServiceDecorator(Get('token/resolver'), {
        operation: { summary: '获取当前登录身份' },
        response: { type: AccountUserResponseDto, description: '当前登录账号信息' },
        bearerAuth: true
    })
    public async httpBaseAuthResolverToken(@CurrentPrincipal() principal: AuthPrincipal) {
        return this.authService.httpBaseAuthResolverToken(principal)
    }

    /** HTTP Cookie 解析属于协议适配，禁止下沉到业务 Service。 */
    private getCookie(request: Request, name: string): string | undefined {
        const encodedName = `${encodeURIComponent(name)}=`
        for (const entry of request.header('cookie')?.split(';') ?? []) {
            const cookie = entry.trim()
            if (!cookie.startsWith(encodedName)) {
                continue
            }
            try {
                return decodeURIComponent(cookie.slice(encodedName.length))
            } catch {
                return undefined
            }
        }
        return undefined
    }
}
