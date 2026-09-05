const test = require('node:test')
const assert = require('node:assert/strict')

const { InternalAuthGuard } = require('@wlisfes/chat-web-base-schema/auth')

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
