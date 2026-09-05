import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { JwtAuthGuard, SessionAuthModule } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RedisModule } from '@wlisfes/chat-web-base-schema/redis'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { AuthModule } from '@/modules/auth/auth.module'
import { DatabaseModule } from '@/modules/database/database.module'
import { HealthModule } from '@/modules/health/health.module'

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        // 登录会话由鉴权服务独占 Redis index 0；账号服务迁移后不再使用该索引。
        RedisModule.forRoot({ database: 0 }),
        HttpResponseModule,
        DatabaseModule,
        // 鉴权服务是唯一持有 JWT 密钥并直接校验会话的服务。
        SessionAuthModule,
        AuthModule,
        HealthModule
    ],
    controllers: [AppController],
    providers: [AppService, { provide: APP_GUARD, useExisting: JwtAuthGuard }]
})
export class AppModule {}
