# dsh-lock

给 DSH（DeepSeek Harness）网页版加一道**密码门禁**：打开页面先显示锁定界面，输入密码解锁后才能使用。

## 功能

- **全屏遮罩**：未解锁时覆盖整个界面，阻止直接操作会话
- **手动锁定**：随时一键锁定（侧边栏按钮 + 快捷键）
- **自动锁定**：可配置空闲时长后自动锁定
- **密码安全**：仅存 scrypt 单向哈希，**永不保存明文**

## 安装

```sh
dsh plugin --profile web add dsh-lock
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

## 客户端挂载点

| 槽位 | 用途 |
|---|---|
| 全屏遮罩 | 未解锁时的锁定界面 |
| `sidebar.footer.action` | 「立即锁定」按钮 |
| `plugins.bundle.config` | 自动锁定设置面板 |

客户端 bundle 仅 `require` 平台种子表内的模块（`react`、`@deepseek-ai/dsh-client-ui-primitives`）。

## 许可证

MIT © felixpu

## 仓库

<https://github.com/felixpu/dsh-lock>
