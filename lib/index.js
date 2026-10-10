/**
 * dsh-lock 宿主半身：密码门禁。
 *
 * 设计要点（详见 docs/superpowers/specs/2026-10-09-dsh-lock-design.md）：
 * - 双闸：本文件负责「数据闸」，客户端 client.js 负责「视觉闸」。
 * - 解锁状态由宿主 token 承载（非前端布尔值），自动锁定吊销全部 token，
 *   因此多标签页同时回到锁定态。
 * - 密码只做单向 scrypt 哈希，永不存明文。
 * - 零第三方依赖：只用 node: 内置模块。
 *
 * 威胁模型：防肩窥级。本机能执行命令者可删凭据文件（=重置）或绕过宿主，
 * 这是所有本地密码锁的共同边界，不是本实现的缺陷。
 *
 * ⚠️ 已确认的真实绕过路径（须在交付说明中如实告知用户）：
 * 1. 直接删除 ~/.dsh/dsh-lock/credentials.json → 锁消失（这正是刻意的重置路径）；
 * 2. 浏览器 DevTools 可摘掉前端遮罩，但数据闸仍拒绝 `/api/*`，仅剩空壳界面；
 * 3. DSH 自身的 BrowserAuth 允许用 `dsh web` 打印的 `?token=<launchToken>`
 *    链接直接获得认证并进入 DSH——本插件不拦截该链接，故持有该 URL 者可绕过密码。
 *
 * 定位：本插件是**叠加在 DSH 自带浏览器认证之上的第二道锁**，不替代它。
 * `/api/*` 请求先经 dsh-client-connection 的 admit()（Host/Origin + 签名 cookie），
 * 再到达本文件的数据闸。
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const NAME = 'dsh-lock'

/**
 * 凭据与配置的存放目录（$DSH_HOME/.dsh-lock/）。
 *
 * 路径构成说明：
 * - `$DSH_HOME`（缺省回退 ~/.dsh）是 **DSH 官方的标准变量**
 *   （见 dsh 源码 lib/bin.js：profiles 位于 `$DSH_HOME/profiles`，
 *   用户 patch 层位于 `$DSH_HOME/cordis.patch.yml`），故这里遵循该约定；
 * - `.dsh-lock` 这个**子目录名是本插件自定的** —— DSH 不提供
 *   「插件自动获得专属数据目录」的机制，插件需自行决定存放位置。
 *   用点前缀（隐藏目录）以保持 ~/.dsh 根目录整洁。
 *
 * 权限：目录 0700、文件 0600（见 writePrivate）。
 */
const LOCK_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), '.dsh-lock')
const CREDENTIALS_FILE = join(LOCK_DIR, 'credentials.json')
const SETTINGS_FILE = join(LOCK_DIR, 'settings.json')

/**
 * 历史路径（旧版本用的 `$DSH_HOME/dsh-lock/`）。
 * 仅用于一次性迁移：新路径下没有凭据、而旧路径有 → 搬到新路径，
 * 避免用户升级后「密码凭空消失变成未设密码状态」。
 */
const LEGACY_LOCK_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-lock')

/**
 * scrypt 参数：N=2^15, r=8, p=1，桌面机约 100–300ms。
 *
 * ⚠️ maxmem 必须显式给出：N=32768 时内存需求约 128*N*r = 32MB，
 * 恰好触到 Node 默认 maxmem（32MB）上限，否则抛
 * ERR_CRYPTO_INVALID_SCRYPT_PARAMS（实测踩到）。取 64MB 留余量。
 */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 }

/** 解锁 token 有效期上限（自动锁定会提前吊销）。 */
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000

/**
 * 退避策略：
 * - 前 FREE_ATTEMPTS 次失败**不**限速，只记数——用户手误可立即重输；
 * - 超过后开始限速：1s → 2s → 4s …，封顶 BACKOFF_MAX_MS，防在线爆破。
 * 这样合法用户偶尔输错不会被罚，而连续爆破会迅速撞上墙。
 */
const FREE_ATTEMPTS = 3
const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 30000

/** 自动锁定档位（分钟）。0 = 关闭。null 表示自定义值。 */
const DEFAULT_SETTINGS = { autoLockMinutes: 0 }

const scrypt = (password, salt) =>
  new Promise((resolve, reject) => {
    scryptCb(
      password,
      salt,
      SCRYPT.keylen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem },
      (err, key) => {
        if (err) reject(err)
        else resolve(key)
      },
    )
  })

/** 原子写文件并收紧权限到 0600。 */
function writePrivate(file, data) {
  mkdirSync(LOCK_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
}

/**
 * 一次性迁移旧目录 `$DSH_HOME/dsh-lock/` → `$DSH_HOME/.dsh-lock/`。
 *
 * 为什么需要：仅供版本升级场景，避免用户换路径后「密码凭空消失」，
 * 表现为突然回到未设密码状态（安全与体验都不可接受）。
 *
 * 规则（幂等、保守）：
 * - 新目录**已有** credentials.json → 什么都不做（绝不覆盖新数据）；
 * - 旧目录不存在或没有 credentials.json → 什么都不做；
 * - 否则把 credentials.json 与 settings.json 逐个搬到新目录（先写后删），
 *   任一文件失败只跳过该文件，不影响另一文件，也绝不让插件启动失败。
 */
function migrateLegacyDir() {
  try {
    if (existsSync(CREDENTIALS_FILE)) return // 新路径已有凭据：不动
    if (existsSync(LEGACY_LOCK_DIR) === false) return

    const legacyCredentials = join(LEGACY_LOCK_DIR, 'credentials.json')
    if (existsSync(legacyCredentials) === false) return // 旧目录里没有凭据：无需求

    mkdirSync(LOCK_DIR, { recursive: true, mode: 0o700 })

    const moves = [
      [legacyCredentials, CREDENTIALS_FILE],
      [join(LEGACY_LOCK_DIR, 'settings.json'), SETTINGS_FILE],
    ]
    for (const [from, to] of moves) {
      if (existsSync(from) === false || existsSync(to)) continue
      try {
        // 先以 0600 写新文件，成功后再删旧文件（失败时旧数据仍在，不会丢）。
        writeFileSync(to, readFileSync(from), { mode: 0o600 })
        unlinkSync(from)
      } catch {
        /* 单个文件迁移失败：保留旧文件，下次启动重试 */
      }
    }
  } catch {
    /* 迁移整体失败不得影响插件启动 */
  }
}

function readJson(file) {
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

function readSettings() {
  const stored = readJson(SETTINGS_FILE)
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_SETTINGS }
  const minutes = stored.autoLockMinutes
  const valid = typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0
  return { autoLockMinutes: valid ? minutes : DEFAULT_SETTINGS.autoLockMinutes }
}

/** 生成凭据记录：只在内存里短暂持有明文密码，落盘前即转为哈希。 */
async function makeCredential(password) {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt)
  return {
    version: 1,
    algo: 'scrypt',
    params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, keylen: SCRYPT.keylen, maxmem: SCRYPT.maxmem },
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
  }
}

/** 恒定时间校验，防时序侧信道。使用凭据记录自身的参数，兼容将来调参。 */
async function verify(record, password) {
  if (!record || record.algo !== 'scrypt' || !record.salt || !record.hash) return false
  const p = record.params || {}
  const expected = Buffer.from(record.hash, 'base64')
  const salt = Buffer.from(record.salt, 'base64')
  const actual = await new Promise((resolve, reject) => {
    scryptCb(
      password,
      salt,
      p.keylen || expected.length,
      {
        N: p.N || SCRYPT.N,
        r: p.r || SCRYPT.r,
        p: p.p || SCRYPT.p,
        maxmem: p.maxmem || SCRYPT.maxmem,
      },
      (err, key) => (err ? reject(err) : resolve(key)),
    )
  })
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

/** 读取响应体（带大小上限，防超大请求打爆内存）。 */
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

export const name = NAME
export const inject = ['webServer']

/**
 * 配置 schema：本插件当前无用户配置项（自动锁定档位存在独立设置文件中，
 * 由客户端经同源路由读写，不走插件行配置）。
 */
export const Config = undefined

export function apply(ctx) {
  // 一次性迁移：旧路径 → 新路径。必须在读取凭据之前执行。
  migrateLegacyDir()

  /** 解锁 token 表：token → 过期时刻。 */
  const tokens = new Map()
  let failures = 0
  let blockedUntil = 0
  /** 应用级设置对象的可写引用（惰性读取）。 */
  let settings = readSettings()
  /** 内存中的凭据缓存；凭据文件被外部删除时需重新读取。 */
  let cachedCredential = readJson(CREDENTIALS_FILE)

  const tokenOf = (req) => {
    const cookie = req.headers?.cookie
    if (!cookie) return undefined
    for (const part of cookie.split(';')) {
      const [key, ...rest] = part.trim().split('=')
      if (key === 'dsh_lock_token') return decodeURIComponent(rest.join('='))
    }
    return undefined
  }

  const isValidToken = (req) => {
    const token = tokenOf(req)
    if (!token) return false
    const expires = tokens.get(token)
    if (expires === undefined) return false
    if (Date.now() > expires) {
      tokens.delete(token)
      return false
    }
    return true
  }

  /** 是否已设密码（未设密码 = 插件惰性，不做任何拦截）。 */
  const configured = () => cachedCredential !== undefined

  /** 当前是否需要拦截：已设密码且请求未持有有效 token。 */
  const shouldGate = (req) => configured() && !isValidToken(req)

  const revokeAll = () => tokens.clear()

  const issueToken = (res) => {
    const token = randomBytes(32).toString('base64url')
    tokens.set(token, Date.now() + TOKEN_TTL_MS)
    res.setHeader(
      'set-cookie',
      `dsh_lock_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`,
    )
    return token
  }

  /**
   * 数据闸：挂在 `/api` 前缀的 RPC/Fetch 统一入口上（由 dsh-client-connection
   * 的 prefix route 在 Host/Origin 校验之后触发）。
   *
   * 关键事实（读 dsh-client-connection 源码确认）：
   * - 该水闸只在 `/api` 路径上触发，所有会话数据都经此处；
   * - 静态资源、`/`、`/index.html` 由 fallback handler 处理，**不经过这里**，
   *   所以无需（也无法）在此放行它们；
   * - 解锁路由位于 `/api/dsh-lock/*`，必须放行，否则形成死锁。
   */
  ctx.on('connection/request', async (req, res, next) => {
    // 未设密码 → 完全惰性。
    if (!configured()) return next()

    const path = (req.url || '/').split('?')[0]
    // 唯一白名单：本插件自己的接口（含解锁本身，防死锁）。
    if (path === '/api/dsh-lock' || path.startsWith('/api/dsh-lock/')) return next()

    if (shouldGate(req)) {
      sendJson(res, 401, { error: 'locked', message: 'DSH is locked.' })
      return
    }
    return next()
  })

  /**
   * 路由注册辅助：收集 disposer，供卸载时统一释放。
   *
   * ⚠️ 必须走 ctx.effect —— 裸调 ctx.webServer.register 的返回值被丢弃后，
   * 插件卸载（HMR 禁用/启用、配置变更重载）不会撤销路由，下次 apply 注册
   * 同一路径即抛 `webserver: duplicate exact route`（实测踩到，
   * application: failed）。见文件末尾的清理 effect。
   */
  const registered = []
  const route = (path, handler) => {
    registered.push(ctx.webServer.register({ kind: 'exact', path, handler }))
  }

  /** 暴露锁定状态（客户端据此决定是否挂遮罩）。 */
  route('/api/dsh-lock/status', async (req, res) => {
    cachedCredential = readJson(CREDENTIALS_FILE)
    sendJson(res, 200, {
      configured: configured(),
      unlocked: isValidToken(req),
      autoLockMinutes: readSettings().autoLockMinutes,
    })
  })

  /** 首次设密码（仅在未设密码时可用）。 */
  route('/api/dsh-lock/setup', async (req, res) => {
    cachedCredential = readJson(CREDENTIALS_FILE)
    if (configured()) {
      sendJson(res, 409, { error: 'already-configured' })
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    let password
    try {
      password = JSON.parse(await readBody(req)).password
    } catch {
      sendJson(res, 400, { error: 'bad-request' })
      return
    }
    if (typeof password !== 'string' || password.length < 4) {
      sendJson(res, 400, { error: 'password-too-short', minLength: 4 })
      return
    }
    cachedCredential = await makeCredential(password)
    writePrivate(CREDENTIALS_FILE, cachedCredential)
    issueToken(res)
    sendJson(res, 200, { ok: true })
  })

  /** 解锁。 */
  route('/api/dsh-lock/unlock', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    cachedCredential = readJson(CREDENTIALS_FILE)
    if (!configured()) {
      sendJson(res, 200, { ok: true, configured: false })
      return
    }
    const now = Date.now()
    if (now < blockedUntil) {
      sendJson(res, 429, { error: 'too-many-attempts', retryInMs: blockedUntil - now })
      return
    }
    let password
    try {
      password = JSON.parse(await readBody(req)).password
    } catch {
      sendJson(res, 400, { error: 'bad-request' })
      return
    }
    const ok = typeof password === 'string' && (await verify(cachedCredential, password))
    if (!ok) {
      failures += 1
      // 只有超过免罚次数后才开始限速。
      blockedUntil =
        failures > FREE_ATTEMPTS
          ? Date.now() + Math.min(BACKOFF_BASE_MS * 2 ** (failures - FREE_ATTEMPTS - 1), BACKOFF_MAX_MS)
          : 0
      sendJson(res, 401, { error: 'invalid-password', attempts: failures })
      return
    }
    failures = 0
    blockedUntil = 0
    issueToken(res)
    sendJson(res, 200, { ok: true })
  })

  /** 手动/自动锁定：吊销全部 token，所有标签页同时回到锁定态。 */
  route('/api/dsh-lock/lock', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    revokeAll()
    res.setHeader('set-cookie', 'dsh_lock_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
    sendJson(res, 200, { ok: true })
  })

  /** 自动锁定档位读写（设置页使用）。 */
  route('/api/dsh-lock/settings', async (req, res) => {
    if (req.method === 'GET') {
      sendJson(res, 200, readSettings())
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    let minutes
    try {
      minutes = JSON.parse(await readBody(req)).autoLockMinutes
    } catch {
      sendJson(res, 400, { error: 'bad-request' })
      return
    }
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) {
      sendJson(res, 400, { error: 'invalid-value' })
      return
    }
    settings = { autoLockMinutes: Math.floor(minutes) }
    writePrivate(SETTINGS_FILE, settings)
    sendJson(res, 200, settings)
  })

  /**
   * 改密码：需持有有效 token（已解锁）或用旧密码。
   */
  route('/api/dsh-lock/change', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    cachedCredential = readJson(CREDENTIALS_FILE)
    if (!configured()) {
      sendJson(res, 409, { error: 'not-configured' })
      return
    }
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { error: 'bad-request' })
      return
    }
    // 未解锁时必须提供旧密码；已解锁则允许直接改。
    if (!isValidToken(req)) {
      const okOld =
        typeof body.currentPassword === 'string' && (await verify(cachedCredential, body.currentPassword))
      if (!okOld) {
        sendJson(res, 401, { error: 'invalid-password' })
        return
      }
    }
    if (typeof body.newPassword !== 'string' || body.newPassword.length < 4) {
      sendJson(res, 400, { error: 'password-too-short', minLength: 4 })
      return
    }
    cachedCredential = await makeCredential(body.newPassword)
    writePrivate(CREDENTIALS_FILE, cachedCredential)
    // 改密码后吊销所有既有会话，强制各处重新解锁。
    revokeAll()
    issueToken(res)
    sendJson(res, 200, { ok: true })
  })

  /**
   * 重置（删除凭据文件 = 恢复未设密码状态）。
   * 刻意不要求密码——这是本机用户的自我救援路径，与威胁模型一致。
   */
  route('/api/dsh-lock/reset', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    // 需已解锁才能重置，避免任何人打开页面就能把锁拆掉。
    if (configured() && !isValidToken(req)) {
      sendJson(res, 401, { error: 'locked' })
      return
    }
    if (existsSync(CREDENTIALS_FILE)) unlinkSync(CREDENTIALS_FILE)
    cachedCredential = undefined
    revokeAll()
    sendJson(res, 200, { ok: true, configured: false })
  })

  ctx.logger?.info?.(`[${NAME}] 凭据文件：${CREDENTIALS_FILE}`)

  // 卸载时清理：撤销全部路由 + 清空内存态。
  // 路由必须在此撤销，否则 HMR 重新 apply 会撞 duplicate route。
  ctx.effect(() => () => {
    while (registered.length > 0) {
      const dispose = registered.pop()
      try {
        dispose()
      } catch {
        /* 已被撤销：忽略 */
      }
    }
    tokens.clear()
  })
}
