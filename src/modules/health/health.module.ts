import { Module } from '@nestjs/common'
import { HealthService } from '@/modules/health/health.service'

@Module({
    providers: [HealthService],
    exports: [HealthService]
})
export class HealthModule {}
