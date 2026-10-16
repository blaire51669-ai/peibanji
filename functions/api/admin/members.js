const authorized=(request,env)=>!!env.ADMIN_TOKEN&&request.headers.get('Authorization')===`Bearer ${env.ADMIN_TOKEN}`;
// 管理员查看全部注册会员（含手机号、资料、照片、审核状态；包括尚未完善资料的会员）
export async function onRequestGet({request,env}) {
  if(!authorized(request,env))return new Response('Unauthorized',{status:401});
  const {results=[]}=await env.DB.prepare(
    `SELECT m.id,m.phone,m.created_at,p.nickname,p.gender,p.age,p.city,p.bio,p.education,p.height,p.weight,p.marriage_status,p.photo_visibility,p.photo_key,g.status AS review_status
     FROM members m LEFT JOIN member_profiles p ON p.member_id=m.id LEFT JOIN guests g ON g.id=m.id
     ORDER BY m.created_at DESC`).all();
  for(const m of results){const p=await env.DB.prepare('SELECT photo_key FROM member_photos WHERE member_id=? ORDER BY sort_order').bind(m.id).all();m.photos=(p.results||[]).map(x=>x.photo_key)}
  return Response.json(results);
}
