import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import { DataSource } from 'typeorm'
import { ServiceDependencyResponseDto, ServiceLivenessResponseDto, ServiceReadinessResponseDto } from '@/dto/api-response.dto'

type TableRow = {
    tableName: string
}

@Injectable()
export class HealthService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly configService: ConfigService,
        private readonly redisService: RedisService
    ) {}

    public async getLiveness(): Promise<ServiceLivenessResponseDto> {
        return { status: 'UP', timestamp: new Date().toISOString() }
    }

    public async getReadiness(): Promise<ServiceReadinessResponseDto> {
        const requiredTables = [...new Set(this.dataSource.entityMetadatas.map(metadata => metadata.tableName))].sort()
        const jwtSecret = this.configService.get<string>('security.jwt.secret')
        const jwtConfigured = typeof jwtSecret === 'string' && jwtSecret.length >= 32
        let database: ServiceDependencyResponseDto
        let databaseReady = false
        try {
            const placeholders = requiredTables.map(() => '?').join(', ')
            const rows = (await this.dataSource.query(
                `SELECT table_name AS tableName
                 FROM information_schema.tables
                 WHERE table_schema = DATABASE()
                   AND table_name IN (${placeholders})`,
                requiredTables
            )) as TableRow[]
            const existingTables = new Set(rows.map(row => row.tableName))
            const missingTables = requiredTables.filter(tableName => !existingTables.has(tableName))
            databaseReady = this.dataSource.isInitialized && !missingTables.length
            database = {
                connected: this.dataSource.isInitialized,
                requiredTableCount: requiredTables.length,
                missingTables
            }
        } catch (error) {
            database = {
                connected: false,
                error: error instanceof Error ? error.message : String(error)
            }
        }

        let redis: ServiceDependencyResponseDto
        let redisReady = false
        try {
            redisReady = await this.redisService.ping()
            redis = { connected: redisReady }
        } catch (error) {
            redis = { connected: false, error: error instanceof Error ? error.message : String(error) }
        }

        return {
            status: databaseReady && redisReady && jwtConfigured ? 'UP' : 'DOWN',
            database,
            redis,
            security: { jwtConfigured },
            timestamp: new Date().toISOString()
        }
    }
}
