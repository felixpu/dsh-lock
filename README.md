# dsh-lock

给 DSH（DeepSeek Harness）网页版加一道**密码门禁**：打开页面先显示锁定界面，输入密码解锁后才能使用。

## 功能

- **全屏遮罩**：未解锁时覆盖整个界面，阻止直接操作会话
- **手动锁定**：随时一键锁定（侧边栏按钮 + 快捷键）
- **自动锁定**：可配置空闲时长后自动锁定
- **密码安全**：仅存 scrypt 单向哈希，**永不保存明文**
- **界面中英双语**：跟随 DSH 的界面语言设置实时切换（见下方「界面文案（运行时 locale）」）

## 安装

```sh
dsh plugin --profile web add github:felixpu/dsh-lock
```

安装后重启宿主进程。

## 使用

| 操作 | 方式 |
|---|---|
| 解锁 | 在锁定界面输入密码 |
| 立即锁定 | 侧边栏底部「锁定」按钮 |
| 立即锁定（快捷键） | macOS / Windows：`Ctrl/Cmd + Shift + L`；Linux：`Ctrl/Cmd + Shift + .` |
| 自动锁定时长 | 设置 → 插件 → dsh-lock |

> Linux 用 `Ctrl/Cmd + Shift + .` 而非 `Ctrl/Cmd + Shift + L`：DSH 平台的 Linux 键位白名单
> 不接受「修饰键 + 字母」，为各平台分别声明才不会被校验拒绝。

## 配置

本包不导出 `Config` schema，密码与自动锁定设置由插件自身持久化，通过「设置 → 插件 → dsh-lock」面板管理。

## 安全说明

- 密码以 **scrypt**（N=2^15, r=8, p=1）加盐哈希存储，比对使用常量时间比较
- 解锁后签发的是短期令牌，而非保存密码本身
- 存储位置在插件私有目录下，卸载插件不会把密码留在会话或配置里

> ⚠️ 这是**界面门禁**，不是磁盘加密。它防的是「别人走到你电脑前直接操作 DSH」，
> 不能防止能读取你用户目录下文件的攻击者。

## 宿主贡献

- `inject: ['webServer']`，注册解锁/锁定相关的同源路由
- 无客户端以外的外部依赖
- **不产出面向用户的自然语言**：所有路由响应只回机器可读的 `error` code
  （如 `invalid-password` / `too-many-attempts` / `locked`），由客户端字典翻译。
  宿主无从知道 UI 语言，写死中/英文都会在另一种语言下露馅。
  唯一保留自然语言的地方是宿主**日志**（`ctx.logger.info`），那是给开发者看的。

## 界面文案（运行时 locale）

界面文案走**平台官方 locale 服务**，中英双语：

```js
// client/client.js
inject: ['slots', 'shortcuts', 'locale'],
apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), NS + ': dictionaries');
  const t = ctx.locale.bind(NS);
  ctx.slots.register({ name: 'shell.overlay', id: '…', locale: NS }, Veil); // ← 渲染器据此注入 t
}
```

组件从 `props.t` 拿翻译函数，**不需要**自己 `inject: () => ({ t })` ——
槽注册选项里给了 `locale: NS`，渲染器（`@deepseek-ai/dsh-client-ui-renderer` 的
`standardKit()`）会把绑定好的 `t` 注入 props；缺 locale 插件时它会抛出明确的
`SlotAssemblyError`，而不是静默渲染出 key 名。

约定：

- 一条消息 = 一个完整句子，变量用 `{name}` 占位（如 `'autoLock.minutes': '{n} 分钟'` /
  `'{n} minutes'`）。**不拆片段拼接**，否则中英语序无法重排。
- 键名小写点分层级：`lock.title`、`field.password`、`button.unlock`、
  `error.wrongPassword`、`autoLock.minutes`。
- `retry` / `loading` / `unknown` 等平台 `common` 命名空间已有的通用词**不重复定义**，
  查表未命中会自动回落到 common。
- **zh 与 en 的键必须完全一致**：运行时不校验，漏键只会显示 key 名。故 `apply` 里
  做了一次键一致性自查，不一致时 `console.warn` 点名缺的键。
- 需要本地化的字符串**不能**只存在于源码字面量里 —— 静态审计
  （去掉注释后 grep 中文字符）应只剩注释与宿主日志。

## 展示元数据（locale）

`locale/en.json` 与 `locale/zh.json` 提供**插件展示元数据**（`meta.title` / `meta.description`），
Plugin Manager 与设置页**无需激活插件**即可读取，用于显示本地化的插件名与说明。
这与运行时 UI 文案（客户端 `ctx.locale.register`，见上一节）是**两套互不相关**的东西：
前者是 JSON 资源、由宿主按 Node 模块解析器读取；后者是客户端代码里的字典对象。

```json
{ "meta": { "title": "…", "description": "…" } }
```

⚠️ 两个容易漏的点（漏任一个都会**静默失效**，不报错）：

1. **必须在 `package.json` 的 `exports` 里导出 `./locale/*.json`** —— 宿主经 Node 模块解析器
   读取该资源，未导出的子路径会得到 `ERR_PACKAGE_PATH_NOT_EXPORTED`，被当作「没有 locale」跳过。
2. **`files` 需包含 `locale`** —— 否则 `pnpm pack` / `npm publish` 的产物里不会带上它。

`icon.svg` 走顶层 `icon` 字段（相对路径），**不需要** `exports`。

## 客户端挂载点

| 槽位 | 用途 |
|---|---|
| 全屏遮罩 | 未解锁时的锁定界面 |
| `sidebar.footer.action` | 「立即锁定」按钮 |
| `plugins.bundle.config` | 自动锁定设置面板 |

客户端 bundle 仅 `require` 平台种子表内的模块（本包只用到 `react`）。
槽位 / 快捷键 / 语言三个服务通过 `package.json` 的 `dsh.client.inject` 声明，
在插件对象 `inject: ['slots', 'shortcuts', 'locale']` 里注入 —— 服务不走 `require`。

快捷键的 `label` 用**函数**（thunk）而非字符串，语言切换后快捷键面板那一行会跟着变；
`aliases` 是快捷键面板的**搜索别名**、平台没有本地化机制，故只放英文
（官方各包一律如此），写死中文会让英文界面下露出中文。

## 许可证

MIT © felixpu

## 仓库

<https://github.com/felixpu/dsh-lock>
