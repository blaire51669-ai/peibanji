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
let currentPhotos = [], removedPhotos = [], pendingFiles = [], pendingPreviewUrls = [];
function renderPhotos() {
  const gallery = $('#photo-gallery');
  pendingPreviewUrls.forEach(URL.revokeObjectURL); pendingPreviewUrls = [];
  const saved = currentPhotos.map(key => `<div style="position:relative"><img src="/api/photos/${encodeURIComponent(key)}" alt="我的照片" style="width:110px;height:110px;object-fit:cover;border-radius:10px"><button type="button" data-remove-photo="${key}" aria-label="删除照片" style="display:block">删除</button></div>`).join('');
  const queued = pendingFiles.map((file,i) => { const url=URL.createObjectURL(file);pendingPreviewUrls.push(url);return `<div style="position:relative"><img src="${url}" alt="待上传照片" style="width:110px;height:110px;object-fit:cover;border-radius:10px"><button type="button" data-remove-pending="${i}" aria-label="移除待上传照片" style="display:block">移除待上传</button></div>`; }).join('');
  gallery.innerHTML = saved + queued;
}
$('#photo-gallery').addEventListener('click', e => { const removeSaved=e.target.closest('[data-remove-photo]'); if(removeSaved){const key=removeSaved.dataset.removePhoto;currentPhotos=currentPhotos.filter(x=>x!==key);removedPhotos.push(key);renderPhotos();return}const removePending=e.target.closest('[data-remove-pending]');if(removePending){pendingFiles.splice(Number(removePending.dataset.removePending),1);renderPhotos()}});
function showMember(me) {
  firstProfile = !me.nickname;
  $('#browse-members').hidden = firstProfile;
  $('#guest-view').hidden = true;
  $('#member-view').hidden = false;
  $('#member-phone').textContent = maskPhone(me.phone);
  $('#pn').value = me.nickname || '';
  $('#pg').value = me.gender || '';
  $('#pa').value = me.age || '';
  $('#pc').value = me.city || '';
  $('#pb').value = me.bio || '';
  $('#ped').value = me.education || '';
  $('#ph').value = me.height || '';
  $('#pw').value = me.weight || '';
  $('#pms').value = me.marriage_status || '';
  $('#pvisibility').value = me.photo_visibility || 'public';
  currentPhotos = me.photos || (me.photo_key ? [me.photo_key] : []); removedPhotos = []; pendingFiles = []; renderPhotos();
  $('#pp').value = '';
  $('#review-status').textContent = currentPhotos.length ? (reviewLabel[me.review_status] || '') : '';
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
    msg.textContent = '登录成功，正在进入会员展示…';
    location.href = 'index.html#guests';
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
  if ($('#rp').value.length < 8) { msg.textContent = '密码至少 8 位。'; return; }
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
  if ($('#fp').value.length < 8) { msg.textContent = '新密码至少 8 位。'; return; }
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
  const incoming = [...$('#pp').files];
  const room = 3 - currentPhotos.length - pendingFiles.length;
  if (incoming.length > room) $('#profile-msg').textContent = room > 0 ? `这次最多还能添加 ${room} 张；已保留本次选择中的前 ${room} 张。` : '已达到 3 张上限，请先移除一张照片。';
  pendingFiles.push(...incoming.slice(0, Math.max(0, room)));
  $('#pp').value = '';
  renderPhotos();
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
    fd.set('nickname', $('#pn').value); fd.set('gender', $('#pg').value); fd.set('age', $('#pa').value); fd.set('city', $('#pc').value); fd.set('bio', $('#pb').value); fd.set('education', $('#ped').value); fd.set('height', $('#ph').value); fd.set('weight', $('#pw').value); fd.set('marriage_status', $('#pms').value); fd.set('photo_visibility', $('#pvisibility').value); fd.set('removed_photos', JSON.stringify(removedPhotos));
    const files = pendingFiles;
    if (currentPhotos.length + files.length < 1) { msg.textContent = '请至少保留一张本人照片。'; return; }
    if (currentPhotos.length + files.length > 3) { msg.textContent = '最多只能保留 3 张照片。'; return; }
    for (const file of files) {
      if (!file.type.startsWith('image/')) { msg.textContent = '请上传图片格式的照片。'; return; }
      let blob; try { blob = await compressImage(file); } catch { blob = file; }
      fd.append('photos', blob, 'photo.jpg');
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
      if (result.photos) currentPhotos = result.photos;
      removedPhotos = []; pendingFiles = []; renderPhotos(); $('#pp').value = '';
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
