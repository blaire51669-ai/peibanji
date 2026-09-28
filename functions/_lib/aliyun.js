// 阿里云短信服务（Dysmsapi）SendSms，使用官方 V3 签名（ACS3-HMAC-SHA256）
// 此文件没有 onRequest 导出，不会成为路由
const enc = new TextEncoder();
const pct = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const hexOf = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha256Hex = async bytes => hexOf(await crypto.subtle.digest('SHA-256', bytes));
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hexOf(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

// RPC 风格接口：参数放 query，body 为空。返回 query 字符串和需要发送的请求头
export async function signAcs3({ method = 'POST', host, action, version, query, accessKeyId, accessKeySecret, date, nonce }) {
  const qs = Object.keys(query).sort().map(k => `${pct(k)}=${pct(String(query[k]))}`).join('&');
  const payloadHash = await sha256Hex(enc.encode(''));
  const headers = {
    'host': host, 'x-acs-action': action, 'x-acs-content-sha256': payloadHash,
    'x-acs-date': date, 'x-acs-signature-nonce': nonce, 'x-acs-version': version
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map(n => `${n}:${headers[n].trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, '/', qs, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = `ACS3-HMAC-SHA256\n${await sha256Hex(enc.encode(canonicalRequest))}`;
  const signature = await hmacHex(accessKeySecret, stringToSign);
  return { queryString: qs, headers: { ...headers, Authorization: `ACS3-HMAC-SHA256 Credential=${accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}` } };
}

// 发送验证码短信。返回 { ok, busy }；失败原因只写日志，不写验证码
export async function sendSms(env, phone, code) {
  if (!env.ALIYUN_ACCESS_KEY_ID || !env.ALIYUN_ACCESS_KEY_SECRET) { console.error('sendSms: ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET 未配置'); return { ok: false }; }
  try {
    const query = {
      PhoneNumbers: phone,
      SignName: env.SMS_SIGN_NAME || '周口云鸿',
      TemplateCode: env.SMS_TEMPLATE_CODE || 'SMS_512570448',
      TemplateParam: JSON.stringify({ [env.SMS_CODE_PARAM || 'code']: code })
    };
    const { queryString, headers } = await signAcs3({
      host: 'dysmsapi.aliyuncs.com', action: 'SendSms', version: '2017-05-25', query,
      accessKeyId: env.ALIYUN_ACCESS_KEY_ID, accessKeySecret: env.ALIYUN_ACCESS_KEY_SECRET,
      date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), nonce: crypto.randomUUID().replace(/-/g, '')
    });
    const { host, ...sendHeaders } = headers;   // Host 由 fetch 根据网址自动带上，值与参与签名的一致
    const r = await fetch(`https://${host}/?${queryString}`, { method: 'POST', headers: sendHeaders, signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (j.Code === 'OK') return { ok: true };
    console.error('sendSms failed:', r.status, j.Code, j.Message);
    return { ok: false, busy: /BUSINESS_LIMIT_CONTROL/.test(String(j.Code || '')) };
  } catch (e) {
    console.error('sendSms error:', e && e.message);
    return { ok: false };
  }
}
