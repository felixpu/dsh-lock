// dsh-lock —— 密码门禁的**浏览器半身**（视觉闸 + 锁定控制）。
//
// 形态照官方模板 `cordis-plugin-development/templates/decoration/client.js`：
// 一个 `__ModuleLoader__.load({ id, factory })`，factory 里 `return` 插件对象。
//
// ⚠️ 只允许 require 平台种子表内的模块。本文件只用 react；槽位 / 快捷键 /
//    语言三个服务走 package.json 里 `dsh.client.inject` 声明的
//    "@deepseek-ai/dsh-client-ui-slots" / "@deepseek-ai/dsh-client-shortcuts" /
//    "@deepseek-ai/dsh-client-locale"。
//
// 契约来源（均经 cordis_inspect_query 实时核对，非猜测）：
//
// 1) 视觉闸 = `shell.overlay` 槽（kind=list, scope=root），官方 catalog 明确
//    指定该槽用于「floats over the whole app」的浮层，默认 click-through，
//    条目需自行 opt-in pointer events —— 正是全屏遮罩的用途。
//    ⚠️ 不可注册 `root`：官方明令 "DO NOT register here"，会顶掉整个 AppFrame。
//
// 2) 手动锁定入口 = `sidebar.footer.action` 槽（kind=list, scope=root，
//    ownerProps `{ wide }`），官方定位 "Optional actions beside Settings"，
//    已有 `cordis-panel` 先例。选它而非会话标题栏：锁定是**全局动作**，
//    放会话槽会在无会话时消失。
//
// 3) 自动锁定设置 = `plugins.bundle.config` 槽（kind=keyed, scope=root），
//    key = **包名**；ownerProps `{ view, form }`。该槽官方定位是
//    "rendered on the bundle's page between its description and its rows"，
//    即点进插件页直接可见（原先误用 plugins.row.config，需二次点击）。
//
// 4) 主题 token 只用 Theme.listTokens 实报的 14 个别名 token，明暗自动切换。
//
// 5) 界面文案中英双语走**平台官方 locale 服务**（`ctx.locale.register(NS, {zh, en})`
//    + `ctx.locale.bind(NS)`），与官方插件同一套机制。组件不自己接 locale ——
//    在 `ctx.slots.register` 的选项里给 `locale: NS`，渲染器（standardKit）会把
//    绑定好的 `t` 作为 props 注入组件
//    （契约：@deepseek-ai/dsh-client-ui-renderer/lib/client.js 的 localeSeat /
//      `kit["t"] = localeSeat(face, entry.locale)`；
//      未装 locale 插件时它会抛 SlotAssemblyError，而不是静默渲染 key）。
//    故组件签名统一 `function X(props){ var t = props.t; }`，
//    **不要**再写 `inject: () => ({ t })` —— 冗余，且会掩盖 locale 缺失的明确报错。
//
// 6) 宿主只回机器可读 code，不回面向用户的自然语言（见 lib/index.js）。
window.__ModuleLoader__.load({
  id: 'dsh-lock',
  factory(require) {
    var React = require('react');
    var h = React.createElement;
    // Tooltip 来自种子表内的 @deepseek-ai/dsh-client-ui-primitives（允许 require）。
    // 它的 shortcutKeys 参数会把键位渲染成**平台格式化的键帽**并放进气泡 ——
    // 这正是「设置」那一行按钮的做法（平时不显示，悬停才浮出 ⇧⌘,）。
    var primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    var Tooltip = primitives && primitives.Tooltip;

    var API = '/api/dsh-lock';

    var CSS = [
      // ---- 遮罩（视觉闸）----
      '.dlk-veil{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;',
      'background:var(--dsw-alias-bg-base);pointer-events:auto;padding:24px}',
      '.dlk-card{width:100%;max-width:352px;display:flex;flex-direction:column;gap:14px;padding:26px 24px;border-radius:16px;',
      'border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
      '.dlk-mark{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);margin:0 auto}',
      '.dlk-title{margin:0;font-size:17px;line-height:26px;font-weight:600;text-align:center;color:var(--dsw-alias-label-primary)}',
      '.dlk-sub{margin:0;font-size:12px;line-height:18px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.dlk-input{font:inherit;font-size:14px;width:100%;padding:10px 12px;border-radius:10px;box-sizing:border-box;',
      'border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dlk-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
      // ---- 密码显示切换（输入框内的眼睛按钮）----
      // 容器负责定位，输入框右侧留出图标位置，避免文字被图标压住。
      '.dlk-pw{position:relative;display:flex;align-items:center;width:100%}',
      '.dlk-pw .dlk-input{padding-right:40px}',
      '.dlk-eye{position:absolute;right:6px;display:inline-flex;align-items:center;justify-content:center;',
      'width:28px;height:28px;padding:0;border:none;border-radius:8px;background:transparent;cursor:pointer;',
      'color:var(--dsw-alias-label-secondary)}',
      '.dlk-eye:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.dlk-eye:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dlk-eye:disabled{opacity:.5;cursor:default}',
      '.dlk-btn{font:inherit;font-size:13px;font-weight:500;padding:10px 14px;border-radius:10px;cursor:pointer;',
      'border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dlk-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}',
      '.dlk-btn:disabled{opacity:.55;cursor:default}',
      '.dlk-btn-block{width:100%}',
      '.dlk-err{margin:0;font-size:12px;line-height:18px;text-align:center;color:var(--dsw-alias-state-error-primary)}',
      '.dlk-hint{margin:0;font-size:11px;line-height:17px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      // ---- 侧栏底部锁定按钮（严格对齐官方 sidebar.settings 触发器）----
      // 官方样式实测来源：dsh-client-ui-settings-general 的 .VOzbGW_triggerRow/.trigger：
      //   triggerRow: gap:8px; width:calc(100% + 4px); margin:4px -2px
      //   trigger:    height:42px; border-radius:var(--dsw-radius-md); padding:0 10px 0 8px;
      //               font-size:14px; line-height:22px; gap:8px; color:label-primary
      '.dlk-foot-row{flex:none;align-items:center;gap:8px;width:calc(100% + 4px);margin:4px -2px;display:flex;position:relative}',
      '.dlk-foot{box-sizing:border-box;border-radius:var(--dsw-radius-md);cursor:pointer;width:auto;min-width:0;height:42px;',
      'color:var(--dsw-alias-label-primary);background:0 0;border:none;flex:1;align-items:center;gap:8px;margin:0;',
      'padding:0 10px 0 8px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden}',
      // hover 用官方 token：--dsw-alias-interactive-bg-hover。
      // 实测该 token 定义于主题层（浅 #2631480f / 深 #ffffff14），被
      // dsh-client-ui-settings-general 等 8+ 官方 UI 包共用；
      // 原先误用 --dsw-alias-bg-layer-2，故底色比「设置」浅。
      // ⚠️ 它不在 Theme.listTokens 的 14 项公开清单里，但确为平台真实变量。
      '.dlk-foot:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dlk-foot-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1;text-align:left}',
      // 键帽样式已移除：改由官方 Tooltip 的 shortcutKeys 渲染
      // （平台自带 ShortcutKeys 样式），不再自己画 kbd。
      '.dlk-foot-rail{width:36px;height:36px;padding:0;justify-content:center;flex:none}',
      // ---- 设置页 ----
      '.dlk-cfg{display:flex;flex-direction:column;gap:12px;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.dlk-cfg-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.dlk-cfg-label{font-size:13px;font-weight:500}',
      '.dlk-select{font:inherit;font-size:13px;padding:6px 10px;border-radius:8px;',
      'border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.dlk-input-num{width:96px;flex:none}',
      '.dlk-note{margin:0;font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary)}',
      '.dlk-ok{font-size:11px;color:var(--dsw-alias-state-success-primary)}',
    ].join('');

    // ---- 文案字典（平台官方 locale 服务；中英双语必须成对）----
    //
    // 走官方 locale 服务（`ctx.locale.register(NS, { zh, en })` + `bind`），
    // 与官方插件同一套机制。语言切换时插槽里的文案会**实时**跟着变 ——
    // 渲染器按字典 revision 重新注入 `t`（见 `localeSeat` 的缓存键）。
    //
    // ⚠️ 命名空间用**包名**，绝不复用官方或他人的命名空间：同名会撞
    //    （重复 `(ns, locale)` 注册直接抛错）。
    //
    // ⚠️ 以下键**刻意不定义**，直接复用平台 `common` 字典（本命名空间未命中后
    //    自动回落到 common）：`retry` / `loading` / `unknown`。
    //    自己再写一遍会与平台文案不一致（common 的 retry 是「重试」/Retry）。
    //
    // ⚠️ 每条都是**一个完整句子**，变量用 `{name}` 占位（Translate 按
    //    /\{(\w+)\}/g 替换）。不要拆成片段再拼接 —— 中英语序不同
    //    （"{n} minutes" vs 「{n} 分钟」），拼接式无法重排。
    //
    // ⚠️ 运行时 register **不检查**两种语言是否都给全：漏键不报错，只会显示 key
    //    本身。故两份字典的键必须由我们自己保证一致（见 apply 里的键一致性自查）。
    var NS = 'dsh-lock';
    var zh = {
      'lock.title': 'DSH 已锁定',
      'lock.sub': '请输入密码继续',
      'setup.title': '设置访问密码',
      'setup.sub': '设置后，打开界面需要输入密码才能使用',
      'field.password': '密码',
      'field.passwordNew': '设置密码（至少 4 位）',
      'field.passwordRepeat': '再次输入密码',
      'field.showPassword': '显示密码',
      'field.hidePassword': '隐藏密码',
      'button.unlock': '解锁',
      'button.setup': '设置并继续',
      'button.skip': '暂不设置',
      'button.lock': '锁定',
      'error.wrongPassword': '密码不正确',
      'error.passwordMismatch': '两次输入的密码不一致',
      'error.passwordTooShort': '密码至少 4 位',
      'error.throttled': '尝试次数过多，请稍后再试',
      'error.failed': '操作失败，请重试',
      'error.unreachable': '无法连接 DSH 宿主，请确认服务正在运行后刷新页面。',
      'error.hostUnavailableTitle': 'DSH 暂时无法访问',
      'hint.credentials': '密码经 scrypt 单向哈希存储，忘记密码可删除 $DSH_HOME/{path} 后重启 DSH。',
      'autoLock.label': '自动锁定',
      'autoLock.note': '无操作达到指定时长后自动锁定。默认关闭；锁定时长任务不会中断。',
      'autoLock.saved': '已保存',
      'autoLock.minutes': '{n} 分钟',
      'autoLock.off': '关闭',
      'autoLock.custom': '自定义',
      'autoLock.customPlaceholder': '分钟',
    };
    var en = {
      'lock.title': 'DSH is locked',
      'lock.sub': 'Enter your password to continue',
      'setup.title': 'Set an access password',
      'setup.sub': 'Once set, opening the interface requires this password.',
      'field.password': 'Password',
      'field.passwordNew': 'Set a password (at least 4 characters)',
      'field.passwordRepeat': 'Enter the password again',
      'field.showPassword': 'Show password',
      'field.hidePassword': 'Hide password',
      'button.unlock': 'Unlock',
      'button.setup': 'Set and continue',
      'button.skip': 'Not now',
      'button.lock': 'Lock',
      'error.wrongPassword': 'Incorrect password',
      'error.passwordMismatch': 'The two passwords do not match',
      'error.passwordTooShort': 'The password must be at least 4 characters',
      'error.throttled': 'Too many attempts. Please try again later.',
      'error.failed': 'Something went wrong. Please try again.',
      'error.unreachable': 'Cannot reach the DSH host. Make sure the service is running, then refresh the page.',
      'error.hostUnavailableTitle': 'DSH is temporarily unavailable',
      'hint.credentials': 'The password is stored as a one-way scrypt hash. If you forget it, delete $DSH_HOME/{path} and restart DSH.',
      'autoLock.label': 'Auto-lock',
      'autoLock.note': 'Locks after the specified period of inactivity. Off by default; locking does not interrupt a running task.',
      'autoLock.saved': 'Saved',
      'autoLock.minutes': '{n} minutes',
      'autoLock.off': 'Off',
      'autoLock.custom': 'Custom',
      'autoLock.customPlaceholder': 'Minutes',
    };

    // ---------------------------------------------------------------------
    // 状态：解锁与否由宿主 token 决定，本模块只缓存「是否需要挂遮罩」。
    // 多标签页一致性由宿主吊销 token 实现，此处不做跨页同步。
    // ---------------------------------------------------------------------
    // 快捷键的**平台判定与键帽文案**。
    //
    // ⚠️ 必须与下方注册用的 LOCK_DEFAULTS 保持一致，否则会出现
    //    「提示显示 ⇧⌘L，实际绑定 ⇧⌘.」这类不一致。
    //    判定依据：linux 不支持「修饰键+字母」，故回退到标点键。
    var IS_MAC = /Mac|iPhone|iPad|iPod/.test(
      (typeof navigator !== 'undefined' && (navigator.platform || navigator.userAgent)) || '',
    );
    var IS_LINUX = /Linux|X11/.test(
      (typeof navigator !== 'undefined' && (navigator.platform || navigator.userAgent)) || '',
    );
    /** 主修饰键的键帽：mac 用 ⌘，其他用 Ctrl。 */
    var KEYCAP_PRIMARY = IS_MAC ? '\u2318' : 'Ctrl';
    var KEYCAP_SHIFT = IS_MAC ? '\u21E7' : 'Shift';
    /** 末位键：linux 用 ⌘⇧.（字母键在 linux 被平台拒绝），其余用 ⇧⌘L。 */
    var KEYCAP_LAST = IS_LINUX ? '.' : 'L';
    /**
     * 按钮 title / aria 用的快捷键描述文本（如 "⇧⌘L"）。
     * 这是**回退值** —— 真实键帽优先从平台 catalog 读取（见 useShortcutKeys），
     * 只有取不到时才用它。
     */
    var SHORTCUT_TEXT = IS_MAC
      ? KEYCAP_SHIFT + KEYCAP_PRIMARY + KEYCAP_LAST
      : KEYCAP_PRIMARY + '+' + KEYCAP_SHIFT + '+' + KEYCAP_LAST;

    /** 本插件注册的快捷键命令 id（必须与下方 register 的 id 一致）。 */
    var SHORTCUT_ID = 'dsh-lock.lock';

    // ---------------------------------------------------------------------
    // 实时键帽：从平台 catalog 读取，而非用上面写死的常量。
    //
    // 为什么必须这样（实测问题）：
    //   用户可在「设置 → 通用 → 快捷键」里改键位。写死的键帽不会跟着变，
    //   侧栏按钮就会显示**与实际绑定不符**的提示 —— 比不显示更糟。
    //
    // 契约来源：dsh-client-shortcuts 的 `ShortcutRegistry.catalog`（SnapshotStore）：
    //   `getSnapshot()` → ShortcutCatalogEntry[]，每行的 `keys` 是平台**已按
    //   当前平台 + 用户改键格式化好的键帽数组**（如 ['⇧','⌘','L']；未绑定为 []）；
    //   `subscribe()` 在绑定变化时回调。行内另有 aria/modified/conflicts/issue。
    //
    // 状态放模块级（非组件内）：侧栏按钮与锁屏都可能用；订阅属 apply 生命周期。
    var shortcutKeys = null; // string[] | null；null = 尚未取到 → 用回退值
    var shortcutSubscribers = new Set();

    function setShortcutKeys(next) {
      shortcutKeys = next;
      shortcutSubscribers.forEach(function (fn) {
        try {
          fn();
        } catch (err) {
          /* 单个订阅者异常不影响其他 */
        }
      });
    }

    function subscribeShortcutKeys(fn) {
      shortcutSubscribers.add(fn);
      return function () {
        shortcutSubscribers.delete(fn);
      };
    }

    /** 组件用：当前应显示的键帽数组（取不到时回退写死常量）。 */
    function useShortcutKeys() {
      var pair = React.useState(shortcutKeys);
      React.useEffect(function () {
        // 订阅后立即同步一次，避免「订阅前已更新」造成的空窗。
        pair[1](shortcutKeys);
        return subscribeShortcutKeys(function () {
          pair[1](shortcutKeys);
        });
      }, []);
      return pair[0];
    }

    /** 回退键帽（平台 catalog 不可用时）。 */
    function fallbackKeys() {
      return [KEYCAP_SHIFT, KEYCAP_PRIMARY, KEYCAP_LAST];
    }

    /**
     * 从平台 catalog 取出本命令的键帽并订阅其变化。
     * 任何失败都只退回写死常量，绝不影响插件本体。
     */
    function watchShortcutKeys(ctx) {
      try {
        var sc = ctx && ctx.shortcuts;
        var catalog = sc && sc.catalog;
        if (!catalog || typeof catalog.getSnapshot !== 'function') return;

        var read = function () {
          try {
            var rows = catalog.getSnapshot() || [];
            for (var i = 0; i < rows.length; i++) {
              var row = rows[i];
              if (row && row.id === SHORTCUT_ID) {
                // keys 为 [] 表示该命令当前无绑定（用户清除了键位）——
                // 这也是实况，应如实反映，不能回退成假键帽。
                setShortcutKeys(Array.isArray(row.keys) ? row.keys.slice() : []);
                return;
              }
            }
            setShortcutKeys([]);
          } catch (err) {
            /* 读取失败：保持原值 */
          }
        };

        read();
        if (typeof catalog.subscribe === 'function') {
          var dispose = catalog.subscribe(read);
          ctx.effect(function () {
            return function () {
              try {
                if (typeof dispose === 'function') dispose();
              } catch (err) {
                /* 清理失败不影响卸载 */
              }
            };
          }, 'dsh-lock: shortcut keys subscription');
        }
      } catch (err) {
        /* 服务形态不符：退回写死常量 */
      }
    }

    // ---------------------------------------------------------------------
    // 插件 ctx 的模块级引用（apply 时赋值）。
    // 组件（Veil 等）拿不到 ctx，但解锁成功时要触发平台重连，让平台自己重建数据。
    var ctxRef = null;

    /**
     * 通知平台「现在可以拉数据了」——解锁成功后调用。
     *
     * ⚠️ 这里经历过一次**错误修复**，务必不要退回旧写法（源码逐条核对过）：
     *
     * 【曾经的错误做法】`ctx.emit('connection/reset')`。
     *   看起来对：该事件确实由 dsh-api-gateway 在 onConnected 时发出，
     *   且 workspace / skill / model-selection 等模块监听它。
     *   但它**对会话列表完全无效** —— 实测解锁后发出的一堆请求里
     *   唯独没有 `/api/session/list`，会话列表因此始终为空
     *   （刷新页面才正常，因为刷新会重建整个客户端 ctx）。
     *
     * 【为什么无效】真正的数据重拉由「连接代际（generation）」驱动，不是事件：
     *   - `publishGeneration`（dsh-client-connection/lib/client.js）维护
     *     **独立的 generationListeners**，与 ctx.emit 的订阅者是两套东西；
     *   - 会话控制器订阅的是**代际**：
     *     `ctx.effect(() => connection.generation.subscribe(connected), …)`
     *     （dsh-api-session-controller/lib/types/client/index.js:50）；
     *   - `connected()` 里调用的 `handleConnected()`（同包 lib/client.js）才是
     *     真正清空并重拉会话列表的动作 —— 它会 `listInflight = null` 解掉
     *     去重闸，然后 `refreshList()`；
     *   - **emit 事件不会改变 generation 快照**，所以代际订阅者一次都不会被
     *     重新调用，inflight 永远挂着锁定期的 401 失败 → 列表永久为空。
     *
     * 【宿主重启 vs 刷新页面的分水岭】
     *   - 刷新页面：浏览器 ctx 全新重建，代际在解锁**之后**才建立，
     *     `connected()` 天然跑在解锁后 → 正常（这也是 emit 看似有效的原因）；
     *   - 宿主重启：页面没刷新，旧 ctx 存活，代际早在**遮罩还在时**就建好了、
     *     且 `connected()` 已带着 401 失败跑过一轮，此后无人再触发它。
     *
     * 【正确做法】调用官方 `connection.reconnect()`：
     *   - 它会 `emitState("connecting")` → `publishGeneration(undefined)`
     *     （代际先变空），再中止当前连接并重连，重连成功后
     *     `publishGeneration(新代际)` → 所有代际订阅者被重新调用
     *     → `handleConnected()` 清 inflight 并重拉数据；
     *   - 同时平台自己会 emit `connection/reset`，所以事件订阅者也一并覆盖；
     *   - 换句话说：**让平台自己重建代际，不要自己冒充那个信号。**
     *
     * 容错：全程 try/catch；reconnect 不可用时退回 emit 事件（对 workspace /
     *   skill / model-selection 等仍有效），最坏情况才是「需手动刷新」。
     *   任何失败都不影响解锁本身。
     */
    function notifyPlatformReady() {
      try {
        var connection =
          ctxRef && typeof ctxRef.get === 'function' ? ctxRef.get('connection') : undefined;
        if (connection && typeof connection.reconnect === 'function') {
          // 立即执行，不延后：代际重建越早，平台越早开始重拉。
          connection.reconnect();
          return;
        }
      } catch (err) {
        /* 取不到服务或调用失败 → 落到下面的兜底 */
      }
      // 兜底：至少广播事件（对部分模块有效）。即使这里也失败，
      // 最坏结果只是需要用户手动刷新页面。
      try {
        if (ctxRef && typeof ctxRef.emit === 'function') {
          ctxRef.emit('connection/reset');
        }
      } catch (err) {
        /* 同上：不影响解锁结果 */
      }
    }

    var listeners = new Set();
    var state = {
      ready: false, // 是否已从宿主取到状态
      configured: false, // 是否已设密码
      locked: true, // 是否需要显示遮罩
      // 用户是否已明确「暂不设置」——来自宿主持久化，非会话内临时状态。
      setupDismissed: false,
      // 本次会话是否从侧栏按钮手动拉起了引导（不落盘，刷新即失效）。
      guideForced: false,
      // 凭据文件相对路径（$DSH_HOME 之下），由宿主下发，用于提示文案。
      credentialsPath: '',
      unreachable: 0, // 0=正常；-1=网络不可达；其他=宿主 HTTP 状态码
    };

    function setState(patch) {
      state = Object.assign({}, state, patch);
      listeners.forEach(function (fn) {
        fn(state);
      });
    }

    function subscribe(fn) {
      listeners.add(fn);
      return function () {
        listeners.delete(fn);
      };
    }

    function useLockState() {
      var pair = React.useState(state);
      React.useEffect(function () {
        return subscribe(function (next) {
          pair[1](next);
        });
      }, []);
      return pair[0];
    }

    async function request(path, options) {
      var res = await fetch(API + path, Object.assign({ credentials: 'same-origin' }, options || {}));
      if (res.status === 401) return { error: 'invalid-password' };
      if (res.status === 429) {
        var body = await res.json().catch(function () {
          return {};
        });
        return { error: 'throttled', retryInMs: body.retryInMs };
      }
      if (!res.ok) return { error: 'failed' };
      return res.json().catch(function () {
        return { ok: true };
      });
    }

    /** 从宿主同步锁定状态（页面加载、锁定/解锁后调用）。 */
    async function syncState() {
      try {
        var res = await fetch(API + '/status', { credentials: 'same-origin' });
        if (!res.ok) {
          // 宿主可达但拒绝（如 DSH 自身认证过期）→ 保持遮罩并说明原因。
          setState({ ready: true, locked: true, unreachable: res.status });
          return undefined;
        }
        var data = await res.json();
        var configured = !!data.configured;
        // 未设密码时显示「设置密码」引导（bootstrap）；但用户点过「暂不设置」
        // 就不再自动弹出 —— 该标记持久化在**宿主侧**，刷新页面/换浏览器均生效。
        // 已设密码未解锁时显示解锁框。
        setState({
          ready: true,
          unreachable: 0,
          configured: configured,
          setupDismissed: !!data.setupDismissed,
          credentialsPath: typeof data.credentialsPath === 'string' ? data.credentialsPath : '',
          // 未设密码：仅在「未跳过」或「本次手动拉起」时显示引导；
          // 已设密码：未解锁就显示解锁框。
          locked: configured
            ? !data.unlocked
            : !data.setupDismissed || state.guideForced,
        });
        return data;
      } catch (err) {
        // 网络不可达：保守保持遮罩（fail-closed），避免界面直接暴露。
        setState({ ready: true, locked: true, unreachable: -1 });
        return undefined;
      }
    }

    /** 触发锁定：先吊销宿主 token，再挂遮罩。 */
    async function lockNow() {
      await request('/lock', { method: 'POST' });
      setState({ locked: true, configured: true });
    }

    // ---------------------------------------------------------------------
    // 自动锁定：前端计时负责「准时感」，宿主 token 过期才是真正的兜底。
    // ⚠️ 前端计时可被 DevTools 清除，故不可作为唯一防线（见设计文档）。
    // ---------------------------------------------------------------------
    var idleTimer = null;
    var autoLockMinutes = 0;
    var EVENTS = ['mousedown', 'keydown', 'touchstart', 'wheel'];

    function scheduleAutoLock() {
      if (idleTimer !== null) clearTimeout(idleTimer);
      idleTimer = null;
      if (!autoLockMinutes || autoLockMinutes <= 0) return;
      if (!state.configured || state.locked) return;
      idleTimer = setTimeout(function () {
        idleTimer = null;
        lockNow();
      }, autoLockMinutes * 60 * 1000);
    }

    function resetIdle() {
      if (!autoLockMinutes) return;
      scheduleAutoLock();
    }

    async function loadAutoLockSetting() {
      try {
        var data = await request('/settings');
        autoLockMinutes = typeof data.autoLockMinutes === 'number' ? data.autoLockMinutes : 0;
        scheduleAutoLock();
      } catch (err) {
        autoLockMinutes = 0;
      }
    }

    // ---------------------------------------------------------------------
    // 组件：遮罩（视觉闸）
    // ---------------------------------------------------------------------
    function Veil(props) {
      // t 由渲染器注入（槽注册时给 `locale: NS`），语言切换会实时跟随。
      var t = props.t;
      var snapshot = useLockState();
      var passwordState = React.useState('');
      var password = passwordState[0];
      var setPassword = passwordState[1];
      var repeatState = React.useState('');
      var repeat = repeatState[0];
      var setRepeat = repeatState[1];
      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var errState = React.useState('');
      var error = errState[0];
      var setError = errState[1];
      var inputRef = React.useRef(null);
      // 两个密码框各有**独立**的显示/隐藏状态。
      // ⚠️ 曾用一个状态同时控制两者（想着「同步切换更好对照」），
      //    但实际体验是错的：用户往往只想核对其中一个框，
      //    联动会让另一个框也被动变化。故分开。
      var pwVisibleState = React.useState(false);
      var repeatVisibleState = React.useState(false);

      var setupMode = !snapshot.configured;

      /**
       * 进入锁定态时自动聚焦密码框。
       *
       * ⚠️ 依赖必须含 snapshot.locked，不能只有 setupMode：
       *   旧实现只在 setupMode 变化时聚焦，于是「解锁 → 手动/自动锁定」
       *   这条最常见的路径永远不聚焦（setupMode 始终为 false），
       *   用户看到密码框却直接敲键盘没反应，得先点一下输入框
       *   —— 而锁定的目的恰恰就是让人回到「输密码」这一个动作。
       *
       * 聚焦时机放在下一帧（rAF），等遮罩元素真正挂到 DOM 后再聚焦 ——
       * 同一次渲染里元素可能尚未可聚焦。无 rAF 时回退 setTimeout。
       */
      /**
       * 把焦点送回主密码输入框，可选全选其内容。
       *
       * 延后到下一帧执行：提交/报错后的 React 重渲染需要先落到 DOM，
       * 否则此刻的元素可能还是旧的（或被 disabled 过）。
       * 无 rAF 时回退 setTimeout。
       *
       * @param selectAll 是否同时全选内容（输错后用它，直接打字即覆盖）
       */
      function focusPasswordInput(selectAll) {
        var run = function () {
          var el = inputRef.current;
          if (!el || typeof el.focus !== 'function') return;
          try {
            el.focus();
            if (selectAll && typeof el.select === 'function') el.select();
          } catch (err) {
            /* 聚焦/选中失败不影响解锁流程：用户手动点一下即可 */
          }
        };
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () {
            requestAnimationFrame(run);
          });
        } else {
          setTimeout(run, 0);
        }
      }

      React.useEffect(
        function () {
          if (!snapshot.locked) return undefined;
          focusPasswordInput(false);
          return undefined;
        },
        [setupMode, snapshot.locked],
      );

      /**
       * 渲染一个密码输入框：输入框 + 右侧「显示/隐藏」眼睛按钮。
       *
       * 为什么要这个按钮：密码默认打码，用户看不到自己输了什么，
       * 设置新密码时极易输错却无法自查（实测反馈）。
       *
       * ⚠️ 显示状态由调用方按字段传入（visible / onToggle），**两个框互相独立**。
       *    曾用一个共享状态联动两者，但用户体验并不需要联动 ——
       *    通常只想核对其中一个框，联动会连带把另一个也改掉。
       *
       * 无障碍：按钮带 aria-label 与 aria-pressed，图标 aria-hidden，
       * 键盘可 Tab 到（原生 button）。
       */
      function passwordField(opts) {
        var visible = opts.visible;

        var inputProps = {
          className: 'dlk-input',
          type: visible ? 'text' : 'password',
          autoComplete: opts.autoComplete,
          placeholder: opts.placeholder,
          value: opts.value,
          disabled: busy,
          onChange: function (e) {
            opts.onChange(e.target.value);
          },
        };
        // 主密码框需要 ref 供自动聚焦；确认框不需要。
        if (opts.inputRef) inputProps.ref = opts.inputRef;

        var eye = h(
          'svg',
          {
            viewBox: '0 0 24 24',
            width: 16,
            height: 16,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.8,
            'aria-hidden': 'true',
          },
          visible
            ? // 睁眼：可见中（点击可隐藏）
              [
                h('path', { key: 'a', d: 'M1.8 12S5.4 5.5 12 5.5 22.2 12 22.2 12 18.6 18.5 12 18.5 1.8 12 1.8 12Z' }),
                h('circle', { key: 'b', cx: 12, cy: 12, r: 3.2 }),
              ]
            : // 闭眼带斜线：已隐藏（点击可显示）
              [
                h('path', { key: 'a', d: 'M3 3l18 18' }),
                h('path', {
                  key: 'b',
                  d: 'M10.6 6.1A9.8 9.8 0 0 1 12 6c6.6 0 10.2 6 10.2 6a17 17 0 0 1-3.3 3.9M6.5 7.6A16.6 16.6 0 0 0 1.8 12S5.4 18 12 18c1.2 0 2.3-.2 3.3-.5',
                }),
              ],
        );

        return h(
          'div',
          { key: opts.key, className: 'dlk-pw' },
          h('input', inputProps),
          h(
            'button',
            {
              type: 'button',
              className: 'dlk-eye',
              disabled: busy,
              'aria-label': visible ? t('field.hidePassword') : t('field.showPassword'),
              'aria-pressed': visible ? 'true' : 'false',
              title: visible ? t('field.hidePassword') : t('field.showPassword'),
              // 阻止提交：这是表单内的按钮，显式 type=button 之外再兜一层，
              // 避免某些浏览器把它当 submit。
              onClick: function (e) {
                if (e && e.preventDefault) e.preventDefault();
                // 用事件目标定位本字段的输入框，避免在 passwordField 里调
                // useRef —— 该函数被**条件性调用**（设密码时 2 次、解锁时 1 次），
                // 内含 hook 会违反 Hooks 规则（hooks 数量须逐次渲染一致）。
                var btn = e && e.currentTarget;
                var box = btn && btn.parentNode;
                var el = box && box.querySelector('input');

                // 记录切换前的光标位置，切换后恢复。
                // 为什么需要：改变 input 的 type 会让浏览器**重置选区**
                // （selectionStart/End 归零），光标跳到最前面，
                // 用户继续输入时字符会插到开头（实测反馈）。
                var caret = null;
                if (el && typeof el.selectionStart === 'number') {
                  caret = { start: el.selectionStart, end: el.selectionEnd };
                }

                opts.onToggle();

                if (!el) return;
                // type 切换要等 React 重渲染落到 DOM，故延后一拍再设光标。
                var restore = function () {
                  try {
                    el.focus();
                    if (caret === null) return;
                    var len = el.value ? el.value.length : 0;
                    // 越界保护：值可能在此期间变化。
                    var s = Math.min(caret.start, len);
                    var t = Math.min(caret.end, len);
                    el.setSelectionRange(s, t);
                  } catch (err) {
                    /* 个别浏览器/输入法下 setSelectionRange 可能抛错：
                       此时仅失去光标保持，不影响显示切换本身 */
                  }
                };
                if (typeof requestAnimationFrame === 'function') {
                  requestAnimationFrame(function () {
                    requestAnimationFrame(restore);
                  });
                } else {
                  setTimeout(restore, 0);
                }
              },
            },
            eye,
          ),
        );
      }

      async function submit(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (busy) return;
        setError('');
        if (setupMode) {
          if (password.length < 4) {
            setError(t('error.passwordTooShort'));
            return;
          }
          if (password !== repeat) {
            setError(t('error.passwordMismatch'));
            return;
          }
          setBusy(true);
          var created = await request('/setup', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: password }),
          });
          setBusy(false);
          if (created.error) {
            setError(t('error.failed'));
            return;
          }
          setPassword('');
          setRepeat('');
          await syncState();
          await loadAutoLockSetting();
          return;
        }

        setBusy(true);
        var result = await request('/unlock', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: password }),
        });
        setBusy(false);
        if (result.error === 'throttled') {
          setError(t('error.throttled'));
          return;
        }
        if (result.error) {
          setError(t('error.wrongPassword'));
          // ⚠️ 不清空已输入的密码，也不让它失去焦点（实测反馈）：
          //   - 清空 = 用户白输一遍，改一个字符也得全部重打；
          //   - 焦点丢失的直接原因：清空后 submit 按钮变 disabled，
          //     而 disabled 元素会被浏览器强制失焦，焦点掉到 body，
          //     用户接着敲键盘没有任何反应（以为卡死）。
          // 改为：保留内容、把焦点送回输入框并全选 —— 直接打字即覆盖，
          // 想微调也可用方向键（全选状态下输入会替换，符合"改错重打"的预期）。
          focusPasswordInput(true);
          return;
        }
        setPassword('');
        await syncState();
        // 解锁成功：广播 connection/reset，让平台重新拉取被数据闸拦掉的初始化数据。
        // 不做这一步的话，工作区/会话列表会一直是空的，必须手动刷新页面。
        notifyPlatformReady();
        await loadAutoLockSetting();
      }

      // 未就绪或已解锁 → 不渲染任何东西（不占位、不拦截）。
      if (!snapshot.ready) return null;
      if (!snapshot.locked) return null;

      // 宿主不可达：保持遮罩并明确告知，避免用户面对点不动的表单。
      if (snapshot.unreachable) {
        return h(
          'div',
          { className: 'dlk-veil', role: 'alert' },
          h(
            'div',
            { className: 'dlk-card' },
            h(
              'div',
              { className: 'dlk-mark', 'aria-hidden': 'true' },
              h(
                'svg',
                { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
                h('rect', { x: 4.5, y: 10.5, width: 15, height: 9.5, rx: 2.2 }),
                h('path', { d: 'M8 10.5V7.8a4 4 0 0 1 8 0v2.7' }),
              ),
            ),
            h('h2', { className: 'dlk-title' }, t('error.hostUnavailableTitle')),
            h('p', { className: 'dlk-sub' }, t('error.unreachable')),
            h(
              'button',
              {
                type: 'button',
                className: 'dlk-btn dlk-btn-block',
                onClick: function () {
                  syncState();
                },
              },
              // 'retry' 刻意不写进字典：平台 common 命名空间已有
              // （zh「重试」/ en「Retry」），本命名空间未命中会回落到它。
              t('retry'),
            ),
          ),
        );
      }

      var children = [
        h(
          'div',
          { key: 'mark', className: 'dlk-mark', 'aria-hidden': 'true' },
          h(
            'svg',
            { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
            h('rect', { x: 4.5, y: 10.5, width: 15, height: 9.5, rx: 2.2 }),
            h('path', { d: 'M8 10.5V7.8a4 4 0 0 1 8 0v2.7' }),
          ),
        ),
        h('h2', { key: 'title', className: 'dlk-title' }, setupMode ? t('setup.title') : t('lock.title')),
        h('p', { key: 'sub', className: 'dlk-sub' }, setupMode ? t('setup.sub') : t('lock.sub')),
        passwordField({
          key: 'pwd',
          inputRef: inputRef,
          autoComplete: setupMode ? 'new-password' : 'current-password',
          placeholder: setupMode ? t('field.passwordNew') : t('field.password'),
          value: password,
          onChange: setPassword,
          visible: pwVisibleState[0],
          onToggle: function () {
            pwVisibleState[1](!pwVisibleState[0]);
          },
        }),
      ];

      if (setupMode) {
        children.push(
          passwordField({
            key: 'repeat',
            autoComplete: 'new-password',
            placeholder: t('field.passwordRepeat'),
            value: repeat,
            onChange: setRepeat,
            visible: repeatVisibleState[0],
            onToggle: function () {
              repeatVisibleState[1](!repeatVisibleState[0]);
            },
          }),
        );
      }

      if (error) children.push(h('p', { key: 'err', className: 'dlk-err' }, error));

      children.push(
        h(
          'button',
          {
            key: 'submit',
            type: 'submit',
            className: 'dlk-btn dlk-btn-primary dlk-btn-block',
            disabled: busy || !password,
          },
          busy ? '…' : setupMode ? t('button.setup') : t('button.unlock'),
        ),
      );

      if (setupMode) {
        // 引导式而非强制：装上插件不会把用户锁在门外。
        children.push(
          h(
            'button',
            {
              key: 'skip',
              type: 'button',
              className: 'dlk-btn dlk-btn-block',
              disabled: busy,
              onClick: function () {
                // 先乐观隐藏引导（体感即时），同时把意图落盘到宿主 ——
                // 否则刷新页面会再次弹出（用户已明确拒绝，属骚扰）。
                // 一并清 guideForced，保证侧栏按钮下次仍能重新拉起。
                setState({ setupDismissed: true, guideForced: false, locked: false });
                request('/dismiss-setup', { method: 'POST' }).catch(function () {
                  /* 落盘失败：本次已隐藏，下次刷新可能再弹一次，可接受 */
                });
              },
            },
            t('button.skip'),
          ),
        );
        children.push(
          h(
            'p',
            { key: 'hint', className: 'dlk-hint' },
            // 路径由宿主经 /status 下发（单一事实来源），不在此写死 ——
            // 目录改过一次（dsh-lock → .dsh-lock），写死会导致文案指向
            // 不存在的文件（实测踩到）。缺省回退到已知路径。
            // 整句（含占位符）进字典：中英语序不同，不能拼片段。
            t('hint.credentials', {
              path: snapshot.credentialsPath || '.dsh-lock/credentials.json',
            }),
          ),
        );
      }

      return h(
        'div',
        { className: 'dlk-veil', role: 'dialog', 'aria-modal': 'true', 'aria-label': setupMode ? t('setup.title') : t('lock.title') },
        h('form', { className: 'dlk-card', onSubmit: submit }, children),
      );
    }

    // ---------------------------------------------------------------------
    // 组件：侧栏底部的锁定按钮
    // ---------------------------------------------------------------------
    function LockButton(props) {
      var t = props.t;
      var snapshot = useLockState();
      // ⚠️ hook 必须在任何提前 return 之前调用（Hooks 规则：调用顺序须稳定）。
      var liveKeys = useShortcutKeys();
      var wide = props && props.wide !== false;
      // 已解锁（或刚跳过引导）才显示；锁定态下遮罩已盖住侧栏，按钮不可见。
      if (snapshot.locked) return null;

      var label = snapshot.configured ? t('button.lock') : t('setup.title');

      // 图标尺寸对齐官方设置触发器：宽态 16、窄态 18。
      var icon = h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: wide ? 16 : 18,
          height: wide ? 16 : 18,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          'aria-hidden': 'true',
          style: { flex: 'none' },
        },
        h('rect', { x: 4.5, y: 10.5, width: 15, height: 9.5, rx: 2.2 }),
        h('path', { d: 'M8 10.5V7.8a4 4 0 0 1 8 0v2.7' }),
      );

      var children = [icon];
      if (wide) {
        children.push(h('span', { key: 'label', className: 'dlk-foot-label' }, label));
      }

      // 键位以**悬停 tooltip** 呈现，而不是常驻显示在按钮里 ——
      // 与「设置」那一行完全一致（平时只见图标+文字，悬停才浮出键帽）。
      // Tooltip 的 shortcutKeys 会由平台渲染成格式化键帽，因此不需要
      // 自己画 kbd，也不需要 .dlk-keys/.dlk-key 样式。
      //
      // 键位取自平台 catalog（useShortcutKeys），会跟随用户改键变化；
      // 取不到时回退 fallbackKeys()；空数组（用户清除了绑定）不显示。
      var keys = liveKeys === null ? fallbackKeys() : liveKeys;

      var button = h(
        'button',
        {
          type: 'button',
          className: wide ? 'dlk-foot' : 'dlk-foot dlk-foot-rail',
          'aria-label': label,
          onClick: function () {
            // 未设密码 → 本次会话重新打开设置引导；已设密码 → 立即锁定。
            if (snapshot.configured) lockNow();
            // ⚠️ 只临时显示引导，**不清除**宿主持久化的 setupDismissed ——
            // 否则「刷新后不再打扰」的承诺会被这一次点击破坏。
            else setState({ guideForced: true, locked: true });
          },
        },
        children,
      );

      // Tooltip 缺失（理论上不会，种子表内）时退化为裸按钮，功能不受影响。
      //
      // 属性刻意保持与侧栏底部「设置」按钮一致（见
      // dsh-client-ui-settings-general 的 SettingsRoot）：
      //   只传 label / shortcutKeys，其余全用组件默认值
      //   （side='right'、delayMs=0 立即显示）。
      // ⚠️ 曾自作主张传 delayMs:500（以为「官方都这么写」——那是侧栏
      //    header 等其它位置，与底部这一行无关），结果提示比「设置」
      //    明显迟钝（用户反馈）。不要照搬其它位置的参数。
      var anchored =
        typeof Tooltip === 'function'
          ? h(Tooltip, { label: label, shortcutKeys: keys.length > 0 ? keys : undefined }, button)
          : button;

      return h('div', { className: 'dlk-foot-row' }, anchored);
    }

    // ---------------------------------------------------------------------
    // 组件：插件详情页的自动锁定设置
    //
    // 挂在 `plugins.bundle.config`（key = 包名）：该槽官方定位是
    // "rendered on the bundle's page between its description and its rows"，
    // 即**点进插件页就直接显示**，无需再点一次组件的「配置」。
    // （原先用 plugins.row.config 需要二次点击，故迁移。）
    // ---------------------------------------------------------------------
    var PRESETS = [0, 5, 10, 15, 30];

    function AutoLockSetting(props) {
      var t = props.t;
      var view = props && props.view ? props.view : 'page';
      var minutesState = React.useState(0);
      var minutes = minutesState[0];
      var setMinutes = minutesState[1];
      // 独立模式：'preset'（下拉预设）| 'custom'（自定义输入）
      // ⚠️ 不能从 minutes 推导，否则选中「自定义」时 minutes 未变、输入框永不出现。
      var modeState = React.useState('preset');
      var mode = modeState[0];
      var setMode = modeState[1];
      var customState = React.useState('');
      var custom = customState[0];
      var setCustom = customState[1];
      var savedState = React.useState(false);
      var saved = savedState[0];
      var setSaved = savedState[1];
      var loadedState = React.useState(false);
      var loaded = loadedState[0];
      var setLoaded = loadedState[1];

      React.useEffect(function () {
        var alive = true;
        request('/settings').then(function (data) {
          if (!alive) return;
          var value = typeof data.autoLockMinutes === 'number' ? data.autoLockMinutes : 0;
          setMinutes(value);
          if (value > 0 && PRESETS.indexOf(value) === -1) {
            setCustom(String(value));
            setMode('custom');
          }
          setLoaded(true);
        });
        return function () {
          alive = false;
        };
      }, []);

      if (view === 'summary') {
        if (!loaded) return h('span', null, '…');
        return h('span', null, minutes === 0 ? t('autoLock.off') : t('autoLock.minutes', { n: minutes }));
      }

      async function save(value) {
        setMinutes(value);
        var result = await request('/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ autoLockMinutes: value }),
        });
        if (result && !result.error) {
          autoLockMinutes = value;
          scheduleAutoLock();
          setSaved(true);
          setTimeout(function () {
            setSaved(false);
          }, 1800);
        }
      }

      function onSelect(event) {
        var raw = event.target.value;
        if (raw === 'custom') {
          // 切换到自定义模式并立即显示输入框；已有值则沿用，否则等待用户输入。
          setMode('custom');
          if (!custom) setCustom('10');
          var seeded = parseInt(custom || '10', 10);
          if (Number.isFinite(seeded) && seeded > 0) save(seeded);
          return;
        }
        setMode('preset');
        save(parseInt(raw, 10));
      }

      var current = mode === 'custom' ? 'custom' : String(minutes);

      var children = [
        h('span', { key: 'label', className: 'dlk-cfg-label' }, t('autoLock.label')),
        h(
          'select',
          { key: 'select', className: 'dlk-select', value: current, onChange: onSelect },
          h('option', { value: '0' }, t('autoLock.off')),
          h('option', { value: '5' }, t('autoLock.minutes', { n: 5 })),
          h('option', { value: '10' }, t('autoLock.minutes', { n: 10 })),
          h('option', { value: '15' }, t('autoLock.minutes', { n: 15 })),
          h('option', { value: '30' }, t('autoLock.minutes', { n: 30 })),
          h('option', { value: 'custom' }, t('autoLock.custom')),
        ),
      ];

      if (mode === 'custom') {
        children.push(
          h('input', {
            key: 'custom',
            className: 'dlk-input dlk-input-num',
            type: 'number',
            min: 1,
            placeholder: t('autoLock.customPlaceholder'),
            value: custom,
            onChange: function (e) {
              setCustom(e.target.value);
              var parsed = parseInt(e.target.value, 10);
              if (Number.isFinite(parsed) && parsed > 0) save(parsed);
            },
          }),
        );
      }

      if (saved) children.push(h('span', { key: 'saved', className: 'dlk-ok' }, t('autoLock.saved')));

      return h(
        'div',
        { className: 'dlk-cfg' },
        h('div', { className: 'dlk-cfg-row' }, children),
        h('p', { className: 'dlk-note' }, t('autoLock.note')),
      );
    }

    // ---------------------------------------------------------------------
    // 插件对象
    // ---------------------------------------------------------------------
    return {
      // 服务依赖：
      //   - slots     ：注册遮罩 / 侧栏按钮 / 设置页
      //   - shortcuts ：注册 ⌘⇧. 锁定快捷键
      //   - locale    ：界面文案中英双语（官方 locale 服务）
      //
      // 订正一处曾经的误判：`shortcuts` 确实可注入。实测确认提供者
      // @deepseek-ai/dsh-client-shortcuts 在 boot 清单中先于本插件加载
      // （索引 11 vs 60），ctx.shortcuts.register 可用。
      // 之前误判为"不可注入"，是因为把 Service.listService 返回的 8 项
      // 当成了全集——那只是"有文档的公开服务"；官方
      // dsh-client-ui-settings-general 的 inject 里同样含 remote /
      // configForms / shortcuts 等不在该清单内的服务。
      //
      // 真正导致 "1 entry did not activate" 的原因见下方快捷键区块：
      // register 因键位不被 Web 白名单接受而抛错，并冒泡到 apply。
      inject: ['slots', 'shortcuts', 'locale'],
      apply(ctx) {
        // 注册中英字典（官方 locale 服务）。
        //
        // ⚠️ 运行时的 register **不校验**「两种语言是否都给全」—— 那只是 TS 侧对
        //    LocaleNamespaceMap 的编译期约束，纯 JS bundle 拿不到。漏一种语言不会
        //    报错，只会回落到 common 或直接显示 key 本身（很难被发现），
        //    故这里主动做一次键一致性自查并告警。
        try {
          var zhKeys = Object.keys(zh);
          var enKeys = Object.keys(en);
          var missingEn = zhKeys.filter(function (k) { return !(k in en); });
          var missingZh = enKeys.filter(function (k) { return !(k in zh); });
          if (missingEn.length || missingZh.length) {
            console.warn('[dsh-lock] dictionary keys mismatch',
              { missingEn: missingEn, missingZh: missingZh });
          }
        } catch (err) {
          /* 自查本身绝不影响注册 */
        }

        // 用 ctx.effect 包住：卸载时自动撤销该命名空间，HMR 重载不会撞
        // 「locale namespace "dsh-lock" already has locale "zh"」。
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en });
        }, 'dsh-lock: dictionaries');
        // 绑定本命名空间的翻译函数（给注册期的 label thunk 用；组件里的 t 由
        // 渲染器按槽注册选项 `locale: NS` 注入，见文件头第 5 条）。
        // bind 返回的引用按命名空间稳定，不会破坏 memoization。
        var t = ctx.locale.bind(NS);

        // 保存 ctx 供组件在解锁成功后广播 connection/reset（见 notifyPlatformReady）。
        ctxRef = ctx;
        ctx.effect(function () {
          return function () {
            ctxRef = null;
          };
        }, 'dsh-lock: ctx ref');

        // 样式：幂等注册，卸载时移除（HMR 重复 apply 不叠加第二份）。
        ctx.effect(function () {
          var existing = document.querySelector('style[data-plugin-css="dsh-lock"]');
          if (existing) existing.remove();
          var el = document.createElement('style');
          el.setAttribute('data-plugin-css', 'dsh-lock');
          el.textContent = CSS;
          document.head.appendChild(el);
          return function () {
            if (el.parentNode) el.parentNode.removeChild(el);
          };
        }, 'dsh-lock: stylesheet');

        // 视觉闸：全屏遮罩。
        // disposer 需保留 —— 守护逻辑靠「撤销再注册」把被删的遮罩挂回来。
        var veilDispose = null;
        var mountVeil = function () {
          if (typeof veilDispose === 'function') {
            try {
              veilDispose();
            } catch (err) {
              /* 旧注册已失效：忽略 */
            }
            veilDispose = null;
          }
          veilDispose = ctx.slots.register(
            { name: 'shell.overlay', id: 'dsh-lock-veil', order: 1000, locale: NS },
            Veil,
          );
        };
        ctx.slots.inject('shell.overlay', function () {
          mountVeil();
          return function () {
            if (typeof veilDispose === 'function') {
              try {
                veilDispose();
              } catch (err) {
                /* 卸载期异常不影响插件卸载 */
              }
              veilDispose = null;
            }
          };
        });

        // 手动锁定：侧栏底部，紧挨设置。
        ctx.slots.inject('sidebar.footer.action', function () {
          return ctx.slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-lock/lock-now', order: 50, locale: NS },
            LockButton,
          );
        });

        // ---------------------------------------------------------------------
        // 自动锁定设置 —— 挂在「本插件所在一行」的配置槽 `plugins.row.config`。
        //
        // 官方契约（dsh-cordis-client-runner 的槽位文档原文）：
        //   `plugins.row.config` = "The configuration of **one row a bundle
        //   declares**, keyed by `<package name>#<row id>` … the row on the
        //   bundle's page gains a configure control that opens the entry's page".
        //   即：点插件页里那一行 → 进入本插件的配置页。**每个行各占一个 key**。
        //
        // 为什么不用 `plugins.bundle.config`（曾经用过，聚合后失效）：
        //   它的 key 是**所在 bundle 的包名**，且官方定义为 "a bundle's **own**
        //   configuration" —— 一个 bundle 只承载**一份**配置。
        //   独立安装时 bundle 就是我 → key 'dsh-lock' 可用；
        //   但装进聚合包后 bundle 变成 dsh-suite，该 key 归聚合包所有，
        //   而我们 5 个插件若都去抢 'dsh-suite' 这一个 key，
        //   平台的 keyed 槽用 `find` 只取第一个 → **只有一个插件的配置能显示**。
        //   （这个冲突已实测复现，不是推断。）
        //   行级槽按 `包名#行id` 分派，天然一插件一格，聚合后依然精确命中。
        //
        // ⚠️ 注册两个 key：行 id 由 patch 决定，两种装法不同 ——
        //   · 独立安装：本仓库 cordis.patch.yml 的 `id: lock`
        //     ⇒ `dsh-lock#lock`
        //   · 装进聚合包 dsh-suite：那份 patch 的 `id: dsh-suite-lock`
        //     ⇒ `dsh-suite#dsh-suite-lock`
        //   两个都注册才能在两种装法下都显示配置。
        //   代价：若哪天改动任一份 patch 的行 id，必须同步改这里（注释已写明）。
        // ---------------------------------------------------------------------
        var ROW_CONFIG_KEYS = ['dsh-lock#lock', 'dsh-suite#dsh-suite-lock'];
        ctx.slots.inject('plugins.row.config', function () {
          var disposers = ROW_CONFIG_KEYS.map(function (rowKey) {
            return ctx.slots.register(
              { name: 'plugins.row.config', key: rowKey, locale: NS },
              AutoLockSetting,
            );
          });
          return function () {
            disposers.forEach(function (dispose) {
              try {
                if (typeof dispose === 'function') dispose();
              } catch (err) {
                /* 卸载期异常不影响插件卸载 */
              }
            });
          };
        });

        // ---------------------------------------------------------------------
        // 快捷键：⌘/Ctrl + ⇧ + . → 立即锁定
        //
        // ⚠️ 整段必须包在 try/catch 里（血泪教训）：
        //   ctx.shortcuts.register() 会做严格键位校验，键位不被平台接受时抛错。
        //   该错误若冒泡到 apply，会导致**整个插件激活失败**
        //   → boot 报 "1 entry did not activate / dsh-lock: failed"
        //   → 整页 "Failed to load plugins"（用户完全无法使用 DSH）。
        //   即：一个可选功能的键位选择错误，能把整套密码门禁拖下水。
        //   下面每层都可能失败的地方都已单独兜住，快捷键最坏只是不生效。
        //
        // ⚠️ 平台 Web 键位规则（实测穷举，含关键的平台差异）：
        //   校验会遍历 desktop/web × macos/windows/linux **六个** profile，
        //   任一个不通过 → 整体抛 "Unsupported Web shortcut"。
        //     macOS / Windows：✅ primary+shift+字母键（如 KeyL）
        //                      ✅ primary+alt+*、✅ 3 修饰键组合
        //     Linux          ：❌ 字母键一律拒绝
        //                      ✅ 仅 primary+Slash / primary+shift+Comma /
        //                         primary+shift+Period 三种标点组合
        //   故本插件分平台取键：mac/win → ⇧⌘L（好记）；linux → ⇧⌘.（回退）。
        //   键位用**物理键 code**（KeyL / Period），跨键盘布局稳定。
        //
        //   平台收紧的原因是真实存在的：Web 不能随意占用字母键组合——
        //   浏览器、系统、输入法都可能抢占，且不同键盘布局对物理键映射不同。
        // ---------------------------------------------------------------------
        try {
          // 未设密码或已锁定时不应接管按键，透传给系统。
          var shortcutEnabled = function () {
            return state.configured && !state.locked;
          };
          var shortcutThen = function () {
            try {
              lockNow();
            } catch (err) {
              /* 触发期异常同样不得冒泡 */
            }
          };
          if (ctx.shortcuts && typeof ctx.shortcuts.register === 'function') {
            // 键位按平台区分（实测结论）：
            //   平台校验会遍历 desktop/web × macos/windows/linux **六个** profile，
            //   只要有一个不通过就整体抛 "Unsupported Web shortcut"。
            //   linux 的白名单最窄 —— 只放行 ⌘/ 、⇧⌘, 、⇧⌘. 三种标点组合，
            //   任何「修饰键 + 字母键」在 linux 下都会被拒。
            //   macos / windows 则允许 primary+shift+字母键。
            //   故：mac/win 用 ⇧⌘L（好记），linux 回退到 ⇧⌘.（唯一可用的字母替代）。
            var LOCK_DEFAULTS = (function () {
              var d = {};
              var letter = { code: 'KeyL', modifiers: ['primary', 'shift'] };
              var punct = { code: 'Period', modifiers: ['primary', 'shift'] };
              d['desktop:macos'] = letter;
              d['desktop:windows'] = letter;
              d['desktop:linux'] = punct;
              d['web:macos'] = letter;
              d['web:windows'] = letter;
              d['web:linux'] = punct;
              return d;
            })();
            var disposeShortcut = ctx.shortcuts.register({
              id: 'dsh-lock.lock',
              // label 用**函数**而非字符串：快捷键面板每次刷新都会求值，
              // 语言切换后这一行会跟着变，不需要重新注册。
              label: function () {
                return t('button.lock');
              },
              // aliases 是快捷键面板的**搜索别名**，不是界面文案（显示名走上面的
              // label thunk，会跟随语言切换；别名不出现在界面文字里）。
              //
              // 中英文都放：平台搜索只匹配 aliases，若只给英文，中文用户搜
              // 「锁定」会一无所获（实测反馈：搜 lock 能搜到、搜「锁定」搜不到）。
              // 官方各包只写英文别名，但官方是英文产品；本插件界面默认中文，
              // 故双语并列。
              //
              // 不采用「按当前语言动态给别名」：aliases 是注册时传入的静态数组，
              // 切语言不会重新注册 —— 取当时的语言值只会被固化，反而更糟。
              aliases: ['lock', 'lock now', '锁定', '锁屏'],
              defaults: LOCK_DEFAULTS,
              // 三个区域都接受，否则在输入框里按不出来。
              regions: ['page', 'editable', 'terminal'],
              modals: [],
              resolve: function () {
                if (!shortcutEnabled()) return { status: 'pass' };
                return { status: 'handled', run: shortcutThen };
              },
            });
            ctx.effect(function () {
              return function () {
                try {
                  if (typeof disposeShortcut === 'function') disposeShortcut();
                } catch (err) {
                  /* 清理失败不影响卸载 */
                }
              };
            }, 'dsh-lock: shortcut dispose');
          }
        } catch (err) {
          // 键位或服务任何问题：只失去快捷键，插件本体照常工作。
        }

        // 订阅平台 catalog，让侧栏键帽跟随用户改键实时变化。
        // 放在注册之后：确保本命令已进入 catalog。
        watchShortcutKeys(ctx);

        // 活动监听 → 重置空闲计时（自动锁定）。
        ctx.effect(function () {
          var handler = function () {
            resetIdle();
          };
          EVENTS.forEach(function (name) {
            window.addEventListener(name, handler, { passive: true });
          });
          return function () {
            EVENTS.forEach(function (name) {
              window.removeEventListener(name, handler);
            });
            if (idleTimer !== null) clearTimeout(idleTimer);
            idleTimer = null;
          };
        }, 'dsh-lock: idle tracking');

        // 初始同步：页面加载即查询宿主锁定状态。
        syncState().then(function () {
          loadAutoLockSetting();
        });

        // ---------------------------------------------------------------------
        // 遮罩守护（体验补强，非安全边界）
        //
        // 背景：视觉遮罩只是一个 <div>，任何人都能在 DevTools 里删掉它。
        //   这是 Web 的物理事实——前端遮罩**从来不是也不可能**是安全边界。
        //   真正的锁是宿主的数据闸：遮罩被删后 /api/* 仍返回 401，
        //   用户发消息会看到 "transport failure … HTTP 401"，界面是个空壳。
        //
        // 但那个状态对用户很困惑：界面看起来正常，一操作就报错。
        //   所以这里加一个守护：处于锁定态时定期检查遮罩是否还在，
        //   被删掉就立刻重新挂回来（用户视角是「锁自己回来了」）。
        //
        // ⚠️ 这纯粹是**体验补强**，不要把它当成安全措施：
        //   删遮罩的人同样能删掉这段守护逻辑。安全始终由宿主数据闸保证。
        //
        // 恢复手段是「撤销旧注册 + 重新注册」，而不是 setState 触发重渲染。
        //   实测原因：遮罩被外部删除后，平台 slot 层会把它替换成
        //   `<div data-slot-error="shell.overlay">`，**组件已被卸载**。
        //   此时虚拟 DOM 里已无该节点，无论怎么 setState / 换 key 都不会重建；
        //   只有重新注册，slot 才会重新挂载组件。
        //
        // 开销：仅在「已设密码且未解锁」时轮询；解锁后立即停止，不产生任何请求。
        // ---------------------------------------------------------------------
        ctx.effect(function () {
          var guardTimer = setInterval(function () {
            // 只在应该锁定时守护。
            if (!state.configured || !state.locked) return;
            // 遮罩仍在 → 无事可做。
            if (document.querySelector('.dlk-veil')) return;
            // 遮罩被移除（组件已被 slot 卸载）→ 重新注册把它挂回来。
            mountVeil();
          }, 1200);
          return function () {
            clearInterval(guardTimer);
          };
        }, 'dsh-lock: veil guard');
      },
    };
  },
});
