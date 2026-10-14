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
const reviewLabel = { pending: '审核状态：审核中，通过后将在首页公开展示。', published: '审核状态：已公开展示。', rejected: '审核状态：未通过，请修改资料或更换照片后重新保存。' };
let firstProfile = false;   // 首次保存资料 = 注册流程的最后一步
function showMember(me) {
  firstProfile = !me.nickname;
  $('#guest-view').hidden = true;
  $('#member-view').hidden = false;
  $('#member-phone').textContent = maskPhone(me.phone);
  $('#pn').value = me.nickname || '';
  $('#pg').value = me.gender || '';
  $('#pa').value = me.age || '';
  $('#pc').value = me.city || '';
  $('#pb').value = me.bio || '';
  const prev = $('#photo-preview');
  if (me.photo_key) { prev.src = `/api/photos/${encodeURIComponent(me.photo_key)}`; prev.hidden = false; } else { prev.hidden = true; prev.removeAttribute('src'); }
  $('#pp').value = '';
  $('#pp').required = !me.photo_key;   // 还没有照片时必须选择一张
  $('#review-status').textContent = me.photo_key ? (reviewLabel[me.review_status] || '') : '';
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

$('#pp').onchange = () => {
  const f = $('#pp').files[0], prev = $('#photo-preview');
  if (f && f.type.startsWith('image/')) { prev.src = URL.createObjectURL(f); prev.hidden = false; }
};
async function compressImage(file, maxDim = 1600, quality = 0.82) {
  const img = await new Promise((res, rej) => { const i = new Image(), u = URL.createObjectURL(file); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = rej; i.src = u; });
  let w = img.naturalWidth, h = img.naturalHeight;
  if (Math.max(w, h) > maxDim) { const k = maxDim / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
  return await new Promise(res => c.toBlob(res, 'image/jpeg', quality)) || file;
}

$('#profile-form').onsubmit = async e => {
  e.preventDefault();
  const msg = $('#profile-msg');
  msg.textContent = '正在保存…';
  try {
    const fd = new FormData();
    fd.set('nickname', $('#pn').value); fd.set('gender', $('#pg').value); fd.set('age', $('#pa').value); fd.set('city', $('#pc').value); fd.set('bio', $('#pb').value);
    const file = $('#pp').files[0];
    if (!file && !$('#photo-preview').getAttribute('src')) { msg.textContent = '请上传一张本人照片。'; return; }
    if (file) {
      if (!file.type.startsWith('image/')) { msg.textContent = '请上传图片格式的照片。'; return; }
      let blob; try { blob = await compressImage(file); } catch { blob = file; }
      fd.set('photo', blob, 'photo.jpg');
    }
    const r = await fetch('/api/members/profile', { method: 'PUT', body: fd });
    const result = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(result.error || '保存失败，请稍后再试。');
    if (firstProfile) {
      firstProfile = false;
      msg.textContent = '注册成功！资料已提交，站长审核通过后会公开展示。正在跳转首页…';
      $('#profile-form').querySelectorAll('button').forEach(b => b.disabled = true);
      setTimeout(() => { location.href = '/'; }, 2500);
    } else {
      msg.textContent = result.review_status === 'pending' ? '资料已保存，等待站长审核后公开。' : '资料已保存。';
      $('#review-status').textContent = reviewLabel[result.review_status] || '';
      if (result.photo_key) { $('#pp').required = false; $('#pp').value = ''; }
    }
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

loadMe().then(ok => { if (!ok) { showGuest(); if (location.hash === '#register') showForm('register'); } }).catch(() => { showGuest(); if (location.hash === '#register') showForm('register'); });
