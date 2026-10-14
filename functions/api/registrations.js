// 已停用：嘉宾资料统一通过「会员注册」（手机验证 + 必传照片）提交，不再接受匿名登记
export async function onRequestPost() { return Response.json({ error: '请先注册会员并完善资料（含照片）。' }, { status: 410 }); }
