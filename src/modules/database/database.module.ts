import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NacosService } from '@wlisfes/chat-web-base-schema/nacos'
import { createMysqlOptions, DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { AUTH_MYSQL_CONFIG_KEY, AUTH_MYSQL_ENTITIES } from '@/modules/database/database.constants'

@Global()
@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService, NacosService],
            useFactory: async (configService: ConfigService, nacosService: NacosService) => {
                await nacosService.loadConfig()
                return createMysqlOptions(configService, {
                    configKey: AUTH_MYSQL_CONFIG_KEY,
                    entities: [...AUTH_MYSQL_ENTITIES]
                })
            }
        }),
        TypeOrmModule.forFeature([...AUTH_MYSQL_ENTITIES])
    ],
    providers: [DataBaseService],
    exports: [TypeOrmModule, DataBaseService]
})
export class DatabaseModule {}
