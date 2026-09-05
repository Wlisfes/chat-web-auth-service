import { ApiProperty, OmitType, PickType } from '@nestjs/swagger'
import { TbAccountUserDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'

export class ServiceLivenessResponseDto {
    @ApiProperty({ description: '服务状态', enum: ['UP'], example: 'UP' })
    status: string

    @ApiProperty({ description: '检查时间', example: '2026-08-23T04:00:00.000Z' })
    timestamp: string
}

export class ServiceDependencyResponseDto {
    @ApiProperty({ description: '依赖是否连接成功', example: true })
    connected: boolean

    @ApiProperty({ description: '必需数据表数量', required: false, example: 1 })
    requiredTableCount?: number

    @ApiProperty({ description: '缺失的数据表', type: [String], required: false, example: [] })
    missingTables?: string[]

    @ApiProperty({ description: '检查失败原因', required: false, example: '连接超时' })
    error?: string
}

export class ServiceSecurityResponseDto {
    @ApiProperty({ description: 'JWT 密钥是否已正确配置', example: true })
    jwtConfigured: boolean
}

export class ServiceReadinessResponseDto {
    @ApiProperty({ description: '服务就绪状态', enum: ['UP', 'DOWN'], example: 'UP' })
    status: string

    @ApiProperty({ description: '检查时间', example: '2026-08-23T04:00:00.000Z' })
    timestamp: string

    @ApiProperty({ description: '数据库状态', type: ServiceDependencyResponseDto })
    database: ServiceDependencyResponseDto

    @ApiProperty({ description: 'Redis 状态', type: ServiceDependencyResponseDto })
    redis: ServiceDependencyResponseDto

    @ApiProperty({ description: '安全配置状态', type: ServiceSecurityResponseDto })
    security: ServiceSecurityResponseDto
}

export class LoginUserResponseDto extends PickType(TbAccountUserDto, ['uid', 'number', 'name', 'avatar'] as const) {}

export class AccessTokenResponseDto {
    @ApiProperty({ description: 'Bearer 访问令牌', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
    accessToken: string

    @ApiProperty({ description: '令牌类型', enum: ['Bearer'], example: 'Bearer' })
    tokenType: string

    @ApiProperty({ description: '有效期，单位为秒', example: 36000 })
    expiresIn: number
}

export class LoginResponseDto extends AccessTokenResponseDto {
    @ApiProperty({ description: '当前登录账号', type: LoginUserResponseDto })
    user: LoginUserResponseDto
}

/** 当前登录账号资料；鉴权服务只读取账号表，不返回密码摘要。 */
export class AccountUserResponseDto extends OmitType(TbAccountUserDto, ['password'] as const) {}
