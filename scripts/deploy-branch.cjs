const { execFileSync, spawnSync } = require('node:child_process')

/**
 * 一步完成发布：把当前分支合并到 main，并把当前分支快进到 main。
 *
 * 发布动作拆成三步：推送当前分支、通过 PR 合并到 main、再把当前分支快进到 main。
 * 第三步是必须的：GitHub 的 Merge commit 会在 main 上新建一条合并提交，
 * 当前分支指针不会移动，不快进就会一直显示 behind，其他设备同步不到最新代码。
 */

const MAIN_BRANCH = 'main'

/** Windows 下 gh 是 .cmd，需要走 shell 才能找到；参数带空格时不能用 shell 拼接，因此这里解析出真实可执行文件路径。 */
function resolveCommand(command) {
    if (process.platform !== 'win32' || command !== 'gh') {
        return command
    }
    try {
        const found = execFileSync('where.exe', ['gh'], { encoding: 'utf8' })
            .split(/\r?\n/)
            .map(item => item.trim())
            .filter(Boolean)
        return found.find(item => item.toLowerCase().endsWith('.exe')) ?? found[0] ?? command
    } catch {
        return command
    }
}

/** 执行命令并返回标准输出。 */
function run(command, args) {
    return execFileSync(resolveCommand(command), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** 执行命令并直接输出到终端。参数不经过 shell，避免带空格的标题被拆成多个参数。 */
function runInherit(command, args) {
    const result = spawnSync(resolveCommand(command), args, { stdio: 'inherit' })
    if (result.error) {
        throw result.error
    }
    if (result.status !== 0) {
        throw new Error(`命令执行失败：${command} ${args.join(' ')}`)
    }
}

/** 当前分支名称。 */
function currentBranch() {
    return run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
}

/** 工作区是否存在未提交改动。 */
function hasLocalChanges() {
    return run('git', ['status', '--porcelain']).length > 0
}

/** 统计两个提交之间的提交数量。 */
function countCommits(range) {
    return Number(run('git', ['rev-list', '--count', range]))
}

/** 读取当前分支已存在的待合并 PR 编号。 */
function findOpenPullRequest(branch) {
    const output = run('gh', ['pr', 'list', '--base', MAIN_BRANCH, '--head', branch, '--state', 'open', '--json', 'number'])
    const list = JSON.parse(output || '[]')
    return list.length > 0 ? list[0].number : undefined
}

/** 创建发布 PR 并返回编号。 */
function createPullRequest(branch, title) {
    runInherit('gh', ['pr', 'create', '--base', MAIN_BRANCH, '--head', branch, '--title', title, '--body', title])
    const number = findOpenPullRequest(branch)
    if (!number) {
        throw new Error('创建 PR 后未能读取到编号，请在 GitHub 上确认后重试')
    }
    return number
}

function main() {
    const branch = currentBranch()
    if (branch === MAIN_BRANCH) {
        throw new Error(`当前已在 ${MAIN_BRANCH} 分支，发布必须在业务分支上执行`)
    }
    if (hasLocalChanges()) {
        throw new Error('工作区存在未提交改动，请先提交后再发布')
    }

    console.log(`[1/4] 推送 ${branch} 到远端`)
    runInherit('git', ['push', 'origin', branch])

    console.log(`[2/4] 检查 ${branch} 与 ${MAIN_BRANCH} 的差异`)
    runInherit('git', ['fetch', 'origin', MAIN_BRANCH, branch])
    const ahead = countCommits(`origin/${MAIN_BRANCH}..origin/${branch}`)

    if (ahead === 0) {
        console.log(`${branch} 没有需要发布的提交，跳过合并`)
    } else {
        console.log(`[3/4] ${branch} 有 ${ahead} 个提交待发布，合并到 ${MAIN_BRANCH}`)
        const existing = findOpenPullRequest(branch)
        const number = existing ?? createPullRequest(branch, `release: ${branch} 合并到 ${MAIN_BRANCH}`)
        console.log(`合并 PR #${number}`)
        runInherit('gh', ['pr', 'merge', String(number), '--merge', '--delete-branch=false'])
        runInherit('git', ['fetch', 'origin', MAIN_BRANCH])
    }

    console.log(`[4/4] 把 ${branch} 快进到 ${MAIN_BRANCH}`)
    const behind = countCommits(`${branch}..origin/${MAIN_BRANCH}`)
    if (behind === 0) {
        console.log(`${branch} 已与 ${MAIN_BRANCH} 保持一致`)
        return
    }
    runInherit('git', ['merge', '--ff-only', `origin/${MAIN_BRANCH}`])
    runInherit('git', ['push', 'origin', branch])
    console.log(`发布完成：${branch} 与 ${MAIN_BRANCH} 已一致`)
}

try {
    main()
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
}
