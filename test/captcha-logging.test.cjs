const test = require('node:test')
const assert = require('node:assert/strict')
const { Logger } = require('@nestjs/common')

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
        assert.equal(writes[0][0], `chat-web:account:captcha:${result.sid}`)
        assert.equal(writes[0][1], 180)
        assert.match(writes[0][2], /^[A-Z2-9]{4}$/)
        assert.equal(messages.length, 1)
        assert.match(messages[0], new RegExp(`key=.*${result.sid}`))
        assert.match(messages[0], new RegExp(`value=${writes[0][2]}`))
    } finally {
        Logger.prototype.log = originalLog
    }
})
