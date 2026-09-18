import { ConfigService } from '@nestjs/config'
import { ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { FeignClientAuthManager } from '@wlisfes/chat-web-base-schema/feign'
import { FeignService } from '@/feign/feign.service'

/** Auth 服务内部 Feign 接口控制器。 */
@ApifoxController('内部鉴权 Feign 接口')
export class FeignController extends FeignClientAuthManager {
    constructor(service: FeignService, configService: ConfigService) {
        super(service, configService)
    }
}
