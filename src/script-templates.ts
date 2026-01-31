import { ScriptTemplate } from './marketplace-types';

// 预定义的脚本模板
export const officialTemplates: ScriptTemplate[] = [
  {
    id: 'deploy-nodejs-app',
    name: '部署 Node.js 应用',
    description: '从 Git 仓库克隆并部署 Node.js 应用，使用 PM2 管理进程',
    category: 'deployment',
    tags: ['nodejs', 'pm2', 'git', 'deployment'],
    commands: [
      {
        step: 1,
        description: '检查 Node.js 是否安装',
        command: 'node --version',
        expectedExitCode: 0,
        onError: 'stop'
      },
      {
        step: 2,
        description: '检查 PM2 是否安装，如果没有则安装',
        command: 'pm2 --version || npm install -g pm2',
        onError: 'stop'
      },
      {
        step: 3,
        description: '克隆 Git 仓库',
        command: 'git clone {{repo_url}} {{app_name}}',
        onError: 'stop'
      },
      {
        step: 4,
        description: '进入项目目录并安装依赖',
        command: 'cd {{app_name}} && npm install',
        onError: 'stop'
      },
      {
        step: 5,
        description: '使用 PM2 启动应用',
        command: 'cd {{app_name}} && pm2 start {{start_script}} --name {{app_name}}',
        onError: 'stop'
      }
    ],
    parameters: [
      {
        name: 'repo_url',
        description: 'Git 仓库地址',
        type: 'string',
        required: true
      },
      {
        name: 'app_name',
        description: '应用名称',
        type: 'string',
        required: true
      },
      {
        name: 'start_script',
        description: '启动脚本（如 index.js 或 npm start）',
        type: 'string',
        required: true,
        defaultValue: 'index.js'
      }
    ],
    author: 'OpenAsst',
    isPublic: true,
    isOfficial: true,
    usageCount: 0,
    rating: 5.0,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];
