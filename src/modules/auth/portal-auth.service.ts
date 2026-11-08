import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PasswordService, TokenService } from '@wlisfes/chat-web-base-schema/auth'
import { resolveFeignServiceAuthorization } from '@wlisfes/chat-web-base-schema/feign'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { AuthSessionService } from '@wlisfes/chat-web-base-schema/auth-session'
import { DataSource, InjectDataSource } from '@wlisfes/chat-web-base-schema/database'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import { AUTH_CRM_CONNECTION, AUTH_SRM_CONNECTION } from '@/database/database.constants'
import { PortalLoginResponseDto } from '@/dto/api-response.dto'
import { CaptchaService } from '@/modules/auth/captcha.service'
import * as AuthDto from '@/modules/auth/dto/login.dto'

export type PortalAccountType = 'crm' | 'srm'

type PortalAccountRow = {
    keyId: number | string
    name: string
    alias: string | null
    email: string
    status: string
    password: string
}

@Injectable()
export class PortalAuthService {
    constructor(
        @InjectDataSource(AUTH_CRM_CONNECTION) private readonly crmDataSource: DataSource,
        @InjectDataSource(AUTH_SRM_CONNECTION) private readonly srmDataSource: DataSource,
        private readonly passwordService: PasswordService,
        private readonly tokenService: TokenService,
        private readonly sessionService: AuthSessionService,
        private readonly captchaService: CaptchaService,
        private readonly redisService: RedisService,
        private readonly configService: ConfigService
    ) {}

    /** CRM 客户邮箱密码登录。 */
    public async loginCrm(input: AuthDto.PortalLoginDto, captchaSid?: string): Promise<PortalLoginResponseDto> {
        return this.login('crm', 'tb_crm_user', input, captchaSid)
    }

    /** SRM 供应商邮箱密码登录。 */
    public async loginSrm(input: AuthDto.PortalLoginDto, captchaSid?: string): Promise<PortalLoginResponseDto> {
        return this.login('srm', 'tb_srm_user', input, captchaSid)
    }

    /** CRM 客户自助注册，校验验证码后创建账号并直接登录。 */
    public async registerCrm(input: AuthDto.PortalRegisterDto, captchaSid?: string): Promise<PortalLoginResponseDto> {
        await this.captchaService.verify(captchaSid, input.code)
        const email = input.email.trim()
        const nickname = input.nickname.trim()
        const exists = (await this.crmDataSource.query('SELECT key_id AS keyId FROM tb_crm_user WHERE email = ? LIMIT 1', [
            email
        ])) as Array<{ keyId: number }>
        if (exists.length) {
            throw new ConflictException('邮箱已被注册')
        }
        const password = await this.passwordService.hash(input.password)
        const defaults = await this.resolveRegisterDefaults()
        const alias = await this.createAlias(defaults.ownerNumber)
        const ownerUid = defaults.ownerUid
        const result = await this.crmDataSource.transaction(async manager => {
            const inserted = (await manager.query(
                `INSERT INTO tb_crm_user
                    (owner_user_uid, name, alias, brand_key_id, currency, email, password, phone, status, pay_mode, class_type, level, stage, auth_status, source, create_by, modify_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'enable', 'prepaid', 'common', 1, 'cluetrail', 'unverified', ?, ?, ?)`,
                [ownerUid, nickname, alias, defaults.brandKeyId, defaults.currency, email, password, defaults.source, ownerUid, ownerUid]
            )) as { insertId: number }
            const keyId = Number(inserted.insertId)
            await manager.query(`INSERT INTO tb_crm_user_config (user_key_id, sms_app_limit, create_by, modify_by) VALUES (?, 5, ?, ?)`, [
                keyId,
                ownerUid,
                ownerUid
            ])
            await manager.query(
                `INSERT INTO tb_crm_user_contact (user_key_id, name, items, status, create_by, modify_by) VALUES (?, ?, ?, 'enable', ?, ?)`,
                [keyId, nickname, JSON.stringify([]), ownerUid, ownerUid]
            )
            return keyId
        })
        try {
            await this.createWallet(result, defaults.currency)
        } catch (error) {
            await this.crmDataSource.query('DELETE FROM tb_crm_user_contact WHERE user_key_id = ?', [result])
            await this.crmDataSource.query('DELETE FROM tb_crm_user_config WHERE user_key_id = ?', [result])
            await this.crmDataSource.query('DELETE FROM tb_crm_user WHERE key_id = ?', [result])
            const reason = error instanceof Error ? error.message : String(error)
            throw new ServiceUnavailableException(`创建客户钱包失败：${reason}`)
        }
        return this.login('crm', 'tb_crm_user', { email, password: input.password, code: input.code }, undefined, true)
    }

    /** 读取客户会话类型；没有标记时返回 undefined。 */
    public async readAccountType(sessionId: string): Promise<PortalAccountType | undefined> {
        const value = await this.redisService.get(this.portalKey(sessionId))
        return value === 'crm' || value === 'srm' ? value : undefined
    }

    /** 按会话标记返回客户资料；没有标记时返回 undefined。 */
    public async resolveProfile(sub: string, sessionId: string) {
        const accountType = await this.readAccountType(sessionId)
        if (!accountType) return undefined
        const user = await this.findActiveAccount(accountType, sub)
        return {
            accountType,
            keyId: Number(user.keyId),
            name: user.name,
            alias: user.alias || undefined,
            email: user.email,
            uid: String(user.keyId)
        }
    }

    /** 按会话标记解析客户身份；没有标记时返回 undefined，交给管理端账号解析。 */
    public async resolvePrincipal(sub: string, sessionId: string): Promise<AuthPrincipal | undefined> {
        const accountType = await this.readAccountType(sessionId)
        if (!accountType) return undefined
        const user = await this.findActiveAccount(accountType, sub)
        return this.toPrincipal(user, sessionId)
    }

    /** 续期时把客户会话标记转到新会话。 */
    public async moveSession(oldSessionId: string, newSessionId: string, expiresIn: number): Promise<void> {
        const accountType = await this.readAccountType(oldSessionId)
        if (!accountType) return
        await this.redisService.setEx(this.portalKey(newSessionId), expiresIn, accountType)
        await this.redisService.del(this.portalKey(oldSessionId))
    }

    /** 退出时删除客户会话标记。 */
    public async clearSession(sessionId: string): Promise<void> {
        await this.redisService.del(this.portalKey(sessionId))
    }

    private async login(
        accountType: PortalAccountType,
        tableName: 'tb_crm_user' | 'tb_srm_user',
        input: AuthDto.PortalLoginDto,
        captchaSid?: string,
        skipCaptcha = false
    ): Promise<PortalLoginResponseDto> {
        if (!skipCaptcha) {
            await this.captchaService.verify(captchaSid, input.code)
        }
        const email = input.email.trim()
        const dataSource = accountType === 'crm' ? this.crmDataSource : this.srmDataSource
        const rows = (await dataSource.query(
            `SELECT key_id AS keyId, name, alias, email, status, password
             FROM \`${tableName}\`
             WHERE email = ?
             LIMIT 1`,
            [email]
        )) as PortalAccountRow[]
        const user = rows[0]
        if (!user || !(await this.passwordService.verify(input.password, user.password))) {
            throw new UnauthorizedException('账号或密码错误')
        }
        this.assertEnabled(user)
        const issued = this.tokenService.issueAccessToken(String(user.keyId))
        await this.sessionService.create(issued.claims)
        await this.redisService.setEx(this.portalKey(issued.claims.jti), issued.expiresIn, accountType)
        const { claims: _claims, ...token } = issued
        return {
            ...token,
            user: {
                keyId: Number(user.keyId),
                name: user.name,
                alias: user.alias || undefined,
                email: user.email,
                accountType
            }
        }
    }

    private async findActiveAccount(accountType: PortalAccountType, keyId: string): Promise<PortalAccountRow> {
        const tableName = accountType === 'crm' ? 'tb_crm_user' : 'tb_srm_user'
        const dataSource = accountType === 'crm' ? this.crmDataSource : this.srmDataSource
        const rows = (await dataSource.query(
            `SELECT key_id AS keyId, name, alias, email, status, password
             FROM \`${tableName}\`
             WHERE key_id = ?
             LIMIT 1`,
            [keyId]
        )) as PortalAccountRow[]
        const user = rows[0]
        if (!user) throw new UnauthorizedException('账号不存在')
        this.assertEnabled(user)
        return user
    }

    private assertEnabled(user: PortalAccountRow): void {
        if (user.status !== 'enable') {
            throw new UnauthorizedException('账号已禁用')
        }
    }

    /** 网关身份校验仍要求工号为 4 位、姓名不超过 32 位，客户主键放在 uid。 */
    private toPrincipal(user: PortalAccountRow, sessionId: string): AuthPrincipal {
        const uid = String(user.keyId)
        const name = user.name.trim()
        return {
            uid,
            number: uid.slice(-4).padStart(4, '0'),
            name: name.length >= 2 ? name.slice(0, 32) : '客户',
            sessionId
        }
    }

    private async resolveRegisterDefaults(): Promise<{
        brandKeyId: number
        currency: string
        ownerUid: string
        ownerNumber: string
        source: number
    }> {
        const rows = (await this.crmDataSource.query(
            'SELECT brand_key_id AS brandKeyId, currency FROM tb_crm_user ORDER BY key_id ASC LIMIT 1'
        )) as Array<{ brandKeyId: number; currency: string }>
        return {
            brandKeyId: Number(rows[0]?.brandKeyId || 1),
            currency: rows[0]?.currency || 'USD',
            ownerUid: '0',
            ownerNumber: '0000',
            source: 1024186
        }
    }

    private async createAlias(ownerNumber: string): Promise<string> {
        const alphabet = '123456789ABCDFGHKMNPQRSTUWXY'
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
            const alias = `CSK${ownerNumber}${code}`
            const exists = (await this.crmDataSource.query('SELECT key_id AS keyId FROM tb_crm_user WHERE alias = ? LIMIT 1', [
                alias
            ])) as unknown[]
            if (!exists.length) return alias
        }
        throw new ConflictException('客户别名生成失败，请重试')
    }

    private async createWallet(userKeyId: number, currency: string): Promise<void> {
        const baseUrl = this.configService.get<string>('gateway.feign.url')
        const timeout = Number(this.configService.get('gateway.feign.timeout') || 10000)
        if (!baseUrl) throw new BadRequestException('缺少网关地址，无法创建客户钱包')
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeout)
        try {
            const response = await fetch(`${baseUrl.replace(/\/$/, '')}/feign/finance/crm/user/wallet/create`, {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                    authorization: resolveFeignServiceAuthorization(this.configService)
                },
                body: JSON.stringify({ userKeyId, currency, payMode: 'prepaid' }),
                signal: controller.signal
            })
            const payload = (await response.json()) as { code?: number; message?: string }
            if (!response.ok || (typeof payload.code === 'number' && payload.code !== 200)) {
                throw new Error(payload.message || '财务服务创建钱包失败')
            }
        } finally {
            clearTimeout(timer)
        }
    }

    private portalKey(sessionId: string): string {
        return `auth:portal:${sessionId}`
    }
}
