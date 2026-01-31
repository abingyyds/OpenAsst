export interface Config {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  tavilyApiKey?: string;
  serperApiKey?: string;
}

export interface CommandScript {
  id: string;
  name: string;
  description: string;
  commands: string[];
  category?: string;
  tags?: string[];
  documentContent?: string;
  documentType?: 'markdown' | 'text';
}

export interface ExecutionLog {
  timestamp: Date;
  command: string;
  output: string;
  exitCode: number;
  error?: string;
}

// Deploy related types
export interface DeploySource {
  type: 'url' | 'file' | 'text' | 'github';
  content: string;  // URL, file path or text content
  name?: string;    // Project name
}

export interface DeployStep {
  description: string;
  command: string;
  optional?: boolean;
  retryCount?: number;
  timeout?: number;
}

export interface DeployPlan {
  projectName: string;
  description: string;
  prerequisites: string[];
  steps: DeployStep[];
  verifyCommand?: string;
  rollbackCommands?: string[];
}

export interface DeployResult {
  success: boolean;
  projectName: string;
  stepsExecuted: number;
  totalSteps: number;
  logs: ExecutionLog[];
  errors: string[];
  duration: number;
}

// Monitor related types
export interface MonitorTarget {
  name: string;
  type: 'process' | 'port' | 'url' | 'file' | 'command';
  target: string;  // Process name, port, URL, file path or command
  interval?: number;  // Check interval (seconds)
  autoRestart?: boolean;
  restartCommand?: string;
  healthCheck?: string;
}

export interface MonitorStatus {
  target: MonitorTarget;
  healthy: boolean;
  lastCheck: Date;
  lastError?: string;
  restartCount: number;
  uptime: number;
}

export interface MonitorConfig {
  targets: MonitorTarget[];
  globalInterval?: number;
  maxRestarts?: number;
  alertOnFailure?: boolean;
}

// Error handling related types
export interface ErrorContext {
  command: string;
  output: string;
  exitCode: number;
  systemInfo: string;
  previousCommands: string[];
  projectContext?: string;
}

export interface ErrorSolution {
  analysis: string;
  fixCommands: string[];
  explanation: string;
  confidence: number;
  alternativeSolutions?: string[][];
}
