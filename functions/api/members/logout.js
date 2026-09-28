
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function onRequestPost({request,env}){const t=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pb_session='))?.slice(11);if(t){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));await env.DB.prepare('DELETE FROM member_sessions WHERE token_hash=?').bind(hex(d)).run()}return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':'pb_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'}})}
