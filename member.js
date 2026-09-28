const $ = s => document.querySelector(s);
const widgets = {};

// Turnstile：按需渲染，等脚本加载完成；10 秒还没加载出来就提示
function renderWidget(name, selector) {
  if (widgets[name] !== undefined) return;
  widgets[name] = null;
  const start = Date.now();
  const timer = setInterval(() => {
    if (window.turnstile) {
      clearInterval(timer);
      widgets[name] = window.turnstile.render(selector, { sitekey: window.PEIBANJI_TURNSTILE_SITEKEY });
    } else if (Date.now() - start > 10000) {
      clearInterval(timer);
      $(selector).textContent = '安全验证组件加载失败，请检查网络后刷新页面。';
    }
  }, 200);
}
const getToken = name => (widgets[name] ? window.turnstile.getResponse(widgets[name]) : '') || '';
const resetToken = name => { if (widgets[name]) window.turnstile.reset(widgets[name]); };

async function api(url, method, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j.error || '请求失败，请稍后再试。');
  return j;
}

function showTab(which) {
  const login = which === 'login';
  $('#login-form').hidden = !login;
  $('#register-form').hidden = login;
  $('#tab-login').className = 'button ' + (login ? 'primary' : 'ghost');
  $('#tab-register').className = 'button ' + (login ? 'ghost' : 'primary');
  renderWidget(login ? 'login' : 'register', login ? '#login-ts' : '#register-ts');
}

function showGuest() {
  $('#member-view').hidden = true;
  $('#guest-view').hidden = false;
  showTab('login');
}

function showMember(me) {
  $('#guest-view').hidden = true;
  $('#member-view').hidden = false;
  $('#member-email').textContent = me.email;
  $('#pn').value = me.nickname || '';
  $('#pg').value = me.gender || '';
  $('#pa').value = me.age || '';
  $('#pc').value = me.city || '';
  $('#pb').value = me.bio || '';
  $('#profile-msg').textContent = me.nickname ? '' : '请先完善资料并保存。';
}

async function loadMe() {
  const r = await fetch('/api/members/me');
  if (!r.ok) return false;
  showMember(await r.json());
  return true;
}

$('#tab-login').onclick = () => showTab('login');
$('#tab-register').onclick = () => showTab('register');

$('#login-form').onsubmit = async e => {
  e.preventDefault();
  const msg = $('#login-msg');
  const token = getToken('login');
  if (!token) { msg.textContent = '请先完成安全验证。'; return; }
  msg.textContent = '正在登录…';
  try {
    await api('/api/members/login', 'POST', { email: $('#le').value, password: $('#lp').value, turnstileToken: token });
    $('#lp').value = '';
    msg.textContent = '';
    if (!await loadMe()) msg.textContent = '登录成功，但读取账号失败，请刷新页面。';
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    resetToken('login');
  }
};

$('#register-form').onsubmit = async e => {
  e.preventDefault();
  const msg = $('#register-msg');
  if ($('#rp').value.length < 12) { msg.textContent = '密码至少 12 位。'; return; }
  if ($('#rp').value !== $('#rp2').value) { msg.textContent = '两次输入的密码不一致。'; return; }
  const token = getToken('register');
  if (!token) { msg.textContent = '请先完成安全验证。'; return; }
  msg.textContent = '正在创建账号…';
  try {
    const res = await api('/api/members/register', 'POST', { email: $('#re').value, password: $('#rp').value, turnstileToken: token });
    $('#le').value = $('#re').value;
    $('#rp').value = $('#rp2').value = '';
    msg.textContent = '';
    showTab('login');
    $('#login-msg').textContent = res.message || '账号创建成功，请登录。';
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    resetToken('register');
  }
};

$('#profile-form').onsubmit = async e => {
  e.preventDefault();
  const msg = $('#profile-msg');
  msg.textContent = '正在保存…';
  try {
    await api('/api/members/profile', 'PUT', { nickname: $('#pn').value, gender: $('#pg').value, age: $('#pa').value, city: $('#pc').value, bio: $('#pb').value });
    msg.textContent = '资料已保存。';
  } catch (err) {
    msg.textContent = err.message;
    if (/过期/.test(err.message)) showGuest();
  }
};

$('#logout').onclick = async () => {
  try { await fetch('/api/members/logout', { method: 'POST' }); } catch {}
  showGuest();
  $('#login-msg').textContent = '已退出登录。';
};

loadMe().then(ok => { if (!ok) showGuest(); }).catch(showGuest);
