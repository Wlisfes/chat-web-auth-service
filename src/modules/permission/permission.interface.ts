export interface EffectiveDataScope {
    all: boolean
    includeSelf: boolean
    organizationKeyIds: number[]
}

export interface EffectiveAccess {
    superAdmin: boolean
    roleCodes: string[]
    permissionCodes: string[]
    menuTree: unknown[]
}
