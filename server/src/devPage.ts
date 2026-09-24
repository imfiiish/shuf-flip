// 仅 dev 用的接口测试台：注册/登录/改名/state/events 一页点完。
// 生产环境不挂载（正式界面由前端项目提供）。
export const devPage = /* html */ `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>shuf-flip API 测试台</title>
<style>
  :root { font-family: system-ui, sans-serif; }
  body { max-width: 720px; margin: 24px auto; padding: 0 16px; color: #222; }
  h1 { font-size: 1.3rem; }
  p.note { color: #777; font-size: .85rem; }
  fieldset { border: 1px solid #ccc; border-radius: 8px; margin: 0 0 14px; padding: 10px 12px; }
  legend { font-weight: 600; }
  input, textarea, button { font: inherit; padding: 5px 8px; margin: 3px 4px 3px 0; }
  textarea { width: 100%; height: 70px; box-sizing: border-box; }
  button { cursor: pointer; border: 1px solid #bbb; border-radius: 6px; background: #f7f7f7; }
  button:hover { background: #eee; }
  pre { background: #111; color: #9f9; padding: 10px; border-radius: 8px; min-height: 120px;
        max-height: 360px; overflow: auto; font-size: .82rem; white-space: pre-wrap; }
</style>
</head>
<body>
<h1>shuf-flip API 测试台</h1>
<p class="note">仅后端接口的临时调试页（dev）。正式界面在另一个前端项目里。</p>

<fieldset>
  <legend>账号</legend>
  <input id="u" placeholder="username" value="alice" size="14">
  <input id="p" placeholder="password" value="1234" size="6" maxlength="4">
  <button onclick="reg()">注册</button>
  <button onclick="login()">登录</button>
  <button onclick="me()">我是谁</button>
  <button onclick="logout()">登出</button>
  <br>
  改名：<input id="nu" placeholder="新 username" value="alice2" size="14">
  <button onclick="rename()">改名</button>
</fieldset>

<fieldset>
  <legend>状态同步 /api/state</legend>
  <button onclick="getState()">读取</button>
  <button onclick="putState()">保存</button>
  rev <input id="rev" value="0" size="4">
  <textarea id="data">{"stats":{"snail":{"met":3,"checked":1}}}</textarea>
</fieldset>

<fieldset>
  <legend>事件 /api/events</legend>
  <button onclick="sendEvent()">发一条测试事件</button>
  <span class="note">未登录时返回 stored:0（游客默认不采集）</span>
</fieldset>

<pre id="out">点上面的按钮，结果会显示在这里。</pre>

<script>
const out = document.getElementById('out');
const g = (id) => document.getElementById(id).value;
function log(label, obj) {
  out.textContent = '[' + new Date().toLocaleTimeString() + '] ' + label + '\\n' +
    JSON.stringify(obj, null, 2) + '\\n\\n' + out.textContent;
}
async function call(label, method, url, body) {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    log(label + '  ' + method + ' ' + url + '  -> ' + res.status, data);
    return data;
  } catch (err) {
    log(label + '  失败', String(err));
  }
}
const reg = () => call('注册', 'POST', '/api/auth/register', { username: g('u'), password: g('p'), consent: true });
const login = () => call('登录', 'POST', '/api/auth/login', { username: g('u'), password: g('p') });
const me = () => call('我是谁', 'GET', '/api/auth/me');
const logout = () => call('登出', 'POST', '/api/auth/logout');
const rename = () => call('改名', 'POST', '/api/auth/rename', { username: g('nu') });
const getState = () => call('读状态', 'GET', '/api/state');
function putState() {
  let data;
  try { data = JSON.parse(g('data')); } catch { return log('保存失败', 'data 不是合法 JSON'); }
  call('存状态', 'PUT', '/api/state', { data, rev: Number(g('rev')) });
}
const sendEvent = () => call('发事件', 'POST', '/api/events', [
  { ts: new Date().toISOString(), type: 'study_card', data: { word: 'snail', dir: 'right', reveals: 1 } },
]);
</script>
</body>
</html>`
