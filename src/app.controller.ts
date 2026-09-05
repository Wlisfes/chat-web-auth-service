import { Get } from '@nestjs/common'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { PreserveHttpStatus } from '@wlisfes/chat-web-base-schema/filters'
import { AppService } from '@/app.service'
import { ServiceLivenessResponseDto, ServiceReadinessResponseDto } from '@/dto/api-response.dto'

@ApifoxController('鉴权服务-运行状态')
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Public()
    @ApiServiceDecorator(Get(), {
        operation: { summary: '查看鉴权服务信息' },
        response: { type: String, description: '鉴权服务名称' }
    })
    public async httpBaseAuthResolverService() {
        return this.appService.httpBaseAuthResolverService()
    }

    @Public()
    @ApiServiceDecorator(Get('health'), {
        operation: { summary: '鉴权服务健康检查' },
        response: { type: ServiceReadinessResponseDto, description: '数据库、Redis 与安全配置状态' }
    })
    @PreserveHttpStatus()
    public async httpBaseAuthHealthService() {
        return this.appService.httpBaseAuthHealthService()
    }

    @Public()
    @ApiServiceDecorator(Get('health/live'), {
        operation: { summary: '鉴权服务存活检查' },
        response: { type: ServiceLivenessResponseDto, description: '进程正常时返回 UP' }
    })
    public async httpBaseAuthLivenessService() {
        return this.appService.httpBaseAuthLivenessService()
    }

    @Public()
    @ApiServiceDecorator(Get('health/ready'), {
        operation: { summary: '鉴权服务就绪检查' },
        response: { type: ServiceReadinessResponseDto, description: '数据库、Redis 与安全配置状态' }
    })
    @PreserveHttpStatus()
    public async httpBaseAuthReadinessService() {
        return this.appService.httpBaseAuthReadinessService()
    }
}
