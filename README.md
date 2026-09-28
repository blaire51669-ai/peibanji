# 陪伴记

“陪伴记”是一个简洁、浪漫、温馨的免费公益婚恋网站前端原型，能够直接托管在 GitHub Pages 或 Cloudflare Pages。未接入后端时，嘉宾登记与照片会保存在访问者自己的浏览器中，便于完整演示；不会误导用户资料已公开发布。

## 本地预览

直接双击 `index.html` 即可预览。无需构建、依赖或服务器。

## 部署到 GitHub Pages

1. 新建 GitHub 仓库，将本目录的文件提交到仓库根目录。
2. 打开仓库 **Settings → Pages**。
3. 在 **Build and deployment** 选择 **Deploy from a branch**，分支选 `main`，目录选 `/ (root)`，保存。
4. 等待发布完成，访问 GitHub 提供的 Pages 地址。

## 部署到 Cloudflare Pages

1. 在 Cloudflare Dashboard 打开 **Workers & Pages → Create application → Pages → Connect to Git**。
2. 选择该 GitHub 仓库；框架预设选择 **None**。
3. 构建命令填 `exit 0`，构建输出目录填 `.`；若项目位于仓库子目录，在 **Root directory** 中填该子目录。
4. 点击部署。之后每次推送到主分支都会自动更新。

> GitHub Pages 适合纯静态展示。要使注册资料由所有访客共享、可审核并长期保存，请使用 Cloudflare Pages + Functions/Workers 方案。

## 正式数据方案（推荐）

| 组件 | 用途 |
| --- | --- |
| Cloudflare Pages | 托管当前静态站点 |
| Pages Functions / Worker | 接收注册、校验数据、鉴权管理端 |
| D1 | 保存嘉宾文本资料与审核状态 |
| R2 | 保存照片对象；通过 Worker 生成受控访问 URL |
| Turnstile | 防机器人提交 |

建议接口：`GET /api/guests` 只返回 `status='published'` 的脱敏资料；`POST /api/registrations` 验证 Turnstile、限制频率、创建 `pending` 资料；`POST /api/uploads` 仅在完成校验后签发上传凭据或由 Worker 直接写 R2；`PATCH /api/admin/guests/:id` 需管理员登录后审核发布。前端可在 `app.js` 中把本地保存逻辑替换为这些 API 调用。

数据库示例：

```sql
CREATE TABLE guests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('男','女')),
  age INTEGER NOT NULL,
  city TEXT NOT NULL,
  bio TEXT NOT NULL,
  photo_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX guests_published ON guests(status, created_at DESC);
```

## 隐私与安全

- 默认审核后才公开；公开端不展示电话、精确地址、身份证件、聊天记录等敏感信息。
- 上传端须限制 MIME 类型、文件尺寸和像素，重编码图片以移除 EXIF/GPS；R2 桶保持私有。
- 必须配置 Turnstile、IP 限流、内容审查与管理员身份验证；不要把 D1、R2 或管理员密钥写进前端。
- 提供删除/更正入口和资料保留期限。处理个人信息前应按实际运营地咨询合规意见并发布正式隐私政策。
- 页面中的样例嘉宾均为演示内容；上线前请替换或删除。

## 项目结构

```
index.html   页面结构
styles.css   响应式样式
app.js       演示数据、本地登记、照片预览和筛选
```

## 管理员审核功能

项目内置 `functions/`，Cloudflare Pages 会在部署时识别这些 Functions。创建 D1 数据库及私有 R2 桶后，在 Pages 的 **Settings → Bindings** 中分别绑定为 `DB` 和 `PHOTOS`；再将 `migrations/0001_init.sql` 导入 D1。在 **Variables and Secrets** 添加加密变量 `TURNSTILE_SECRET` 与随机强密码 `ADMIN_TOKEN`。

创建 Turnstile widget 后，将其公开 Site Key 填入 `index.html` 中 `PEIBANJI_TURNSTILE_SITEKEY`。重新部署后，用户资料会进入待审核队列；站长访问 `/admin.html` 并输入 `ADMIN_TOKEN`，可发布或拒绝资料。令牌绝不可写进公开网页、分享或保存到浏览器。
