import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InternalAuthGuard, PasswordService } from '@wlisfes/chat-web-base-schema/auth'
import { TbAccountUser } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { AuthController } from '@/modules/auth/auth.controller'
import { AuthService } from '@/modules/auth/auth.service'
import { AuthUtilsService } from '@/modules/auth/auth.utils.service'
import { CaptchaService } from '@/modules/auth/captcha.service'
import { InternalAuthController } from '@/modules/auth/internal-auth.controller'

/**
 * 鉴权服务认证模块。
 *
 * 令牌签发、会话存取和守卫由共享的 SessionAuthModule 提供，这里只补充登录、验证码
 * 和账号状态校验；共享账号表只读，最近登录时间是唯一写入字段。
 */
@Module({
    imports: [TypeOrmModule.forFeature([TbAccountUser])],
    controllers: [AuthController, InternalAuthController],
    providers: [AuthService, AuthUtilsService, CaptchaService, InternalAuthGuard, PasswordService],
    exports: [AuthService]
})
export class AuthModule {}
