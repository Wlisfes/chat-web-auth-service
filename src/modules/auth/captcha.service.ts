import { randomUUID, timingSafeEqual } from 'node:crypto'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import { create } from 'svg-captcha'
import { isEmpty } from 'class-validator'

/** Cookie 名称保持与账号服务历史实现一致，避免迁移期间已下发的验证码会话失效。 */
export const AUTH_CAPTCHA_COOKIE = 'chat-web-account-captcha'

@Injectable()
export class CaptchaService {
    private readonly logger = new Logger(CaptchaService.name)
    /** Redis 键前缀沿用账号服务实现，迁移期间两侧读取同一批验证码。 */
    private readonly keyPrefix = 'chat-web:account:captcha'
    public readonly expiresIn = 180

    constructor(private readonly redisService: RedisService) {}

    public async create(inverse = false): Promise<{ sid: string; svg: string }> {
        const sid = randomUUID()
        const captcha = create({
            charPreset: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
            width: 120,
            height: 40,
            fontSize: 40,
            inverse,
            noise: 2
        })
        const value = captcha.text.toUpperCase()
        const key = this.getKey(sid)
        await this.redisService.setEx(key, this.expiresIn, value)
        // 图形验证码是一次性排障信息，记录 Redis 键和值便于本地登录问题定位；密码和令牌不会写入此日志。
        this.logger.log(`图形验证码已写入 Redis：key=${key}, value=${value}, expiresIn=${this.expiresIn}s`)
        return { sid, svg: captcha.data }
    }

    public async verify(sid: string | undefined, input: string): Promise<void> {
        if (isEmpty(sid)) {
            throw new BadRequestException('验证码不存在或已过期')
        }
        const expected = await this.redisService.getDel(this.getKey(sid))
        const actual = input.trim().toUpperCase()
        if (!expected || expected.length !== actual.length) {
            throw new BadRequestException('验证码错误或已过期')
        }
        const expectedBuffer = Buffer.from(expected)
        const actualBuffer = Buffer.from(actual)
        if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
            throw new BadRequestException('验证码错误或已过期')
        }
    }

    private getKey(sid: string): string {
        return `${this.keyPrefix}:${sid}`
    }
}
