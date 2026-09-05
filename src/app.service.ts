import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ServiceLivenessResponseDto, ServiceReadinessResponseDto } from '@/dto/api-response.dto'
import { HealthService } from '@/modules/health/health.service'

@Injectable()
export class AppService {
    constructor(private readonly healthService: HealthService) {}

    /**鉴权服务信息*/
    public async httpBaseAuthResolverService(): Promise<string> {
        return 'Hello World!'
    }

    /**鉴权服务兼容就绪状态*/
    public async httpBaseAuthHealthService(): Promise<ServiceReadinessResponseDto> {
        const result = await this.healthService.getReadiness()
        if (result.status !== 'UP') {
            throw new ServiceUnavailableException({ message: '鉴权服务尚未就绪', data: result })
        }
        return result
    }

    /**鉴权服务存活状态*/
    public async httpBaseAuthLivenessService(): Promise<ServiceLivenessResponseDto> {
        return this.healthService.getLiveness()
    }

    /**鉴权服务就绪状态*/
    public async httpBaseAuthReadinessService(): Promise<ServiceReadinessResponseDto> {
        return this.httpBaseAuthHealthService()
    }
}
