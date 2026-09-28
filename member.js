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

const isPhone = v => /^1[3-9]\d{9}$/.test(v);
const maskPhone = p => (p && p.length === 11 ? p.slice(0, 3) + '****' + p.slice(7) : p || '');

// name: login | register | forgot
function showForm(name) {
  for (const f of ['login', 'register', 'forgot']) $(`#${f}-form`).hidden = f !== name;
  $('#tab-login').className = 'button ' + (name === 'register' ? 'ghost' : 'primary');
  $('#tab-register').className = 'button ' + (name === 'register' ? 'primary' : 'ghost');
  renderWidget(name, `#${name}-ts`);
}
function showGuest() { $('#member-view').hidden = true; $('#guest-view').hidden = false; showForm('login'); }
function showMember(me) {
  $('#guest-view').hidden = true;
  $('#member-view').hidden = false;
  $('#member-phone').textContent = maskPhone(me.phone);
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

// 获取验证码：需要先完成安全验证；成功后按钮倒计时 60 秒
function setupSend({ btn, phoneInput, purpose, widget, msg }) {
  $(btn).onclick = async () => {
    const phone = $(phoneInput).value.trim(), m = $(msg);
    if (!isPhone(phone)) { m.textContent = '请输入正确的11位手机号。'; return; }
    const token = getToken(widget);
    if (!token) { m.textContent = '请先完成上方的安全验证。'; return; }
    const b = $(btn);
    b.disabled = true;
    m.textContent = '正在发送验证码…';
    try {
      const res = await api('/api/members/sms-send', 'POST', { phone, purpose, turnstileToken: token });
      m.textContent = res.message;
      let n = 60;
      b.textContent = `${n}s 后重发`;
      const t = setInterval(() => {
        n -= 1;
        if (n <= 0) { clearInterval(t); b.disabled = false; b.textContent = '获取验证码'; }
        else b.textContent = `${n}s 后重发`;
      }, 1000);
    } catch (err) {
      m.textContent = err.message;
      b.disabled = false;
    } finally {
      resetToken(widget);
    }
  };
}
setupSend({ btn: '#register-send', phoneInput: '#rph', purpose: 'register', widget: 'register', msg: '#register-msg' });
setupSend({ btn: '#forgot-send', phoneInput: '#fph', purpose: 'reset', widget: 'forgot', msg: '#forgot-msg' });

$('#tab-login').onclick = () => showForm('login');
$('#tab-register').onclick = () => showForm('register');
$('#to-forgot').onclick = e => { e.preventDefault(); $('#fph').value = $('#lph').value; showForm('forgot'); };
$('#forgot-back').onclick = () => showForm('login');

$('#login-form').onsubmit = async e => {
  e.preventDefault();
  const msg = $('#login-msg');
  if (!isPhone($('#lph').value.trim())) { msg.textContent = '请输入正确的11位手机号。'; return; }
  const token = getToken('login');
  if (!token) { msg.textContent = '请先完成安全验证。'; return; }
  msg.textContent = '正在登录…';
  try {
    await api('/api/members/login', 'POST', { phone: $('#lph').value.trim(), password: $('#lp').value, turnstileToken: token });
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
  if (!isPhone($('#rph').value.trim())) { msg.textContent = '请输入正确的11位手机号。'; return; }
  if ($('#rp').value.length < 12) { msg.textContent = '密码至少 12 位。'; return; }
  if ($('#rp').value !== $('#rp2').value) { msg.textContent = '两次输入的密码不一致。'; return; }
  msg.textContent = '正在注册…';
  try {
    await api('/api/members/register', 'POST', { phone: $('#rph').value.trim(), code: $('#rc').value.trim(), password: $('#rp').value });
    $('#rp').value = $('#rp2').value = $('#rc').value = '';
    msg.textContent = '';
    if (!await loadMe()) showForm('login');
  } catch (err) {
    msg.textContent = err.message;
  }
};

$('#forgot-form').onsubmit = async e => {
  e.preventDefault();
  const msg = $('#forgot-msg');
  if (!isPhone($('#fph').value.trim())) { msg.textContent = '请输入正确的11位手机号。'; return; }
  if ($('#fp').value.length < 12) { msg.textContent = '新密码至少 12 位。'; return; }
  if ($('#fp').value !== $('#fp2').value) { msg.textContent = '两次输入的密码不一致。'; return; }
  msg.textContent = '正在重置…';
  try {
    await api('/api/members/reset', 'POST', { phone: $('#fph').value.trim(), code: $('#fc').value.trim(), password: $('#fp').value });
    $('#lph').value = $('#fph').value.trim();
    $('#fp').value = $('#fp2').value = $('#fc').value = '';
    msg.textContent = '';
    showForm('login');
    $('#login-msg').textContent = '密码已重置，请用新密码登录。';
  } catch (err) {
    msg.textContent = err.message;
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
