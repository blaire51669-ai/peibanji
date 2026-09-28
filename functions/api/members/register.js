
const json=(v,s=200)=>Response.json(v,{status:s});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function hash(p,s){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(p),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(s),iterations:100000,hash:'SHA-256'},k,256))}
export async function onRequestPost({request,env}){try{const {email,password}=await request.json(),e=String(email||'').trim().toLowerCase(),p=String(password||'');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)||e.length>254||p.length<12||p.length>128)return json({error:'请输入有效邮箱，密码须为12至128个字符。'},400);const salt=crypto.randomUUID(),id=crypto.randomUUID();await env.DB.prepare('INSERT INTO members(id,email,password_hash,password_salt) VALUES(?,?,?,?)').bind(id,e,await hash(p,salt),salt).run();return json({ok:true,message:'账号创建成功，请登录后完善资料。'},201)}catch{return json({error:'注册失败，邮箱可能已被使用。'},400)}}
