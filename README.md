# ACCDTool

**基于 Cloudflare Workers 的文件加速与 URL Proxy 工具**

ACCDTool 是一个轻量级 URL Proxy 服务，采用 Cloudflare Workers 单文件部署，无需购买服务器或搭建后端，即可通过 Cloudflare 全球边缘网络中转公网文件。

支持远程文件链接加速，以及 TXT、M3U、M3U8 等文本播放列表的自动解析与地址重写，让播放器直接使用加速后的链接访问资源。

## ✨ 功能特性

- **文件 URL 加速**：输入 HTTP / HTTPS 公网文件地址，自动生成加速链接。
- **边缘网络中转**：通过 Cloudflare Workers 转发远程文件请求。
- **文本源自动改写**：支持 TXT、M3U、M3U8 等文本格式。
- **智能地址解析**：自动识别文本中的相对地址和绝对地址，并转换为加速链接。
- **播放器兼容**：改写后的播放列表可直接交由支持相应格式的播放器使用。
- **访问密码保护**：支持通过 Cloudflare Secrets 配置访问密码。
- **后台访问统计**：绑定 Cloudflare KV 后，自动记录加速请求日志。
- **日志管理页面**：通过后台管理地址查看最近 200 条访问记录。
- **单文件部署**：无需构建环境，直接通过 Cloudflare Dashboard 部署。

## 🚀 部署方式

### 1. 创建 Cloudflare Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 进入 **Workers & Pages**。
3. 点击 **Create**，创建一个 Worker。
4. 将项目中的 `for_worker.js` 文件内容完整复制到 Worker 编辑器。
5. 点击 **Deploy** 完成部署。

### 2. 配置环境变量（Secrets）

ACCDTool 使用 Cloudflare Secrets 保存访问密码，不需要将密码写入代码文件。

进入：

`Worker → Settings → Variables and Secrets`

添加以下两个 Secret：

| 变量名称 | 用途 | 是否必需 |
|---|---|---|
| `TOKEN` | 普通访问密码 | 可选 |
| `ADMIN_TOKEN` | 后台管理密码 | 可选 |

**配置说明：**

- 设置 `TOKEN`：访问服务时需要提供对应密码。
- 不设置 `TOKEN`：服务公开访问，无需密码。
- 设置 `ADMIN_TOKEN`：后台使用独立管理密码。
- 不设置 `ADMIN_TOKEN`：后台管理密码默认使用 `TOKEN`。
- `TOKEN` 和 `ADMIN_TOKEN` 均未设置：后台管理功能关闭。

> Secrets 采用加密存储，密码不会直接写入 Worker 源代码，也无法通过 Dashboard 查看已保存的 Secret 明文值。

### 3. 配置 Cloudflare KV（可选）

如果需要使用后台访问统计功能，需要先创建 KV 命名空间并绑定到 Worker。

1. 进入 Cloudflare Dashboard。
2. 打开 **Storage & Databases → KV**。
3. 创建一个 KV Namespace。
4. 返回 Worker 设置页面。
5. 在 **Bindings** 中添加 KV Namespace 绑定。
6. 按照 `for_worker.js` 中使用的绑定变量名称进行配置。

完成绑定后，访问统计功能即可记录请求日志。

> 注意：KV 绑定变量名称必须与代码中实际使用的名称一致。未绑定 KV 时，依赖 KV 的日志统计功能无法正常工作。

## 🔐 访问方式

### 普通加速服务

部署完成后，通过 Worker 分配的域名访问服务。

输入需要加速的远程文件 URL，即可生成对应的加速链接。

### 后台管理

后台访问地址：

```text
https://你的Worker域名/admin?token=管理密码
```

后台支持查看最近 200 条访问记录。

**安全建议：**

- 使用独立的 `ADMIN_TOKEN`。
- 不要公开分享后台管理链接。
- 定期更换访问密码。
- 避免将包含管理密码的 URL 发布到公开仓库或日志中。

## 📄 支持格式

| 格式 | 功能 |
|---|---|
| HTTP / HTTPS 文件链接 | 远程文件代理加速 |
| TXT | 文本地址自动改写 |
| M3U | 播放列表地址自动改写 |
| M3U8 | HLS 播放列表地址自动改写 |

文本源处理支持：

- 相对路径地址转换。
- 绝对 HTTP / HTTPS 地址转换。
- 将源文件中的资源地址统一转换为 ACCDTool 加速链接。

## 📊 资源与运行成本

ACCDTool 基于 Cloudflare Workers 运行，无需自建 VPS 或独立服务器。

| 项目 | 说明 |
|---|---|
| 运行平台 | Cloudflare Workers |
| 部署方式 | 单文件部署 |
| 运行环境 | Cloudflare Edge Runtime |
| 请求额度 | 免费计划每天 100,000 次请求（以 Cloudflare 当前套餐政策为准） |
| 后台统计 | Cloudflare Workers KV（需绑定） |
| 密码存储 | Cloudflare Secrets |
| 独立服务器 | 无需 |
| 数据库 | 无需传统数据库 |

> 注意：请求次数不等于文件流量额度。实际使用还需遵守 Cloudflare Workers、KV 及相关服务的套餐限制和使用政策。

## 📁 项目结构

```text
ACCDTool/
├── for_worker.js    # Cloudflare Worker 主程序
└── README.md        # 项目使用说明
```

## ⚠️ 使用须知

1. 本项目用于合法公网文件的代理与加速，请确保拥有相应资源的访问和使用权限。
2. 文件传输仍然依赖远程源站的可用性及网络状况。
3. Cloudflare Worker 负责请求中转，不保证所有源站均支持代理访问。
4. M3U8 播放列表改写后，其分片、密钥及其他关联资源能否正常访问，取决于程序的实际处理逻辑和源站限制。
5. 大文件传输、请求超时、流量及缓存行为受 Cloudflare 平台政策约束。
6. 后台统计需要正确配置 KV，否则无法保证日志正常记录。

## 📝 License

本项目的许可证以仓库实际声明的 License 文件为准。
