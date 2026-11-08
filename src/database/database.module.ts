import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { NacosService } from '@wlisfes/chat-web-base-schema/nacos'
import { TbCrmUser } from '@wlisfes/chat-web-base-schema/chat-web-crm-mysql'
import { TbSrmUser } from '@wlisfes/chat-web-base-schema/chat-web-srm-mysql'
import {
    AUTH_CRM_CONNECTION,
    AUTH_CRM_MYSQL_CONFIG_KEY,
    AUTH_MYSQL_CONFIG_KEY,
    AUTH_MYSQL_ENTITIES,
    AUTH_SRM_CONNECTION,
    AUTH_SRM_MYSQL_CONFIG_KEY
} from '@/database/database.constants'

import { createMysqlOptions, DataBaseService } from '@wlisfes/chat-web-base-schema/database'

function createNamedConnection(
    name: string,
    configKey: string,
    entities: NonNullable<Parameters<typeof createMysqlOptions>[1]['entities']>
) {
    return TypeOrmModule.forRootAsync({
        name,
        imports: [ConfigModule],
        inject: [ConfigService, NacosService],
        useFactory: async (configService: ConfigService, nacosService: NacosService) => {
            await nacosService.loadConfig()
            return {
                ...createMysqlOptions(configService, { configKey, entities }),
                name
            }
        }
    })
}

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
        createNamedConnection(AUTH_CRM_CONNECTION, AUTH_CRM_MYSQL_CONFIG_KEY, [TbCrmUser]),
        createNamedConnection(AUTH_SRM_CONNECTION, AUTH_SRM_MYSQL_CONFIG_KEY, [TbSrmUser]),
        TypeOrmModule.forFeature([...AUTH_MYSQL_ENTITIES])
    ],
    providers: [DataBaseService],
    exports: [TypeOrmModule, DataBaseService]
})
export class DatabaseModule {}
