const authorized=(request,env)=>!!env.ADMIN_TOKEN&&request.headers.get('Authorization')===`Bearer ${env.ADMIN_TOKEN}`;
export async function onRequestGet({request,env,params}) {
  if(!authorized(request,env))return new Response('Unauthorized',{status:401});
  const key=params.key;
  const row=await env.DB.prepare('SELECT 1 AS ok FROM member_photos WHERE photo_key=? UNION SELECT 1 FROM guests WHERE photo_key=?').bind(key,key).first();
  if(!row)return new Response('Not found',{status:404});
  const object=await env.PHOTOS.get(key);
  if(!object)return new Response('Not found',{status:404});
  return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, no-store'}});
}
