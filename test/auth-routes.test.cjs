const test = require('node:test')
const assert = require('node:assert/strict')

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
    assert.deepEqual(routeOf(AuthController, 'httpBaseAuthResolverToken'), { path: 'token/resolver', method: RequestMethod.GET })
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
