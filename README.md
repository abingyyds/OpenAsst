# OpenAsst - AI驱动的服务器管理平台

一个现代化的Web服务器管理平台，集成Claude AI助手，支持多服务器管理、脚本市场、智能错误分析和实时命令执行。

## 功能特性

- **🖥️ 服务器管理**: 添加、连接和管理多台服务器（支持密码和SSH密钥认证）
- **📜 脚本市场**: 创建、分享和使用命令脚本模板，自动化运维任务
- **🤖 AI助手**: Claude AI智能分析命令执行结果，提供错误诊断和解决方案
- **💬 智能对话**: 与AI助手对话，获取服务器管理建议和命令帮助
- **⚡ 实时执行**: 支持流式响应，实时查看命令执行过程
- **🔐 用户认证**: 基于Supabase的用户认证系统
- **🎨 现代界面**: 使用Next.js 14和Tailwind CSS构建的响应式界面

## 技术栈

### 后端
- **运行时**: Node.js + TypeScript
- **框架**: Express.js 4.18.2
- **SSH连接**: ssh2 1.15.0
- **AI集成**: Anthropic Claude API (@anthropic-ai/sdk 0.32.0)
- **实时通信**: WebSocket (ws 8.16.0) + Server-Sent Events

### 前端
- **框架**: Next.js 14.1.0
- **UI库**: React 18.2.0
- **样式**: Tailwind CSS 3.4.1
- **认证**: Supabase (@supabase/supabase-js 2.39.3)
- **语言**: TypeScript 5.3.3

## 快速开始

### 前置要求

- Node.js 16+
- npm 或 yarn
- Claude API密钥（从 [Anthropic](https://console.anthropic.com/) 获取）
- Supabase项目（从 [Supabase](https://supabase.com/) 创建）

### 1. 安装依赖

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd frontend
npm install
cd ..
```

### 2. 配置环境变量

#### 后端配置 (.env)

```bash
# 已有配置文件，确保包含以下内容：
ANTHROPIC_API_KEY=your_claude_api_key
ANTHROPIC_BASE_URL=https://api.anthropic.com  # 可选，使用代理时配置
PORT=3002
DATA_DIR=./data
```

#### 前端配置 (frontend/.env.local)

```bash
# 已有配置文件，确保包含以下内容：
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:3002
```

### 3. 启动应用

需要同时启动后端和前端服务：

#### 启动后端（终端1）

```bash
npm run dev
```

后端将在 `http://localhost:3002` 运行

#### 启动前端（终端2）

```bash
cd frontend
npm run dev
```

前端将在 `http://localhost:3000` 运行

### 4. 访问应用

打开浏览器访问 `http://localhost:3000`

## 使用说明

### 1. 注册/登录
- 首次使用需要注册账号
- 使用Supabase认证系统进行身份验证

### 2. 添加服务器
- 进入"服务器管理"页面
- 点击"添加服务器"按钮
- 填写服务器信息（主机、端口、用户名、认证方式）
- 支持密码认证和SSH私钥认证

### 3. 连接服务器
- 在服务器列表中点击服务器卡片
- 进入服务器终端界面
- 可以直接执行命令并查看结果

### 4. 使用脚本市场
- 进入"脚本市场"页面
- 浏览可用的脚本模板
- 点击"使用"按钮在指定服务器上执行脚本
- 也可以创建自己的脚本模板分享给其他用户

### 5. AI助手功能
- 命令执行失败时，AI会自动分析错误并提供解决方案
- 可以在聊天界面与AI对话，获取服务器管理建议
- AI可以解释命令的作用和潜在风险

## 项目结构

```
openasst/
├── src/                          # 后端源代码
│   ├── server.ts                 # Express服务器主文件
│   ├── ssh-manager.ts            # SSH连接管理
│   ├── claude-assistant.ts       # Claude AI集成
│   ├── script-executor.ts        # 脚本执行引擎
│   ├── auto-execute-stream.ts    # SSE流式执行
│   ├── session-manager.ts        # 会话管理
│   ├── marketplace-manager.ts    # 脚本市场管理
│   └── types.ts                  # TypeScript类型定义
├── frontend/                     # 前端源代码（Next.js）
│   ├── app/                      # Next.js App Router
│   │   ├── page.tsx              # 首页
│   │   ├── login/                # 登录页面
│   │   ├── register/             # 注册页面
│   │   └── dashboard/            # 仪表板
│   │       ├── page.tsx          # 仪表板首页
│   │       ├── servers/          # 服务器管理
│   │       ├── marketplace/      # 脚本市场
│   │       └── settings/         # 设置
│   ├── lib/                      # 工具库
│   │   ├── api/                  # API客户端
│   │   └── supabase.ts           # Supabase客户端
│   └── middleware.ts             # Next.js中间件
├── data/                         # 数据存储目录
│   ├── servers.json              # 服务器配置
│   └── scripts.json              # 脚本配置
├── supabase/                     # Supabase配置
├── .env                          # 后端环境变量
├── frontend/.env.local           # 前端环境变量
└── package.json                  # 后端依赖配置
```

## API端点

### 服务器管理
- `GET /api/servers` - 获取服务器列表
- `POST /api/servers` - 添加服务器
- `DELETE /api/servers/:id` - 删除服务器
- `POST /api/servers/:id/connect` - 连接服务器
- `POST /api/servers/:id/disconnect` - 断开连接

### 命令执行
- `POST /api/execute` - 执行命令
- `POST /api/analyze-command` - AI分析命令

### 脚本管理
- `GET /api/scripts` - 获取脚本列表
- `POST /api/scripts` - 创建脚本
- `DELETE /api/scripts/:id` - 删除脚本
- `POST /api/scripts/:id/execute` - 执行脚本

### AI助手
- `POST /api/chat` - 与AI对话
- `GET /api/auto-execute-stream` - 流式自动执行（SSE）

## 开发命令

### 后端
```bash
npm run dev        # 开发模式（热重载）
npm run build      # 编译TypeScript
npm start          # 生产模式运行
npm run type-check # 类型检查
```

### 前端
```bash
cd frontend
npm run dev        # 开发模式
npm run build      # 构建生产版本
npm start          # 运行生产版本
npm run lint       # 代码检查
```

## 安全注意事项

- ⚠️ 服务器凭证（密码/私钥路径）存储在本地JSON文件中，请妥善保管
- ⚠️ 建议在内网环境使用，或配置防火墙规则
- ⚠️ 生产环境建议启用HTTPS和更强的身份验证
- ⚠️ 定期更新依赖包以修复安全漏洞
- ⚠️ 不要将 `.env` 文件提交到版本控制系统

## 故障排除

### 后端无法启动
- 检查端口3002是否被占用
- 确认 `.env` 文件中的 `ANTHROPIC_API_KEY` 已正确配置
- 检查 `data/` 目录是否有写入权限

### 前端无法连接后端
- 确认后端已启动并运行在3002端口
- 检查 `frontend/.env.local` 中的 `NEXT_PUBLIC_API_URL` 配置
- 查看浏览器控制台是否有CORS错误

### SSH连接失败
- 验证服务器地址、端口、用户名是否正确
- 检查SSH密钥文件路径和权限
- 确认目标服务器允许SSH连接

### Supabase认证问题
- 确认Supabase项目URL和密钥配置正确
- 检查Supabase项目是否已启用Email认证
- 查看Supabase控制台的认证日志

## 贡献

欢迎提交Issue和Pull Request！

## 许可证

MIT License

## 更新日志

### v2.0.0 (当前版本)
- ✨ 全新Next.js 14前端界面
- ✨ 集成Supabase用户认证
- ✨ 新增脚本市场功能
- ✨ 支持流式命令执行
- ✨ 改进AI对话体验
- 🔧 移除旧版HTML前端
- 🔧 优化项目结构

### v1.0.0
- 🎉 初始版本发布
- 基础服务器管理功能
- Claude AI集成
- 简单HTML前端界面
