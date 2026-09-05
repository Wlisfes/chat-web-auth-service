import { Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { PasswordService, TokenService } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { AuthSessionService } from '@wlisfes/chat-web-base-schema/auth-session'
import { TbAccountUser } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { isEmpty, isNotEmpty } from 'class-validator'
import { Repository } from 'typeorm'
import { AccessTokenResponseDto, AccountUserResponseDto, LoginResponseDto } from '@/dto/api-response.dto'
import { AuthUtilsService } from '@/modules/auth/auth.utils.service'
import { CaptchaService } from '@/modules/auth/captcha.service'
import * as AuthDto from '@/modules/auth/dto/login.dto'

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(TbAccountUser) private readonly userRepository: Repository<TbAccountUser>,
        private readonly passwordService: PasswordService,
        private readonly tokenService: TokenService,
        private readonly sessionService: AuthSessionService,
        private readonly captchaService: CaptchaService,
        private readonly authUtilsService: AuthUtilsService
    ) {}

    /**生成图形验证码*/
    public async httpBaseAuthWriteCodex(query: AuthDto.CodexWriteQueryDto): Promise<{ sid: string; svg: string; expiresIn: number }> {
        const captcha = await this.captchaService.create(query.inverse === '1')
        return { ...captcha, expiresIn: this.captchaService.expiresIn }
    }

    /**账号密码登录并签发访问令牌*/
    public async httpBaseAuthLoginToken(input: AuthDto.LoginDto, captchaSid?: string): Promise<LoginResponseDto> {
        await this.captchaService.verify(captchaSid, input.code)
        const account = isNotEmpty(input.account?.trim()) ? input.account.trim() : input.number?.trim()
        if (isEmpty(account)) {
            throw new UnauthorizedException('登录账号必填')
        }
        const user = await this.authUtilsService.findUserByAccountRequired(account)

        if (!(await this.passwordService.verify(input.password, user.password))) {
            throw new UnauthorizedException('账号或密码错误')
        }
        this.authUtilsService.assertActiveUser(user)

        // 最近登录时间是鉴权服务对共享账号表的唯一写入，其余字段仍只由账号服务维护。
        await this.userRepository.update({ uid: user.uid }, { lastLoginTime: new Date() })
        const issued = this.tokenService.issueAccessToken(user.uid)
        await this.sessionService.create(issued.claims)
        const { claims: _claims, ...token } = issued
        return {
            ...token,
            user: {
                uid: user.uid,
                number: user.number,
                name: user.name,
                avatar: user.avatar
            }
        }
    }

    /**续期并轮换当前登录会话*/
    public async httpBaseAuthContinueToken(principal: AuthPrincipal): Promise<AccessTokenResponseDto> {
        const issued = this.tokenService.issueAccessToken(principal.uid)
        await this.sessionService.rotate(principal.sessionId, issued.claims)
        const { claims: _claims, ...token } = issued
        return token
    }

    /**退出并撤销当前登录会话*/
    public async httpBaseAuthLogoutToken(principal: AuthPrincipal): Promise<SuccessResponseDataDto> {
        await this.sessionService.revoke(principal.sessionId)
        return { success: true }
    }

    /**获取当前登录账号*/
    public async httpBaseAuthResolverToken(principal: AuthPrincipal): Promise<AccountUserResponseDto> {
        return this.authUtilsService.findActiveUserRequired(principal.uid)
    }

    /**校验访问令牌并返回身份主体*/
    public async httpBaseAuthIntrospectToken(token: string): Promise<AuthPrincipal> {
        const claims = this.tokenService.verifyAccessToken(token)
        await this.sessionService.assertActive(claims)
        await this.authUtilsService.findActiveUserRequired(claims.sub)
        return { uid: claims.sub, sessionId: claims.jti }
    }
}
