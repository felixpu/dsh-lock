// dsh-lock —— 密码门禁的**浏览器半身**（视觉闸 + 锁定控制）。
//
// 形态照官方模板 `cordis-plugin-development/templates/decoration/client.js`：
// 一个 `__ModuleLoader__.load({ id, factory })`，factory 里 `return` 插件对象。
//
// ⚠️ 只允许 require 平台种子表内的模块。本文件只用 react；槽位服务走
//    package.json 里 `dsh.client.inject` 声明的 "slots"。
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
window.__ModuleLoader__.load({
  id: 'dsh-lock',
  factory(require) {
    var React = require('react');
    var h = React.createElement;

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
      // ---- 快捷键键帽（对齐官方 ShortcutKeys 的 plain 变体）----
      // 实测规范来源：dsh-client-ui-primitives/lib/ShortcutKeys.module.css
      '.dlk-keys{display:inline-flex;flex:none;align-items:center;gap:3px;margin-left:auto;',
      'color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;white-space:nowrap}',
      '.dlk-key{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;',
      'font:inherit;border:none;background:none;padding:0}',
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

    var LABELS = {
      title: 'DSH 已锁定',
      sub: '请输入密码继续',
      setupTitle: '设置访问密码',
      setupSub: '设置后，打开界面需要输入密码才能使用',
      placeholder: '密码',
      placeholderNew: '设置密码（至少 4 位）',
      placeholderRepeat: '再次输入密码',
      unlock: '解锁',
      setup: '设置并继续',
      skip: '暂不设置',
      lockNow: '锁定',
      wrong: '密码不正确',
      mismatch: '两次输入的密码不一致',
      tooShort: '密码至少 4 位',
      throttled: '尝试次数过多，请稍后再试',
      failed: '操作失败，请重试',
      unreachable: '无法连接 DSH 宿主，请确认服务正在运行后刷新页面。',
      autoLock: '自动锁定',
      autoLockNote: '无操作达到指定时长后自动锁定。默认关闭；锁定时长任务不会中断。',
      saved: '已保存',
      minutes: '分钟',
      off: '关闭',
      custom: '自定义',
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
    /** 用于按钮 title / aria 的快捷键描述文本（如 "⇧⌘L"）。 */
    var SHORTCUT_TEXT = IS_MAC
      ? KEYCAP_SHIFT + KEYCAP_PRIMARY + KEYCAP_LAST
      : KEYCAP_PRIMARY + '+' + KEYCAP_SHIFT + '+' + KEYCAP_LAST;

    // ---------------------------------------------------------------------
    // 插件 ctx 的模块级引用（apply 时赋值）。
    // 组件（Veil 等）拿不到 ctx，但解锁成功时需要 ctx.emit 通知平台重拉数据。
    var ctxRef = null;

    /**
     * 通知平台「连接已就绪，请重新拉取数据」。
     *
     * 为什么必须做（实测确诊的真 bug）：
     *   数据闸在锁定态会把平台的全部初始化请求拦成 401
     *   （/api/session/list、/api/settings/describe、/api/credentials/describe …）。
     *   平台把这些请求记为「已完成（失败）」，**解锁后不会自动重试**。
     *   结果：解锁进入界面后工作区/会话数据始终为空，必须手动刷新页面才恢复。
     *
     * 修复手段：广播平台的 `connection/reset` 事件 —— 这正是 dsh-api-gateway
     *   在「连接建立/重连成功」时发出的信号，各 UI 模块（workspace、skill、
     *   model-selection 等）都监听它并重新初始化数据。
     *   解锁后服务端已放行，语义与「连接刚就绪」完全一致。
     *
     * 契约来源：官方文档 develop/framework/events —— `ctx.emit(name, payload)`
     *   为标准触发 API；事件本身见 client/Event 目录 connection/reset。
     *
     * 容错：整个调用包 try/catch，且延迟一拍执行（等遮罩卸载、状态落定），
     *   任何失败只影响「要不要手动刷新」，绝不影响解锁本身。
     */
    function notifyPlatformReady() {
      try {
        if (!ctxRef || typeof ctxRef.emit !== 'function') return;
        // 延迟到当前渲染与状态提交之后再广播，避免与遮罩卸载争抢同一帧。
        setTimeout(function () {
          try {
            ctxRef.emit('connection/reset');
          } catch (err) {
            /* 广播失败：最坏情况是需要用户手动刷新 */
          }
        }, 0);
      } catch (err) {
        /* 同上：不影响解锁结果 */
      }
    }

    var listeners = new Set();
    var state = {
      ready: false, // 是否已从宿主取到状态
      configured: false, // 是否已设密码
      locked: true, // 是否需要显示遮罩
      skipped: false, // 本次会话是否选择了「暂不设置」
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
        // 未设密码时显示「设置密码」引导（bootstrap），用户可跳过；
        // 已设密码未解锁时显示解锁框。
        setState({
          ready: true,
          unreachable: 0,
          configured: configured,
          locked: configured ? !data.unlocked : !state.skipped,
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

      var setupMode = !snapshot.configured;

      React.useEffect(
        function () {
          if (inputRef.current && inputRef.current.focus) inputRef.current.focus();
        },
        [setupMode],
      );

      async function submit(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (busy) return;
        setError('');

        if (setupMode) {
          if (password.length < 4) {
            setError(LABELS.tooShort);
            return;
          }
          if (password !== repeat) {
            setError(LABELS.mismatch);
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
            setError(LABELS.failed);
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
          setError(LABELS.throttled);
          return;
        }
        if (result.error) {
          setError(LABELS.wrong);
          setPassword('');
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
            h('h2', { className: 'dlk-title' }, 'DSH 暂时无法访问'),
            h('p', { className: 'dlk-sub' }, LABELS.unreachable),
            h(
              'button',
              {
                type: 'button',
                className: 'dlk-btn dlk-btn-block',
                onClick: function () {
                  syncState();
                },
              },
              '重试',
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
        h('h2', { key: 'title', className: 'dlk-title' }, setupMode ? LABELS.setupTitle : LABELS.title),
        h('p', { key: 'sub', className: 'dlk-sub' }, setupMode ? LABELS.setupSub : LABELS.sub),
        h('input', {
          key: 'pwd',
          ref: inputRef,
          className: 'dlk-input',
          type: 'password',
          autoComplete: setupMode ? 'new-password' : 'current-password',
          placeholder: setupMode ? LABELS.placeholderNew : LABELS.placeholder,
          value: password,
          disabled: busy,
          onChange: function (e) {
            setPassword(e.target.value);
          },
        }),
      ];

      if (setupMode) {
        children.push(
          h('input', {
            key: 'repeat',
            className: 'dlk-input',
            type: 'password',
            autoComplete: 'new-password',
            placeholder: LABELS.placeholderRepeat,
            value: repeat,
            disabled: busy,
            onChange: function (e) {
              setRepeat(e.target.value);
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
          busy ? '…' : setupMode ? LABELS.setup : LABELS.unlock,
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
                setState({ skipped: true, locked: false });
              },
            },
            LABELS.skip,
          ),
        );
        children.push(
          h(
            'p',
            { key: 'hint', className: 'dlk-hint' },
            '密码经 scrypt 单向哈希存储，忘记密码可删除 ~/.dsh/dsh-lock/credentials.json 后重启 DSH。',
          ),
        );
      }

      return h(
        'div',
        { className: 'dlk-veil', role: 'dialog', 'aria-modal': 'true', 'aria-label': setupMode ? LABELS.setupTitle : LABELS.title },
        h('form', { className: 'dlk-card', onSubmit: submit }, children),
      );
    }

    // ---------------------------------------------------------------------
    // 组件：侧栏底部的锁定按钮
    // ---------------------------------------------------------------------
    function LockButton(props) {
      var snapshot = useLockState();
      var wide = props && props.wide !== false;
      // 已解锁（或刚跳过引导）才显示；锁定态下遮罩已盖住侧栏，按钮不可见。
      if (snapshot.locked) return null;

      var label = snapshot.configured ? LABELS.lockNow : LABELS.setupTitle;

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
        // 快捷键键帽提示：kbd 元素 + 官方 ShortcutKeys 的 plain 样式
        // （实测规范：dsh-client-ui-primitives/lib/ShortcutKeys.module.css
        //   .keys → gap:3px; color:var(--dsw-alias-label-tertiary);
        //           font-size:12px; line-height:16px; 且 plain 变体无底色）。
        // 键帽按平台呈现，与注册的键位保持一致（见 KEYCAP_* 常量）。
        children.push(
          h(
            'span',
            { key: 'keys', className: 'dlk-keys', 'aria-hidden': 'true' },
            h('kbd', { key: 'shift', className: 'dlk-key' }, KEYCAP_SHIFT),
            h('kbd', { key: 'primary', className: 'dlk-key' }, KEYCAP_PRIMARY),
            h('kbd', { key: 'last', className: 'dlk-key' }, KEYCAP_LAST),
          ),
        );
      }

      return h(
        'div',
        { className: 'dlk-foot-row' },
        h(
          'button',
          {
            type: 'button',
            className: wide ? 'dlk-foot' : 'dlk-foot dlk-foot-rail',
            title: label,
            'aria-label': label,
            onClick: function () {
              // 未设密码 → 重新打开设置引导；已设密码 → 立即锁定。
              if (snapshot.configured) lockNow();
              else setState({ skipped: false, locked: true });
            },
          },
          children,
        ),
      );
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
        return h('span', null, minutes === 0 ? LABELS.off : minutes + ' ' + LABELS.minutes);
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
        h('span', { key: 'label', className: 'dlk-cfg-label' }, LABELS.autoLock),
        h(
          'select',
          { key: 'select', className: 'dlk-select', value: current, onChange: onSelect },
          h('option', { value: '0' }, LABELS.off),
          h('option', { value: '5' }, '5 ' + LABELS.minutes),
          h('option', { value: '10' }, '10 ' + LABELS.minutes),
          h('option', { value: '15' }, '15 ' + LABELS.minutes),
          h('option', { value: '30' }, '30 ' + LABELS.minutes),
          h('option', { value: 'custom' }, LABELS.custom),
        ),
      ];

      if (mode === 'custom') {
        children.push(
          h('input', {
            key: 'custom',
            className: 'dlk-input dlk-input-num',
            type: 'number',
            min: 1,
            placeholder: LABELS.minutes,
            value: custom,
            onChange: function (e) {
              setCustom(e.target.value);
              var parsed = parseInt(e.target.value, 10);
              if (Number.isFinite(parsed) && parsed > 0) save(parsed);
            },
          }),
        );
      }

      if (saved) children.push(h('span', { key: 'saved', className: 'dlk-ok' }, LABELS.saved));

      return h(
        'div',
        { className: 'dlk-cfg' },
        h('div', { className: 'dlk-cfg-row' }, children),
        h('p', { className: 'dlk-note' }, LABELS.autoLockNote),
      );
    }

    // ---------------------------------------------------------------------
    // 插件对象
    // ---------------------------------------------------------------------
    return {
      // 服务依赖：
      //   - slots     ：注册遮罩 / 侧栏按钮 / 设置页
      //   - shortcuts ：注册 ⌘⇧. 锁定快捷键
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
      inject: ['slots', 'shortcuts'],
      apply(ctx) {
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
            { name: 'shell.overlay', id: 'dsh-lock-veil', order: 1000 },
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
          return ctx.slots.register({ name: 'sidebar.footer.action', id: 'dsh-lock/lock-now', order: 50 }, LockButton);
        });

        // 自动锁定设置：插件详情页直接显示（key = 包名）。
        // 用 plugins.bundle.config 而非 plugins.row.config —— 后者需要再点一次
        // 组件的「配置」才进入，前者点进插件页即可见。
        ctx.slots.inject('plugins.bundle.config', function () {
          return ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-lock' }, AutoLockSetting);
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
              label: function () {
                return LABELS.lockNow;
              },
              aliases: ['lock', '锁定'],
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
