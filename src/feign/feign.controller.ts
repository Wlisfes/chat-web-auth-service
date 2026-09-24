import { ConfigService } from '@nestjs/config'
import { ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { FeignClientAuthManager } from '@wlisfes/chat-web-base-schema/feign'
import { FeignService } from '@/feign/feign.service'

/**
 * 鉴权服务内部 Feign 接口控制器。
 *
 * 路由、Swagger 文档和公开访问标记全部从共享 Feign 客户端继承，这里只负责把真实业务
 * 实现注入基类，避免服务端重复声明服务间契约。
 */
@ApifoxController('内部鉴权 Feign 接口')
export class FeignController extends FeignClientAuthManager {
    constructor(service: FeignService, configService: ConfigService) {
        super(service, configService)
    }
}
