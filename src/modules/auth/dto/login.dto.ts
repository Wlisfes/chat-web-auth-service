import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { isNotEmpty, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, MaxLength, Min, ValidateIf } from 'class-validator'

export class CodexWriteQueryDto {
    @ApiPropertyOptional({ description: '是否使用反色验证码；1 表示启用，0 表示关闭', enum: ['0', '1'], default: '0', example: '0' })
    @IsOptional()
    @IsIn(['0', '1'], { message: '验证码反色配置只能是0或1' })
    inverse?: string

    @ApiPropertyOptional({ description: '用于避免浏览器缓存验证码的毫秒时间戳', example: 1787400000000 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '验证码时间戳必须是整数' })
    @Min(1, { message: '验证码时间戳必须大于0' })
    timestamp?: number
}

export class LoginDto {
    @ApiProperty({ description: '登录标识，支持工号、手机号或邮箱；优先使用此字段', example: '1001' })
    @ValidateIf(input => isNotEmpty(input.account) || !isNotEmpty(input.number))
    @IsString({ message: '登录账号必须是字符串' })
    @IsNotEmpty({ message: '登录账号必填' })
    @MaxLength(128, { message: '登录账号长度不能超过128位' })
    account: string

    @ApiPropertyOptional({ description: '兼容旧版客户端的工号字段；未传 account 时作为登录标识', example: '1001', deprecated: true })
    @ValidateIf(input => isNotEmpty(input.number))
    @IsString({ message: '工号必须是字符串' })
    @IsNotEmpty({ message: '工号不能为空' })
    @MaxLength(32, { message: '工号长度不能超过32位' })
    number?: string

    @ApiProperty({ description: '登录密码', example: 'Abc123456', writeOnly: true })
    @IsString({ message: '登录密码必须是字符串' })
    @IsNotEmpty({ message: '登录密码必填' })
    @MaxLength(128, { message: '登录密码长度不能超过128位' })
    password: string

    @ApiProperty({ description: '图形验证码', example: 'A7K9' })
    @IsString({ message: '验证码必须是字符串' })
    @IsNotEmpty({ message: '验证码必填' })
    @Length(4, 4, { message: '验证码必须为4位' })
    code: string
}
