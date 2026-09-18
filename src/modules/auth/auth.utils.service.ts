import { Injectable, UnauthorizedException } from '@nestjs/common'
import * as Schema from '@wlisfes/chat-web-base-schema'

import { InjectRepository, DataBaseService, Repository } from '@wlisfes/chat-web-base-schema/database'
import { isEmpty } from '@wlisfes/chat-web-base-schema/utils'
@Injectable()
export class AuthUtilsService {
    constructor(
        @InjectRepository(Schema.TbAccountUser) private readonly userRepository: Repository<Schema.TbAccountUser>,
        private readonly database: DataBaseService
    ) {}

    /** 按工号、手机号或邮箱查找包含密码摘要的账号。 */
    public async findUserByAccountRequired(account: string): Promise<Schema.TbAccountUser> {
        const vague = account.trim()
        if (isEmpty(vague)) {
            throw new UnauthorizedException('登录账号必填')
        }
        return await this.database.builder(this.userRepository, qb => {
            qb.addSelect('t.password')
            qb.where('t.number = :vague OR t.phone = :vague OR t.email = :vague', { vague })
            return qb.getOne().then(user => {
                if (!user) {
                    throw new UnauthorizedException('账号或密码错误')
                }
                return user
            })
        })
    }

    /** 查找并校验可用账号。 */
    public async findActiveUserRequired(uid: string): Promise<Schema.TbAccountUser> {
        return await this.database.builder(this.userRepository, async qb => {
            qb.where('t.uid = :uid', { uid })
            return await qb.getOne().then(user => {
                if (!user) {
                    throw new UnauthorizedException('账号不存在')
                }
                this.assertActiveUser(user)
                return user
            })
        })
    }

    /** 校验账号状态与在职状态。 */
    public assertActiveUser(user: Schema.TbAccountUser): void {
        if (user.status !== Schema.TbAccountUserStatus.ENABLED) {
            throw new UnauthorizedException('账号已禁用')
        }
        if (user.employmentStatus !== Schema.TbAccountUserEmploymentStatus.EMPLOYED) {
            throw new UnauthorizedException('账号已离职')
        }
    }
}
