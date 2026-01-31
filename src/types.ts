export type ConnectionType = 'ssh' | 'local' | 'docker' | 'docker-remote' | 'kubernetes' | 'wsl';

export interface ServerConfig {
  id: string;
  name: string;
  connectionType: ConnectionType;

  // SSH 连接配置
  host?: string;
  port?: number;
  username?: string;
  authType?: 'password' | 'privateKey';
  password?: string;
  privateKey?: string;
  privateKeyPath?: string;

  // Docker 连接配置
  containerName?: string;
  containerId?: string;
  isRemoteDocker?: boolean;

  // Docker Remote API 连接配置
  dockerApiHost?: string;
  dockerApiPort?: number;
  dockerApiProtocol?: 'http' | 'https';
  dockerTlsCa?: string;
  dockerTlsCert?: string;
  dockerTlsKey?: string; // Docker是否在远程服务器上

  // Kubernetes 连接配置
  podName?: string;
  namespace?: string;
  k8sContainerName?: string; // K8s pod 中的容器名
  isRemoteKubernetes?: boolean; // Kubernetes是否在远程服务器上

  // WSL 连接配置
  distributionName?: string;

  // 远程连接配置（用于远程Docker/Kubernetes）
  remoteHost?: string;
  remotePort?: number;
  remoteUsername?: string;
  remoteAuthType?: 'password' | 'privateKey';
  remotePassword?: string;
  remotePrivateKeyPath?: string;
  remotePrivateKey?: string;

  // 通用字段
  status?: string;
}

export interface CommandScript {
  id: string;
  name: string;
  description: string;
  commands: string[];
  serverId?: string;
  category?: 'deployment' | 'maintenance' | 'monitoring' | 'docker' | 'security' | 'backup' | 'network' | 'custom';
  tags?: string[];
  author?: string;
  authorId?: string;
  isPublic?: boolean;
  isOfficial?: boolean;
  usageCount?: number;
  likeCount?: number;
  createdAt?: string;
  updatedAt?: string;

  // 文档内容支持
  documentContent?: string;  // Markdown 或纯文本文档内容
  documentType?: 'markdown' | 'text';  // 文档类型
}

export interface ExecutionLog {
  timestamp: Date;
  command: string;
  output: string;
  exitCode: number;
  error?: string;
}

export interface AIAssistantRequest {
  error: string;
  context: string;
  previousCommands: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  commandContext?: {
    command: string;
    output: string;
    exitCode: number;
  };
}

export interface ServerSession {
  serverId: string;
  messages: ChatMessage[];
  commandHistory: ExecutionLog[];
}

export interface Like {
  id: string;
  scriptId: string;
  userId: string;
  createdAt: string;
}

export interface Statistics {
  totalServers: number;
  totalScripts: number;
  totalExecutions: number;
  totalAiInteractions: number;
  currentModel: string;
  lastUpdated: string;
}

export interface Favorite {
  id: string;
  scriptId: string;
  userId: string;
  createdAt: string;
}

export interface Rating {
  id: string;
  scriptId: string;
  userId: string;
  rating: number;
  createdAt: string;
}
