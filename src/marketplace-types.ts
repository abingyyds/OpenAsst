// 命令市场的数据结构设计
import { ExecutionLog } from './types';

export interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'deployment' | 'maintenance' | 'monitoring' | 'docker' | 'custom';
  tags: string[];

  // 脚本内容
  commands: ScriptCommand[];

  // 元数据
  author: string;
  authorId?: string; // 用户ID（用户自定义脚本）
  isPublic: boolean; // 是否公开到市场
  isOfficial: boolean; // 是否官方模板

  // 使用统计
  usageCount: number;
  rating: number;

  // 参数定义
  parameters?: ScriptParameter[];

  // 环境要求
  requirements?: {
    os?: string[];
    minMemory?: number;
    requiredPackages?: string[];
  };

  createdAt: Date;
  updatedAt: Date;
}

export interface ScriptCommand {
  step: number;
  description: string;
  command: string;

  // 条件执行
  condition?: {
    type: 'os' | 'package_exists' | 'custom';
    value: string;
  };

  // 错误处理
  onError?: 'stop' | 'continue' | 'retry';
  retryCount?: number;

  // 预期结果
  expectedExitCode?: number;
  successPattern?: string; // 正则表达式匹配成功输出
}

export interface ScriptParameter {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  required: boolean;
  defaultValue?: any;
  options?: string[]; // 用于select类型
  validation?: {
    pattern?: string; // 正则表达式
    min?: number;
    max?: number;
  };
}

export interface ScriptExecution {
  id: string;
  scriptId: string;
  serverId: string;
  userId: string;

  // 执行参数
  parameters: Record<string, any>;

  // 执行状态
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;

  // 执行日志
  logs: ExecutionLog[];

  // AI辅助
  aiSuggestions?: string[];

  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}
