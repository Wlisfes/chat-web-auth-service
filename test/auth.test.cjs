const test = require('node:test')
const assert = require('node:assert/strict')
const { Logger } = require('@nestjs/common')

const { PATH_METADATA, METHOD_METADATA } = require('@nestjs/common/constants')
const { RequestMethod } = require('@nestjs/common')
const { InternalAuthGuard } = require('@wlisfes/chat-web-base-schema/auth')
const { AuthController } = require('../dist/modules/auth/auth.controller')
const { InternalAuthController } = require('../dist/modules/auth/internal-auth.controller')

function routeOf(controller, method) {
    return {
        path: Reflect.getMetadata(PATH_METADATA, controller.prototype[method]),
        method: Reflect.getMetadata(METHOD_METADATA, controller.prototype[method])
    }
}

test('公开认证路由保持前端约定的路径与方法', () => {
    // 控制器不带 auth 前缀：服务名称段由网关 /api/auth 路由承担，避免转发后出现重复段。
    assert.equal(Reflect.getMetadata(PATH_METADATA, AuthController), '')
    assert.deepEqual(routeOf(AuthController, 'httpBaseAuthWriteCodex'), { path: 'codex/write', method: RequestMethod.GET })
    assert.deepEqual(routeOf(AuthController, 'httpBaseAuthLoginToken'), { path: 'token/login', method: RequestMethod.POST })
    assert.deepEqual(routeOf(AuthController, 'httpBaseAuthContinueToken'), { path: 'token/continue', method: RequestMethod.POST })
    assert.deepEqual(routeOf(AuthController, 'httpBaseAuthLogoutToken'), { path: 'token/logout', method: RequestMethod.POST })
    assert.deepEqual(routeOf(AuthController, 'httpBaseAuthResolverToken'), { path: 'token/resolve', method: RequestMethod.GET })
})

test('验证码和登录是公开路由，续期、登出与身份解析需要访问令牌', () => {
    assert.equal(Reflect.getMetadata('auth:is-public', AuthController.prototype.httpBaseAuthWriteCodex), true)
    assert.equal(Reflect.getMetadata('auth:is-public', AuthController.prototype.httpBaseAuthLoginToken), true)
    assert.equal(Reflect.getMetadata('auth:is-public', AuthController.prototype.httpBaseAuthContinueToken), undefined)
    assert.equal(Reflect.getMetadata('auth:is-public', AuthController.prototype.httpBaseAuthLogoutToken), undefined)
    assert.equal(Reflect.getMetadata('auth:is-public', AuthController.prototype.httpBaseAuthResolverToken), undefined)
})

test('内部内省接口使用独立协议并由服务凭据守卫保护', () => {
    assert.equal(Reflect.getMetadata(PATH_METADATA, InternalAuthController), 'internal/auth')
    assert.deepEqual(routeOf(InternalAuthController, 'httpBaseAuthIntrospectToken'), {
        path: 'token/introspect',
        method: RequestMethod.POST
    })

    const guards = Reflect.getMetadata('__guards__', InternalAuthController.prototype.httpBaseAuthIntrospectToken) ?? []
    assert.equal(guards.includes(InternalAuthGuard), true)
})

const { CaptchaService } = require('../dist/modules/auth/captcha.service')

test('图形验证码写入 Redis 时记录键和值，便于本地排障', async () => {
    const writes = []
    const messages = []
    const originalLog = Logger.prototype.log
    Logger.prototype.log = message => messages.push(message)

    try {
        const service = new CaptchaService({
            setEx: async (...args) => writes.push(args)
        })
        const result = await service.create()

        assert.equal(writes.length, 1)
        assert.equal(writes[0][0], `chat-web:auth:captcha:${result.sid}`)
        assert.equal(writes[0][1], 180)
        assert.match(writes[0][2], /^[A-Z2-9]{4}$/)
        assert.equal(messages.length, 1)
        assert.match(messages[0], new RegExp(`key=.*${result.sid}`))
        assert.match(messages[0], new RegExp(`value=${writes[0][2]}`))
    } finally {
        Logger.prototype.log = originalLog
    }
})

function createContext(value) {
    return {
        switchToHttp: () => ({
            getRequest: () => ({ header: name => (name === 'x-service-token' ? value : undefined) })
        })
    }
}

test('内部认证 Guard 启动时要求 Nacos 服务凭据', () => {
    const guard = new InternalAuthGuard({ get: () => undefined })
    assert.throws(() => guard.onApplicationBootstrap(), /feign\.service_token/)
})

test('内部认证 Guard 使用固定时间比较校验服务凭据', () => {
    const guard = new InternalAuthGuard({ get: () => 'internal-token' })
    guard.onApplicationBootstrap()
    assert.equal(guard.canActivate(createContext('internal-token')), true)
    assert.throws(
        () => guard.canActivate(createContext('wrong-token')),
        error => error?.status === 401
    )
})

test('用户访问令牌不得作为服务凭据通过内部认证', () => {
    const guard = new InternalAuthGuard({ get: () => 'internal-token' })
    assert.throws(
        () => guard.canActivate(createContext('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature')),
        error => error?.status === 401
    )
})
test('CRM 客户资料返回客户表字段且不包含密码', () => {
    const { toPortalProfile } = require('../dist/modules/auth/portal-auth.service')
    const profile = toPortalProfile('crm', {
        keyId: 10241010,
        ownerUserUid: '2149446185344106496',
        name: '青萍科技股份有限公司',
        alias: 'CSK12333M5T',
        brandKeyId: 1001,
        currency: 'USD',
        email: 'limvcfast@gmail.com',
        avatar: null,
        phone: '14260435722',
        status: 'enable',
        payMode: 'prepaid',
        classType: 'common',
        level: 1,
        stage: 'cluetrail',
        authStatus: 'unverified',
        source: 1,
        remark: null,
        createTime: new Date(2026, 9, 12, 15, 29, 24),
        modifyTime: '2026-11-14 22:05:29',
        password: 'scrypt-secret'
    })
    assert.equal(profile.avatar, null)
    assert.equal(profile.uid, '10241010')
    assert.equal(profile.brandKeyId, 1001)
    assert.equal(profile.createTime, '2026-10-12 15:29:24')
    assert.equal(Object.hasOwn(profile, 'password'), false)
    assert.deepEqual(profile.config, { userKeyId: 10241010, smsAppLimit: 5 })
})

test('CRM 客户资料使用查询到的客户配置', () => {
    const { toPortalProfile } = require('../dist/modules/auth/portal-auth.service')
    const profile = toPortalProfile(
        'crm',
        {
            keyId: 10241010,
            ownerUserUid: '2149446185344106496',
            name: '青萍科技股份有限公司',
            alias: 'CSK12333M5T',
            brandKeyId: 1001,
            currency: 'USD',
            email: 'limvcfast@gmail.com',
            avatar: null,
            phone: '14260435722',
            status: 'enable',
            payMode: 'prepaid',
            classType: 'common',
            level: 1,
            stage: 'cluetrail',
            authStatus: 'unverified',
            source: 1,
            remark: null,
            createTime: null,
            modifyTime: null,
            password: 'scrypt-secret'
        },
        { userKeyId: 10241010, smsAppLimit: 8 }
    )
    assert.deepEqual(profile.config, { userKeyId: 10241010, smsAppLimit: 8 })
})

test('SRM 客户资料不返回 CRM 专有字段', () => {
    const { toPortalProfile } = require('../dist/modules/auth/portal-auth.service')
    const profile = toPortalProfile('srm', {
        keyId: '8',
        ownerUserUid: '1',
        name: '供应商',
        alias: null,
        currency: 'USD',
        email: 'supplier@example.com',
        avatar: 'https://picsum.photos/500',
        phone: null,
        status: 'enable',
        payMode: 'postpaid',
        level: '2',
        stage: 'testing',
        source: '3',
        remark: null,
        createTime: null,
        modifyTime: null,
        password: 'hidden'
    })
    assert.equal(profile.accountType, 'srm')
    assert.equal(profile.avatar, 'https://picsum.photos/500')
    assert.equal(profile.level, 2)
    assert.equal(Object.hasOwn(profile, 'brandKeyId'), false)
    assert.equal(Object.hasOwn(profile, 'config'), false)
    assert.equal(Object.hasOwn(profile, 'password'), false)
})
