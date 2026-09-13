import { Module } from '@nestjs/common'
import { FeignController } from '@/modules/feign/feign.controller'
import { FeignService } from '@/modules/feign/feign.service'
import { PermissionModule } from '@/modules/permission/permission.module'

@Module({
    imports: [PermissionModule],
    controllers: [FeignController],
    providers: [FeignService]
})
export class FeignModule {}
