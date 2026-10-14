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

## 数据库迁移顺序

在 D1 控制台按顺序执行 `migrations/` 下的文件：`0001_init.sql` → `0002_members.sql` → `0003_contact_requests.sql` → `0004_rate_limits.sql` → `0006_phone_auth.sql` → `0007_member_photo.sql`（会员照片）。

- `0005_email_verification.sql` 是旧的邮箱验证方案，**不要执行**（已改为手机号注册，`0006` 会重建会员相关表）。
- `0006` 会清空现有会员账号，已有真实用户请先备份。
- `0003` 里的 `ALTER TABLE guests ADD COLUMN contact` 如果提示列已存在，删掉该行再执行。

## 手机号注册与短信验证（阿里云短信服务）

会员注册、找回密码使用「手机号 + 短信验证码」。验证码由服务端生成，只保存哈希，5 分钟有效，错误 5 次作废；发送前须通过 Turnstile，并有 IP、手机号、全站三层限流。

在 Cloudflare Pages 的 **Settings → Variables and Secrets** 添加：

| 变量 | 说明 |
| --- | --- |
| `ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET` | 阿里云 RAM 子账号的 AccessKey，仅授予短信服务发送权限（加密保存） |
| `SMS_SIGN_NAME` | 短信签名，默认 `周口云鸿` |
| `SMS_TEMPLATE_CODE` | 验证码模板 CODE，默认 `SMS_338955556`（模板内容：您的验证码为：${code}，请勿泄露于他人！） |
| `SMS_CODE_PARAM` | 模板里验证码变量名，默认 `code` |
| `SMS_DAILY_LIMIT` | 可选，全站每日短信上限，默认 300 |
| `PBKDF2_ITERATIONS` | 可选，免费版 CPU 超时时可调低（10000–100000） |

另需 `TURNSTILE_SECRET`、`ADMIN_TOKEN` 以及 `DB`、`PHOTOS` 绑定。修改变量后需重新部署才会生效。

## 会员资料与审核流程

1. 访客在 `member.html` 用手机号 + 短信验证码注册，设置密码。
2. 填写昵称、性别、年龄、城市、自我介绍，并**必须上传一张本人照片**（JPG/PNG/WebP，≤3MB，自动压缩）。
3. 保存后资料进入「待审核」。站长在 `/admin.html` 输入 `ADMIN_TOKEN` 后发布或拒绝；发布后在首页「嘉宾展示」公开（手机号不公开）。
4. 会员修改资料或更换照片后会重新进入待审核。会员在会员中心能看到自己的审核状态。
5. 旧的匿名「嘉宾登记」接口 `POST /api/registrations` 已停用（返回 410）。联系方式申请仍由站长转达。

照片存放在私有 R2 桶（绑定名 `PHOTOS`），通过 `/api/photos/:key` 读取：已发布的照片所有人可见，待审核的照片仅凭随机文件名访问，被拒绝的照片只有本人可见。
