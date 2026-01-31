import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { ConnectionManager } from './connection-manager';
import { ClaudeAssistant } from './claude-assistant';
import { ScriptExecutor } from './script-executor';
import { SessionManager } from './session-manager';
import { AutoExecuteStream } from './auto-execute-stream';
import { MarketplaceManager } from './marketplace-manager';
import { SearchService } from './search-service';
import { KnowledgeManager } from './knowledge-manager';
import { ServerConfig, CommandScript, Like, Statistics, Favorite, Rating } from './types';
import { supabase } from './supabase';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const dataDir = process.env.DATA_DIR || './data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const connectionManager = new ConnectionManager();
const searchService = new SearchService(
  dataDir,
  process.env.TAVILY_API_KEY,
  process.env.SERPER_API_KEY
);
const claudeAssistant = new ClaudeAssistant(
  process.env.ANTHROPIC_API_KEY || '',
  process.env.ANTHROPIC_BASE_URL || undefined,
  process.env.ANTHROPIC_MODEL || undefined,
  searchService
);
const scriptExecutor = new ScriptExecutor(connectionManager, claudeAssistant);

const sessionManager = new SessionManager(dataDir);
const marketplaceManager = new MarketplaceManager();
const knowledgeManager = new KnowledgeManager(
  process.env.GITHUB_TOKEN,
  process.env.GITHUB_REPO
);

// All data is now stored in Supabase database

// Helper function to convert DB server to ServerConfig
function dbToServerConfig(server: any): ServerConfig {
  return {
    id: server.id,
    name: server.name,
    connectionType: server.connection_type,
    host: server.host,
    port: server.port,
    username: server.username,
    authType: server.auth_type,
    password: server.encrypted_password,
    privateKey: server.encrypted_private_key,
    containerName: server.container_name,
    containerId: server.container_id,
    podName: server.pod_name,
    namespace: server.namespace,
    distributionName: server.distribution_name
  };
}

// Helper function to get server by ID from Supabase
async function getServerById(serverId: string): Promise<ServerConfig | null> {
  const { data, error } = await supabase
    .from('servers')
    .select('*')
    .eq('id', serverId)
    .single();

  if (error || !data) return null;
  return dbToServerConfig(data);
}

// Helper function to get statistics from database
async function getStatistics(): Promise<Statistics> {
  const [serversResult, scriptsResult] = await Promise.all([
    supabase.from('servers').select('id', { count: 'exact' }),
    supabase.from('script_templates').select('id', { count: 'exact' })
  ]);

  return {
    totalServers: serversResult.count || 0,
    totalScripts: scriptsResult.count || 0,
    totalExecutions: 0,
    totalAiInteractions: 0,
    currentModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    lastUpdated: new Date().toISOString()
  };
}

// API Routes

// Check if server has default API configured
app.get('/api/config/status', (req, res) => {
  const hasDefaultApi = !!process.env.ANTHROPIC_API_KEY;
  const defaultModel = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  const defaultBaseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

  res.json({
    hasDefaultApi,
    defaultModel: hasDefaultApi ? defaultModel : null,
    defaultBaseUrl: hasDefaultApi ? defaultBaseUrl : null,
    message: hasDefaultApi
      ? 'Server has default API configured. You can use AI features without your own API key.'
      : 'No default API configured. Please provide your own API key in settings.'
  });
});

// Get available Claude models (with optional API key validation)
app.post('/api/models/fetch', async (req, res) => {
  try {
    const { apiKey, baseUrl } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: '请提供API Key'
      });
    }

    // 去除baseUrl末尾的斜杠
    let cleanBaseUrl = baseUrl;
    if (cleanBaseUrl && cleanBaseUrl.endsWith('/')) {
      cleanBaseUrl = cleanBaseUrl.slice(0, -1);
    }

    // 从API获取模型列表
    const modelsUrl = cleanBaseUrl
      ? `${cleanBaseUrl}/v1/models`
      : 'https://api.anthropic.com/v1/models';

    console.log(`POST /api/models/fetch - 尝试从 ${modelsUrl} 获取模型列表`);

    const response = await fetch(modelsUrl, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    const contentType = response.headers.get('content-type');
    const responseText = await response.text();

    console.log(`POST /api/models/fetch - API响应状态: ${response.status}, Content-Type: ${contentType}`);

    if (!response.ok) {
      console.log(`POST /api/models/fetch - API返回错误: ${responseText.substring(0, 200)}`);
      return res.status(response.status).json({
        success: false,
        error: 'API调用失败',
        details: responseText.substring(0, 500)
      });
    }

    // 检查是否是JSON响应
    if (!contentType || !contentType.includes('application/json')) {
      console.log(`POST /api/models/fetch - API返回非JSON内容`);
      return res.status(500).json({
        success: false,
        error: 'API返回了非JSON内容，可能该端点不存在'
      });
    }

    const data = JSON.parse(responseText);
    console.log('POST /api/models/fetch - API返回的原始数据:', JSON.stringify(data).substring(0, 300));

    let models = [];

    if (data.data && Array.isArray(data.data)) {
      // OpenAI格式
      models = data.data.map((m: any) => ({
        id: m.id,
        name: m.name || m.display_name || m.id,
        description: m.description || ''
      }));
    } else if (Array.isArray(data)) {
      // 直接是数组
      models = data.map((m: any) => ({
        id: m.id || m,
        name: m.name || m.id || m,
        description: m.description || ''
      }));
    } else {
      console.log('POST /api/models/fetch - API返回的数据格式不符合预期');
      return res.status(500).json({
        success: false,
        error: 'API返回的数据格式不符合预期'
      });
    }

    console.log('POST /api/models/fetch - 成功获取模型数量:', models.length);
    console.log('POST /api/models/fetch - 返回给前端的数据:', JSON.stringify(models).substring(0, 300));

    res.json({
      success: true,
      models,
      validated: true,
      message: 'API密钥验证成功，已获取模型列表'
    });
  } catch (error: any) {
    console.log('POST /api/models/fetch - 获取模型列表异常:', error.message);
    res.status(500).json({
      success: false,
      error: '获取模型列表失败',
      details: error.message
    });
  }
});

// Get available Claude models (static list)
app.get('/api/models', async (req, res) => {
  try {
    // 从query参数或header中获取API配置
    const apiKey = (req.query.apiKey as string) || (req.headers['x-api-key'] as string) || process.env.ANTHROPIC_API_KEY;
    let baseUrl = (req.query.baseUrl as string) || (req.headers['x-api-base-url'] as string) || process.env.ANTHROPIC_BASE_URL;

    // 去除baseUrl末尾的斜杠
    if (baseUrl && baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    if (!apiKey) {
      return res.status(400).json({ error: '未配置API Key，请在设置页面配置' });
    }

    const modelsUrl = baseUrl
      ? `${baseUrl}/v1/models`
      : 'https://api.anthropic.com/v1/models';

    console.log(`GET /api/models - 尝试从 ${modelsUrl} 获取模型列表`);

    const response = await fetch(modelsUrl, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    const contentType = response.headers.get('content-type');
    const responseText = await response.text();

    console.log(`GET /api/models - API响应状态: ${response.status}, Content-Type: ${contentType}`);

    if (!response.ok) {
      console.log(`GET /api/models - API返回错误: ${responseText.substring(0, 200)}`);
      return res.status(response.status).json({
        error: 'API调用失败',
        details: responseText.substring(0, 500)
      });
    }

    // 检查是否是JSON响应
    if (!contentType || !contentType.includes('application/json')) {
      console.log(`GET /api/models - API返回非JSON内容: ${responseText.substring(0, 100)}`);
      return res.status(500).json({
        error: 'API返回了非JSON内容，可能该端点不存在',
        contentType,
        preview: responseText.substring(0, 200)
      });
    }

    const data = JSON.parse(responseText);
    console.log('GET /api/models - API返回的原始数据:', JSON.stringify(data).substring(0, 300));

    let models = [];

    if (data.data && Array.isArray(data.data)) {
      // OpenAI格式
      models = data.data.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description || ''
      }));
    } else if (Array.isArray(data)) {
      // 直接是数组
      models = data.map((m: any) => ({
        id: m.id || m,
        name: m.name || m.id || m,
        description: m.description || ''
      }));
    } else {
      console.log('GET /api/models - API返回的数据格式不符合预期');
      return res.status(500).json({
        error: 'API返回的数据格式不符合预期',
        data
      });
    }

    console.log('GET /api/models - 成功获取模型数量:', models.length);
    console.log('GET /api/models - 返回给前端的数据:', JSON.stringify(models).substring(0, 300));
    res.json(models);
  } catch (error) {
    console.log('GET /api/models - 获取模型列表异常:', (error as Error).message);
    res.status(500).json({
      error: '获取模型列表失败',
      details: (error as Error).message
    });
  }
});

// Servers API - using Supabase
app.get('/api/servers', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    let query = supabase.from('servers').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('获取服务器失败:', err);
    res.json([]);
  }
});

app.post('/api/servers', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;

    // Build insert object - only include user_id if it's a valid UUID
    const insertData: any = {
      name: req.body.name,
      connection_type: req.body.connectionType,
      host: req.body.host,
      port: req.body.port || 22,
      username: req.body.username,
      auth_type: req.body.authType,
      encrypted_password: req.body.password,
      encrypted_private_key: req.body.privateKey,
      container_name: req.body.containerName,
      container_id: req.body.containerId,
      pod_name: req.body.podName,
      namespace: req.body.namespace,
      distribution_name: req.body.distributionName,
      local_only: req.body.localOnly || false
    };

    // Only add user_id if it looks like a valid UUID
    if (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      insertData.user_id = userId;
    }

    const { data, error } = await supabase
      .from('servers')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('创建服务器失败:', error);
      throw error;
    }
    res.json(data);
  } catch (err: any) {
    console.error('创建服务器失败:', err);
    res.status(500).json({ error: '创建服务器失败: ' + (err.message || err) });
  }
});

app.delete('/api/servers/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('servers')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    connectionManager.disconnect(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('删除服务器失败:', err);
    res.status(500).json({ error: '删除服务器失败' });
  }
});

app.post('/api/servers/:id/connect', async (req, res) => {
  try {
    const { data: server, error } = await supabase
      .from('servers')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Convert DB format to ServerConfig
    const serverConfig: ServerConfig = {
      id: server.id,
      name: server.name,
      connectionType: server.connection_type,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: server.auth_type,
      password: server.encrypted_password,
      privateKey: server.encrypted_private_key,
      containerName: server.container_name,
      containerId: server.container_id,
      podName: server.pod_name,
      namespace: server.namespace,
      distributionName: server.distribution_name
    };

    await connectionManager.getExecutor(serverConfig);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Test connection without saving (for AddServerModal)
app.post('/api/servers/test-connection', async (req, res) => {
  try {
    const config = req.body;

    // Validate required fields based on connection type
    if (!config.connectionType) {
      return res.status(400).json({
        success: false,
        error: 'Connection type is required'
      });
    }

    // Validate SSH configuration
    if (config.connectionType === 'ssh') {
      if (!config.host || !config.port || !config.username) {
        return res.status(400).json({
          success: false,
          error: 'SSH connection requires host, port, and username'
        });
      }
      if (config.authType === 'password' && !config.password) {
        return res.status(400).json({
          success: false,
          error: 'Password is required for password authentication'
        });
      }
      if (config.authType === 'privateKey' && !config.privateKeyPath && !config.privateKey) {
        return res.status(400).json({
          success: false,
          error: 'Private key path or private key is required for key authentication'
        });
      }
    }

    // Validate Docker configuration
    if (config.connectionType === 'docker') {
      if (!config.containerName && !config.containerId) {
        return res.status(400).json({
          success: false,
          error: 'Docker connection requires container name or container ID'
        });
      }
    }

    // Validate Kubernetes configuration
    if (config.connectionType === 'kubernetes') {
      if (!config.podName) {
        return res.status(400).json({
          success: false,
          error: 'Kubernetes connection requires pod name'
        });
      }
    }

    // Validate WSL configuration
    if (config.connectionType === 'wsl') {
      if (!config.distributionName) {
        return res.status(400).json({
          success: false,
          error: 'WSL connection requires distribution name'
        });
      }
    }

    // Create a temporary server config with a test ID
    const testConfig: ServerConfig = {
      id: 'test-connection',
      ...config
    };

    // Test the connection by getting an executor
    const executor = await connectionManager.getExecutor(testConfig);

    // For local connections, just return success
    if (testConfig.connectionType === 'local') {
      return res.json({ success: true });
    }

    // For other connection types, try a simple test command
    try {
      await executor.execute('echo "Connection test successful"');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    } finally {
      // Clean up the test connection
      connectionManager.disconnect('test-connection');
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

app.post('/api/servers/:id/execute', async (req, res) => {
  try {
    const { command } = req.body;
    const serverId = req.params.id;

    const server = await getServerById(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // 使用 ConnectionManager 获取执行器并执行命令
    const executor = await connectionManager.getExecutor(server);
    const log = await executor.execute(command);

    // 添加命令到会话历史
    sessionManager.addCommandLog(serverId, log);

    // 如果命令失败，尝试自动调用AI分析（不阻塞主流程）
    let aiAnalysis = null;
    if (log.exitCode !== 0) {
      try {
        const session = sessionManager.getSession(serverId);
        const errorMessage = `命令执行失败：\n命令: ${command}\n错误: ${log.error || log.output}\n退出码: ${log.exitCode}`;

        const aiResponse = await claudeAssistant.chat(
          errorMessage,
          session.messages,
          session.commandHistory
        );

        // 添加系统消息和AI回复到会话
        sessionManager.addMessage(serverId, {
          role: 'system',
          content: errorMessage,
          commandContext: {
            command: log.command,
            output: log.output,
            exitCode: log.exitCode
          }
        });

        sessionManager.addMessage(serverId, {
          role: 'assistant',
          content: aiResponse
        });

        aiAnalysis = aiResponse;
      } catch (aiError) {
        // AI分析失败不应该影响命令执行结果的返回
        console.error('AI自动分析失败（不影响命令执行）:', (aiError as Error).message);
        aiAnalysis = `AI分析暂时不可用: ${(aiError as Error).message}`;
      }
    }

    res.json({ ...log, aiAnalysis });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/models', (req, res) => {
  const models = [
    // Claude 3.5 系列
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (最新)' },
    { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (旧版)' },

    // Claude 3 系列
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },

    // OpenAI 兼容模型
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },

    // 其他常见模型
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder' },
    { id: 'qwen-turbo', name: 'Qwen Turbo' },
    { id: 'qwen-plus', name: 'Qwen Plus' },
    { id: 'qwen-max', name: 'Qwen Max' },
  ];
  res.json(models);
});

// Statistics endpoint
app.get('/api/statistics', async (req, res) => {
  try {
    const stats = await getStatistics();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/models/test', async (req, res) => {
  try {
    const { apiKey, baseUrl } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API Key is required' });
    }

    // 调用 /v1/models 端点获取模型列表
    const modelsUrl = baseUrl
      ? `${baseUrl}/v1/models`
      : 'https://api.anthropic.com/v1/models';

    const response = await fetch(modelsUrl, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    let models = [];

    if (!response.ok) {
      // API返回错误，尝试解析错误信息
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json() as any;
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch {
        // 如果不是JSON，使用文本
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }

      console.log(`/v1/models API error: ${errorMessage}, falling back to default models`);

      // 降级到默认模型列表
      models = [
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
        { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
      ];
    } else {
      // 成功获取响应，解析模型列表
      const data = await response.json() as any;

      if (data.data && Array.isArray(data.data)) {
        // OpenAI格式
        models = data.data.map((m: any) => ({
          id: m.id,
          name: m.id
        }));
      } else if (Array.isArray(data)) {
        // 直接是数组
        models = data.map((m: any) => ({
          id: m.id || m,
          name: m.name || m.id || m
        }));
      } else {
        // 如果API不支持/v1/models，返回默认列表
        models = [
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
          { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
          { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
          { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
        ];
      }
    }

    res.json({ success: true, models });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'API Key验证失败: ' + (error as Error).message
    });
  }
});

app.get('/api/scripts', async (req, res) => {
  try {
    let query = supabase.from('script_templates').select('*');

    // Apply category filter
    const category = req.query.category as string;
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    // Apply sorting
    const sort = req.query.sort as string;
    if (sort === 'likes') {
      query = query.order('like_count', { ascending: false });
    } else if (sort === 'usage') {
      query = query.order('usage_count', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error('获取脚本失败:', err);
    res.json([]);
  }
});

// Search scripts by keyword (must be before :id route)
app.get('/api/scripts/search', async (req, res) => {
  try {
    const query = (req.query.q as string || '').toLowerCase();
    if (!query) {
      return res.json([]);
    }

    // Extract keywords: split by spaces and extract English words
    const words = query.split(/\s+/);
    const englishWords = query.match(/[a-zA-Z]+/g) || [];
    const allKeywords = [...new Set([...words, ...englishWords])].filter(k => k.length >= 2);

    if (allKeywords.length === 0) {
      return res.json([]);
    }

    // Build OR conditions for all keywords
    const conditions = allKeywords.map(k =>
      `name.ilike.%${k}%,description.ilike.%${k}%,document_content.ilike.%${k}%`
    ).join(',');

    const { data, error } = await supabase
      .from('script_templates')
      .select('*')
      .or(conditions)
      .limit(10);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('搜索脚本失败:', err);
    res.json([]);
  }
});

// 获取单个脚本
app.get('/api/scripts/:id', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const { data, error } = await supabase
      .from('script_templates')
      .select('*')
      .eq('id', scriptId)
      .single();

    if (error) {
      console.error('获取脚本失败:', error);
      return res.status(404).json({ error: '脚本不存在' });
    }
    res.json(data);
  } catch (err) {
    console.error('获取脚本失败:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/scripts/popular', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const { data, error } = await supabase
      .from('script_templates')
      .select('*')
      .order('like_count', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('获取热门脚本失败:', err);
    res.json([]);
  }
});

app.post('/api/scripts', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] as string;

    // Build insert object
    const insertData: any = {
      name: req.body.name,
      description: req.body.description,
      category: req.body.category || 'custom',
      tags: req.body.tags || [],
      commands: req.body.commands || [],
      author: req.body.author,
      is_public: req.body.isPublic ?? true,
      document_content: req.body.documentContent || null,
      document_type: req.body.documentContent ? 'markdown' : null,
      like_count: 0,
      usage_count: 0
    };

    // Only add user_id if valid UUID and user exists in profiles
    const finalUserId = userId || req.body.authorId;
    if (finalUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalUserId)) {
      // Check if user exists in profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', finalUserId)
        .single();

      if (profile) {
        insertData.user_id = finalUserId;
      }
    }

    console.log('Creating script with data:', JSON.stringify(insertData, null, 2));

    const { data, error } = await supabase
      .from('script_templates')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('创建脚本失败:', error);
      return res.status(500).json({ error: error.message, details: error });
    }
    res.json(data);
  } catch (err: any) {
    console.error('创建脚本失败:', err);
    res.status(500).json({ error: '创建脚本失败: ' + (err.message || err) });
  }
});

app.delete('/api/scripts/:id', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    console.log('删除脚本请求 - scriptId:', scriptId, 'userId:', userId);

    // 先检查脚本是否存在
    const { data: script, error: fetchError } = await supabase
      .from('script_templates')
      .select('id, user_id, author')
      .eq('id', scriptId)
      .single();

    if (fetchError || !script) {
      console.log('脚本不存在:', fetchError);
      return res.status(404).json({ error: '脚本不存在' });
    }

    console.log('脚本信息:', script);

    // 检查用户权限（只有创建者可以删除，或者脚本没有user_id时允许删除）
    if (script.user_id && script.user_id !== userId) {
      console.log('无权删除 - script.user_id:', script.user_id, 'userId:', userId);
      return res.status(403).json({ error: '无权删除此脚本' });
    }

    const { error } = await supabase
      .from('script_templates')
      .delete()
      .eq('id', scriptId);

    if (error) {
      console.log('删除失败:', error);
      throw error;
    }

    console.log('删除成功');
    res.json({ success: true });
  } catch (error) {
    console.error('删除脚本失败:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Like endpoints
app.post('/api/scripts/:id/like', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const visitorId = req.headers['x-user-id'] as string || `visitor_${Date.now()}`;

    // 检查是否已点赞
    const { data: existing } = await supabase
      .from('script_likes')
      .select('id')
      .eq('script_id', scriptId)
      .eq('user_id', visitorId)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Already liked' });
    }

    // 验证 visitorId 是否为有效 UUID
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitorId);
    if (!isValidUUID) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // 添加点赞
    await supabase.from('script_likes').insert({ script_id: scriptId, user_id: visitorId });

    // 更新点赞数
    await supabase.rpc('increment_like_count', { script_id: scriptId });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/scripts/:id/like', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const visitorId = req.headers['x-user-id'] as string;

    await supabase
      .from('script_likes')
      .delete()
      .eq('script_id', scriptId)
      .eq('user_id', visitorId);

    await supabase.rpc('decrement_like_count', { script_id: scriptId });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/scripts/:id/likes', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const visitorId = req.headers['x-user-id'] as string;

    // 获取点赞数
    const { data: script } = await supabase
      .from('script_templates')
      .select('like_count')
      .eq('id', scriptId)
      .single();

    // 检查用户是否已点赞
    let userHasLiked = false;
    if (visitorId) {
      const { data } = await supabase
        .from('script_likes')
        .select('id')
        .eq('script_id', scriptId)
        .eq('user_id', visitorId)
        .single();
      userHasLiked = !!data;
    }

    res.json({ likeCount: script?.like_count || 0, userHasLiked });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Favorite endpoints
app.post('/api/scripts/:id/favorite', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // 验证 userId 是否为有效 UUID
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isValidUUID) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    await supabase.from('script_favorites').insert({ script_id: scriptId, user_id: userId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/scripts/:id/favorite', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    await supabase
      .from('script_favorites')
      .delete()
      .eq('script_id', scriptId)
      .eq('user_id', userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/favorites', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get favorite script IDs
    const { data: favorites } = await supabase
      .from('script_favorites')
      .select('script_id')
      .eq('user_id', userId);

    if (!favorites || favorites.length === 0) {
      return res.json([]);
    }

    // Get the scripts
    const scriptIds = favorites.map(f => f.script_id);
    const { data: scripts } = await supabase
      .from('script_templates')
      .select('*')
      .in('id', scriptIds);

    res.json(scripts || []);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Rating endpoints
app.post('/api/scripts/:id/rate', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;
    const { rating } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // 验证 userId 是否为有效 UUID
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isValidUUID) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // Upsert rating
    await supabase
      .from('script_ratings')
      .upsert({ script_id: scriptId, user_id: userId, rating }, { onConflict: 'script_id,user_id' });

    // Get average rating
    const { data: ratings } = await supabase
      .from('script_ratings')
      .select('rating')
      .eq('script_id', scriptId);

    const count = ratings?.length || 0;
    const sum = ratings?.reduce((acc, r) => acc + r.rating, 0) || 0;
    const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

    res.json({ success: true, average, count, userRating: rating });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/scripts/:id/rating', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    // Get all ratings for this script
    const { data: ratings } = await supabase
      .from('script_ratings')
      .select('rating, user_id')
      .eq('script_id', scriptId);

    const count = ratings?.length || 0;
    const sum = ratings?.reduce((acc, r) => acc + r.rating, 0) || 0;
    const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

    // Get user's rating
    const userRating = userId ? ratings?.find(r => r.user_id === userId)?.rating || null : null;

    res.json({ average, count, userRating });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/scripts/:id/execute', async (req, res) => {
  try {
    const { serverId, parameters } = req.body;

    // Get script from Supabase
    const { data: script, error: scriptError } = await supabase
      .from('script_templates')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (scriptError || !script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    if (!serverId) {
      return res.status(400).json({ error: 'Server ID is required' });
    }

    // 确保服务器已连接
    const server = await getServerById(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // 获取执行器
    const executor = await connectionManager.getExecutor(server);

    // 执行脚本中的所有命令
    const logs = [];

    // 支持自定义 API 凭证
    const customApiKey = req.headers['x-api-key'] as string;
    const customBaseUrl = req.headers['x-api-base-url'] as string;
    const customModel = req.headers['x-api-model'] as string;

    const assistant = (customApiKey || customBaseUrl || customModel)
      ? new ClaudeAssistant(
          customApiKey || process.env.ANTHROPIC_API_KEY || '',
          customBaseUrl || process.env.ANTHROPIC_BASE_URL || undefined,
          customModel || undefined,
          searchService
        )
      : claudeAssistant;

    // 如果是文档模式，使用 AI 读取文档并生成命令
    if (script.documentContent) {
      try {
        // 使用 AI 分析文档内容并生成执行计划
        const aiPrompt = `Analyze the following document and extract the commands to execute. Return only the commands, one per line, no other text.

Document content:
${script.documentContent}

Extract commands:`;

        const aiResponse = await assistant.chat(aiPrompt, [], []);
        const commandsText = aiResponse.trim();
        const extractedCommands = commandsText.split('\n').filter((cmd: string) => cmd.trim() && !cmd.startsWith('#'));

        // 执行提取的命令
        for (const command of extractedCommands) {
          try {
            const log = await executor.execute(command);
            logs.push(log);
          } catch (error) {
            logs.push({
              command,
              output: (error as Error).message,
              exitCode: 1,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        logs.push({
          command: '[AI Document Analysis]',
          output: `Failed to analyze document: ${(error as Error).message}`,
          exitCode: 1,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // 命令模式：直接执行命令列表
      for (const command of script.commands) {
        try {
          const log = await executor.execute(command);
          logs.push(log);
        } catch (error) {
          logs.push({
            command,
            output: (error as Error).message,
            exitCode: 1,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Increment usage count using Supabase RPC
    await supabase.rpc('increment_usage_count', { script_id: req.params.id });

    const success = logs.every(log => log.exitCode === 0);
    res.json({ success, logs });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/ai/analyze', async (req, res) => {
  try {
    console.log('AI分析请求:', req.body);
    const { command, context } = req.body;
    const analysis = await claudeAssistant.analyzeCommand(command, context);
    console.log('AI分析成功');
    res.json({ analysis });
  } catch (error) {
    console.error('AI分析失败:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// 获取服务器会话历史
app.get('/api/sessions/:serverId', (req, res) => {
  try {
    const messages = sessionManager.getMessages(req.params.serverId);
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 发送消息给AI助手
app.post('/api/sessions/:serverId/auto-execute', async (req, res) => {
  try {
    const { task } = req.body;
    const serverId = req.params.serverId;

    // 检查是否有自定义API凭证
    const customApiKey = req.headers['x-api-key'] as string;
    const customBaseUrl = req.headers['x-api-base-url'] as string;
    const customModel = req.headers['x-api-model'] as string;

    const assistant = (customApiKey || customBaseUrl || customModel)
      ? new ClaudeAssistant(
          customApiKey || process.env.ANTHROPIC_API_KEY || '',
          customBaseUrl || process.env.ANTHROPIC_BASE_URL || undefined,
          customModel || undefined,
          searchService
        )
      : claudeAssistant;

    // 确保服务器已连接
    const server = await getServerById(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // 获取执行器
    const executor = await connectionManager.getExecutor(server);

    // 获取系统信息
    const systemInfo = await executor.execute('uname -a && cat /etc/os-release 2>/dev/null || echo "OS info not available"');

    // 搜索知识库和脚本库
    let searchContext = '';
    try {
      // 提取搜索关键词
      let searchQuery = task
        .replace(/^Execute script:\s*/i, '')
        .replace(/^执行脚本:\s*/i, '')
        .replace(/安装教程|安装指南|installation guide/gi, '')
        .trim();

      // 搜索脚本市场
      const marketplaceResults = await marketplaceManager.searchTemplates(searchQuery);
      if (marketplaceResults.length > 0) {
        const topScripts = marketplaceResults.slice(0, 3);
        searchContext += '\n\n## 从脚本库找到的相关脚本：\n';
        for (const script of topScripts) {
          const docContent = (script as any).documentContent || '';
          searchContext += `\n### ${script.name}\n`;
          searchContext += `描述: ${script.description}\n`;
          if (docContent) {
            searchContext += `文档内容:\n${docContent.substring(0, 2000)}\n`;
          }
          if (script.commands && script.commands.length > 0) {
            searchContext += `命令: ${script.commands.join('; ')}\n`;
          }
        }
      }

      // 搜索知识库和互联网
      const allResults = await searchService.searchAll(searchQuery);
      const kbResults = allResults.filter(r => r.source === 'knowledge-base').slice(0, 2);
      const internetResults = allResults.filter(r => r.source === 'internet').slice(0, 3);

      if (kbResults.length > 0) {
        searchContext += '\n\n## 从知识库找到的相关内容：\n';
        for (const result of kbResults) {
          searchContext += `\n### ${result.title}\n${result.content.substring(0, 1000)}\n`;
        }
      }

      if (internetResults.length > 0) {
        searchContext += '\n\n## 从互联网搜索到的相关内容：\n';
        for (const result of internetResults) {
          searchContext += `\n### ${result.title}\n${result.content.substring(0, 500)}\n`;
        }
      }
    } catch (searchError) {
      console.error('Search failed:', searchError);
    }

    const MAX_ITERATIONS = 10;
    const executionHistory: any[] = [];
    let currentIteration = 0;
    let taskCompleted = false;

    // 迭代执行循环
    while (currentIteration < MAX_ITERATIONS && !taskCompleted) {
      currentIteration++;

      // 构建历史记录摘要
      const historyContext = executionHistory.length > 0
        ? `\n\n之前的执行历史：\n${executionHistory.map((h, i) =>
            `第${i + 1}轮：\n命令：${h.commands.join('; ')}\n结果：${h.summary}`
          ).join('\n\n')}`
        : '';

      // 让AI分析任务并生成下一步命令
      const planPrompt = `你是一个Linux系统管理专家。用户需要完成以下任务：

任务：${task}

系统信息：
${systemInfo.output}
${searchContext}
${historyContext}

请分析任务需求，生成下一步需要执行的shell命令。

**重要**：如果上面有"从脚本库找到的相关脚本"或"从知识库找到的相关内容"，请优先参考这些内容来执行任务，这些是经过验证的解决方案。

## 执行策略：

1. **优先使用已有知识**：如果脚本库或知识库有相关内容，直接使用
2. **信息收集**：如果没有找到相关内容，再通过命令收集信息
3. **验证**：安装后验证是否成功

请以JSON格式返回：
{
  "reasoning": "你的分析和推理过程，说明为什么选择这些命令",
  "commands": ["命令1", "命令2", "命令3"],
  "expected_outcome": "预期结果",
  "is_final_step": false
}

注意：
- 每次最多返回3-5个相关命令
- 如果任务已完成，设置 is_final_step 为 true，commands 为空数组
- 第一轮必须先收集信息，不要直接安装
- 使用 jq 解析JSON（如果系统没有jq，先安装：yum install -y jq 或 apt-get install -y jq）
- 如果找不到软件，明确说明并建议用户提供更多信息`;

      const planResponse = await assistant.chat(planPrompt, [], []);

      // 解析AI的响应
      let plan;
      try {
        const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          plan = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('无法解析AI的执行计划');
        }
      } catch (error) {
        executionHistory.push({
          iteration: currentIteration,
          commands: [],
          error: '解析失败: ' + planResponse,
          summary: 'AI响应格式错误'
        });
        break;
      }

      // 检查是否是最后一步
      if (plan.is_final_step || !plan.commands || plan.commands.length === 0) {
        taskCompleted = true;
        executionHistory.push({
          iteration: currentIteration,
          reasoning: plan.reasoning,
          commands: [],
          summary: '任务完成'
        });
        break;
      }

      // 执行命令
      const commandLogs = [];
      for (const command of plan.commands) {
        try {
          const log = await executor.execute(command);
          commandLogs.push(log);
        } catch (error) {
          commandLogs.push({
            command,
            output: (error as Error).message,
            exitCode: 1,
            timestamp: new Date().toISOString()
          });
        }
      }

      // 生成本轮执行摘要
      const resultSummary = commandLogs.map(log =>
        `命令: ${log.command}\n输出: ${log.output.substring(0, 500)}${log.output.length > 500 ? '...' : ''}\n退出码: ${log.exitCode}`
      ).join('\n\n');

      executionHistory.push({
        iteration: currentIteration,
        reasoning: plan.reasoning,
        commands: plan.commands,
        commandLogs,
        summary: resultSummary,
        expected_outcome: plan.expected_outcome
      });
    }

    // 生成最终总结
    const finalSummaryPrompt = `任务：${task}

执行了 ${currentIteration} 轮操作：
${executionHistory.map((h, i) =>
  `第${i + 1}轮：
推理：${h.reasoning || '无'}
命令：${h.commands?.join('; ') || '无'}
结果：${h.summary?.substring(0, 300) || '无'}...`
).join('\n\n')}

请分析整个执行过程，判断任务是否成功完成，并给出详细总结。如果失败，说明原因和建议。`;

    const finalSummary = await assistant.chat(finalSummaryPrompt, [], []);

    // AI自动学习 - 执行成功后保存知识
    if (taskCompleted) {
      const allCommands = executionHistory.flatMap(h => h.commands || []);
      const allResults = executionHistory.map(h => h.summary || '').join('\n');
      knowledgeManager.learnFromExecution(task, allCommands, allResults, true);
    }

    res.json({
      success: taskCompleted,
      iterations: currentIteration,
      executionHistory,
      summary: finalSummary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('自动执行失败:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// 流式自动执行端点
app.post('/api/sessions/:serverId/auto-execute/stream', async (req, res) => {
  try {
    const { task, language } = req.body;
    const serverId = req.params.serverId;

    // 检查是否有自定义API凭证
    const customApiKey = req.headers['x-api-key'] as string;
    const customBaseUrl = req.headers['x-api-base-url'] as string;
    const customModel = req.headers['x-api-model'] as string;

    const assistant = (customApiKey || customBaseUrl || customModel)
      ? new ClaudeAssistant(
          customApiKey || process.env.ANTHROPIC_API_KEY || '',
          customBaseUrl || process.env.ANTHROPIC_BASE_URL || undefined,
          customModel || undefined,
          searchService
        )
      : claudeAssistant;

    // 确保服务器已连接
    const server = await getServerById(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // 获取执行器
    const executor = await connectionManager.getExecutor(server);

    // 获取系统信息
    const systemInfo = await executor.execute('uname -a && cat /etc/os-release 2>/dev/null || echo "OS info not available"');

    // 创建流式执行器并执行
    const streamExecutor = new AutoExecuteStream(connectionManager, assistant, res, marketplaceManager, searchService, sessionManager);
    await streamExecutor.execute(server, task, systemInfo, language);

  } catch (error) {
    console.error('流式自动执行失败:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Session history endpoints
app.get('/api/sessions/:serverId', (req, res) => {
  try {
    const serverId = req.params.serverId;
    const session = sessionManager.getSession(serverId);
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/sessions/:serverId', (req, res) => {
  try {
    const serverId = req.params.serverId;
    sessionManager.clearSession(serverId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/sessions/:serverId/chat', async (req, res) => {
  try {
    const { message, language } = req.body;
    const serverId = req.params.serverId;

    // 检查是否有自定义API凭证
    const customApiKey = req.headers['x-api-key'] as string;
    const customBaseUrl = req.headers['x-api-base-url'] as string;
    const customModel = req.headers['x-api-model'] as string;
    const customTavilyKey = req.headers['x-tavily-api-key'] as string;
    const customSerperKey = req.headers['x-serper-api-key'] as string;

    // 如果提供了自定义搜索API，创建自定义SearchService
    const customSearchService = (customTavilyKey || customSerperKey)
      ? new SearchService(dataDir, customTavilyKey, customSerperKey)
      : searchService;

    // 如果提供了自定义凭证，使用自定义的ClaudeAssistant
    const assistant = (customApiKey || customBaseUrl || customModel)
      ? new ClaudeAssistant(
          customApiKey || process.env.ANTHROPIC_API_KEY || '',
          customBaseUrl || process.env.ANTHROPIC_BASE_URL || undefined,
          customModel || undefined,
          customSearchService
        )
      : claudeAssistant;

    // 添加用户消息到会话
    sessionManager.addMessage(serverId, {
      role: 'user',
      content: message
    });

    // 获取会话历史和命令历史
    const session = sessionManager.getSession(serverId);
    const aiResponse = await assistant.chatWithSearch(
      message,
      session.messages,
      session.commandHistory,
      language
    );

    // 添加AI回复到会话
    sessionManager.addMessage(serverId, {
      role: 'assistant',
      content: aiResponse
    });

    res.json({
      response: aiResponse,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI聊天失败:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// 流式聊天端点
app.post('/api/sessions/:serverId/chat/stream', async (req, res) => {
  try {
    const { message, language } = req.body;
    const serverId = req.params.serverId;

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 检查是否有自定义API凭证
    const customApiKey = req.headers['x-api-key'] as string;
    const customBaseUrl = req.headers['x-api-base-url'] as string;
    const customModel = req.headers['x-api-model'] as string;
    const customTavilyKey = req.headers['x-tavily-api-key'] as string;
    const customSerperKey = req.headers['x-serper-api-key'] as string;

    // 如果提供了自定义搜索API，创建自定义SearchService
    const customSearchService = (customTavilyKey || customSerperKey)
      ? new SearchService(dataDir, customTavilyKey, customSerperKey)
      : searchService;

    const assistant = (customApiKey || customBaseUrl || customModel)
      ? new ClaudeAssistant(
          customApiKey || process.env.ANTHROPIC_API_KEY || '',
          customBaseUrl || process.env.ANTHROPIC_BASE_URL || undefined,
          customModel || undefined,
          customSearchService
        )
      : claudeAssistant;

    // 添加用户消息到会话
    sessionManager.addMessage(serverId, {
      role: 'user',
      content: message
    });

    // 获取会话历史和命令历史
    const session = sessionManager.getSession(serverId);

    let fullResponse = '';

    // 流式输出
    for await (const chunk of assistant.chatStream(message, session.messages, session.commandHistory, language)) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
    }

    // 添加完整的AI回复到会话
    sessionManager.addMessage(serverId, {
      role: 'assistant',
      content: fullResponse
    });

    // 发送完成信号
    res.write(`data: ${JSON.stringify({ chunk: '', done: true, timestamp: new Date().toISOString() })}\n\n`);
    res.end();
  } catch (error) {
    console.error('流式聊天失败:', error);
    res.write(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
    res.end();
  }
});

// ============ CLI 集成 API ============

// CLI配置文件路径
const cliConfigFile = path.join(dataDir, 'cli-config.json');

// 加载CLI配置
function loadCliConfig(): any {
  if (fs.existsSync(cliConfigFile)) {
    return JSON.parse(fs.readFileSync(cliConfigFile, 'utf-8'));
  }
  return { installed: false, configured: false };
}

// 保存CLI配置
function saveCliConfig(config: any): void {
  fs.writeFileSync(cliConfigFile, JSON.stringify(config, null, 2));
}

// 检查CLI状态
app.get('/api/cli/status', async (req, res) => {
  try {
    const config = loadCliConfig();

    // 尝试检测CLI是否安装（通过执行openasst --version）
    const { exec } = require('child_process');

    exec('openasst --version 2>/dev/null || echo "not_installed"', (error: any, stdout: string) => {
      const output = stdout.trim();
      const installed = !output.includes('not_installed') && !error;

      res.json({
        installed,
        version: installed ? output : null,
        configured: config.configured || false,
        apiKeySynced: config.apiKeySynced || false,
        lastSync: config.lastSync || null
      });
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 同步API配置到CLI
app.post('/api/cli/sync-config', async (req, res) => {
  try {
    const { apiKey, baseUrl, model } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API Key is required' });
    }

    // 保存配置到CLI配置文件
    const homeDir = require('os').homedir();
    const cliConfigPath = path.join(homeDir, '.openasst', 'config.json');
    const cliConfigDir = path.dirname(cliConfigPath);

    // 确保目录存在
    if (!fs.existsSync(cliConfigDir)) {
      fs.mkdirSync(cliConfigDir, { recursive: true });
    }

    // 写入CLI配置
    const cliConfig = {
      apiKey,
      baseUrl: baseUrl || 'https://api.anthropic.com',
      model: model || 'claude-3-5-sonnet-20241022',
      syncedAt: new Date().toISOString(),
      syncedFrom: 'frontend'
    };

    fs.writeFileSync(cliConfigPath, JSON.stringify(cliConfig, null, 2));

    // 更新本地状态
    const localConfig = loadCliConfig();
    localConfig.configured = true;
    localConfig.apiKeySynced = true;
    localConfig.lastSync = new Date().toISOString();
    saveCliConfig(localConfig);

    res.json({
      success: true,
      message: 'CLI配置已同步',
      configPath: cliConfigPath
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 通过CLI执行任务（两层架构：CLI第一层执行）
app.post('/api/cli/execute-task', async (req, res) => {
  try {
    const { task, serverId } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }

    // 获取服务器配置
    const server = await getServerById(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // 获取执行器
    const executor = await connectionManager.getExecutor(server);

    // 获取系统信息
    const systemInfo = await executor.execute('uname -a && cat /etc/os-release 2>/dev/null || echo "Unknown"');

    // 第一层：CLI风格的智能任务执行
    const taskState = {
      goal: task,
      systemInfo: systemInfo.output,
      platform: process.platform,
      executedActions: [] as any[],
      errors: [] as string[],
      isComplete: false
    };

    const MAX_ITERATIONS = 15;
    let iteration = 0;

    while (!taskState.isComplete && iteration < MAX_ITERATIONS) {
      iteration++;

      // 构建执行历史
      const historyContext = taskState.executedActions.map((a, i) =>
        `[${i + 1}] ${a.success ? 'SUCCESS' : 'FAILED'}: ${a.description}\n   Result: ${String(a.result).substring(0, 300)}`
      ).join('\n');

      // AI规划下一步
      const planPrompt = buildSmartTaskPrompt(taskState, historyContext, iteration);
      const planResponse = await claudeAssistant.chat(planPrompt, [], []);

      // 解析响应
      let plan;
      try {
        const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          plan = JSON.parse(jsonMatch[0]);
        } else {
          taskState.errors.push('无法解析AI响应');
          break;
        }
      } catch (e) {
        taskState.errors.push('JSON解析失败');
        break;
      }

      // 检查是否完成
      if (plan.isComplete || !plan.actions || plan.actions.length === 0) {
        taskState.isComplete = true;
        break;
      }

      // 执行动作
      for (const action of plan.actions) {
        const result = await executeSmartAction(action, executor, taskState);
        taskState.executedActions.push({
          ...action,
          result: result.output,
          success: result.success
        });

        if (!result.success) {
          taskState.errors.push(result.error || 'Unknown error');
        }
      }
    }

    // 返回第一层执行结果
    res.json({
      success: taskState.isComplete && taskState.errors.length === 0,
      iterations: iteration,
      executedActions: taskState.executedActions,
      errors: taskState.errors,
      systemInfo: taskState.systemInfo
    });

  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 第二层：AI解读和解决方案
app.post('/api/cli/analyze-result', async (req, res) => {
  try {
    const { task, executionResult, systemInfo, language } = req.body;

    // 检查是否有自定义API凭证
    const customApiKey = req.headers['x-api-key'] as string;
    const customBaseUrl = req.headers['x-api-base-url'] as string;
    const customModel = req.headers['x-api-model'] as string;

    const assistant = (customApiKey || customBaseUrl || customModel)
      ? new ClaudeAssistant(
          customApiKey || process.env.ANTHROPIC_API_KEY || '',
          customBaseUrl || process.env.ANTHROPIC_BASE_URL || undefined,
          customModel || undefined,
          searchService
        )
      : claudeAssistant;

    // Language instruction mapping
    const languageInstructions: { [key: string]: string } = {
      'en': 'Respond in English.',
      'zh': 'Respond in Chinese (中文回复).',
      'ja': 'Respond in Japanese (日本語で回答してください).',
      'ko': 'Respond in Korean (한국어로 답변해 주세요).',
      'es': 'Respond in Spanish (Responde en español).',
      'fr': 'Respond in French (Répondez en français).',
      'de': 'Respond in German (Antworten Sie auf Deutsch).',
      'ru': 'Respond in Russian (Отвечайте на русском языке).',
    };
    const langInstruction = language ? languageInstructions[language] || '' : '';

    const analysisPrompt = `You are a professional system administration consultant. ${langInstruction}

Please analyze the following task execution result and provide detailed interpretation and suggestions.

## User Task
${task}

## System Info
${systemInfo || 'Unknown'}

## Execution Result
${JSON.stringify(executionResult, null, 2)}

Please provide:
1. **Execution Summary**: Brief description of what was executed
2. **Result Analysis**: Analysis of each step's execution result
3. **Problem Diagnosis**: If there are errors, analyze the causes
4. **Solutions**: Provide specific steps to resolve issues
5. **Recommendations**: Optimization suggestions after task completion

Please respond in a structured way using markdown format.`;

    const analysis = await assistant.chat(analysisPrompt, [], []);

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 构建智能任务提示词
function buildSmartTaskPrompt(state: any, history: string, iteration: number): string {
  return `你是一个智能系统助手，帮助用户完成系统管理任务。

## 用户目标
${state.goal}

## 系统信息
${state.systemInfo}

## 执行历史
${history || '尚未执行任何操作'}

## 当前错误
${state.errors.length > 0 ? state.errors.join('\n') : '无'}

## 可用动作
- execute_command: 执行shell命令
- read_file: 读取文件内容
- write_file: 写入文件
- verify_task: 验证任务是否完成

## 指令
1. 分析当前状态和目标
2. 决定下一步需要执行的动作
3. 如果目标已达成，设置 isComplete 为 true
4. 对于危险操作，设置 requiresConfirmation 为 true

返回JSON格式：
{
  "reasoning": "你的分析过程",
  "isComplete": false,
  "actions": [
    {
      "type": "execute_command",
      "description": "动作描述",
      "params": { "command": "具体命令" }
    }
  ],
  "suggestions": ["后续建议"]
}

重要规则：
- 将复杂任务分解为小步骤
- 每次执行后验证结果
- 失败时尝试替代方案
- 使用正确的包管理器`;
}

// 执行智能动作
async function executeSmartAction(action: any, executor: any, state: any): Promise<any> {
  try {
    switch (action.type) {
      case 'execute_command':
        const log = await executor.execute(action.params.command);
        return {
          success: log.exitCode === 0,
          output: log.output,
          error: log.exitCode !== 0 ? log.error || log.output : null
        };

      case 'read_file':
        const readLog = await executor.execute(`cat ${action.params.path}`);
        return {
          success: readLog.exitCode === 0,
          output: readLog.output,
          error: readLog.exitCode !== 0 ? readLog.error : null
        };

      case 'write_file':
        const content = action.params.content.replace(/'/g, "'\\''");
        const writeLog = await executor.execute(`echo '${content}' > ${action.params.path}`);
        return {
          success: writeLog.exitCode === 0,
          output: 'File written successfully',
          error: writeLog.exitCode !== 0 ? writeLog.error : null
        };

      case 'verify_task':
        const verifyLog = await executor.execute(action.params.command);
        return {
          success: verifyLog.exitCode === 0,
          output: verifyLog.output,
          error: verifyLog.exitCode !== 0 ? 'Verification failed' : null
        };

      default:
        return { success: false, output: null, error: `Unknown action: ${action.type}` };
    }
  } catch (error) {
    return { success: false, output: null, error: (error as Error).message };
  }
}

// ============ Knowledge Base API ============

// Get all knowledge items
app.get('/api/knowledge', (req, res) => {
  try {
    const items = knowledgeManager.getAllItems();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Search knowledge base
app.get('/api/knowledge/search', (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: 'Query required' });
    }
    const results = knowledgeManager.search(query);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get knowledge index
app.get('/api/knowledge/index', async (req, res) => {
  try {
    const index = await knowledgeManager.getIndex();
    res.json(index);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get category items
app.get('/api/knowledge/category/:id', async (req, res) => {
  try {
    const items = await knowledgeManager.getCategoryItems(req.params.id);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add knowledge item
app.post('/api/knowledge/:category', async (req, res) => {
  try {
    const item = await knowledgeManager.addItem(req.params.category, req.body);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete knowledge item
app.delete('/api/knowledge/:category/:id', async (req, res) => {
  try {
    const success = await knowledgeManager.deleteItem(req.params.category, req.params.id);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Sync to GitHub
app.post('/api/knowledge/sync', async (req, res) => {
  try {
    const result = await knowledgeManager.syncToGitHub();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Sync from Marketplace - 从命令市场同步到知识库
app.post('/api/knowledge/sync-marketplace', async (req, res) => {
  try {
    const synced = await knowledgeManager.syncFromMarketplace();
    res.json({ success: true, synced, message: `Synced ${synced} items from marketplace` });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// AI自动学习 - 从执行结果中学习
app.post('/api/knowledge/learn', async (req, res) => {
  try {
    const { task, commands, result, success } = req.body;
    const item = await knowledgeManager.learnFromExecution(task, commands, result, success);
    if (item) {
      res.json({ success: true, learned: true, item });
    } else {
      res.json({ success: true, learned: false, message: 'Already exists or failed execution' });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GitHub README import API
app.post('/api/github/import-readmes', async (req, res) => {
  try {
    const { repos, username } = req.body;

    if (!repos || !Array.isArray(repos)) {
      return res.status(400).json({ error: 'repos array required' });
    }

    const imported: string[] = [];
    const failed: string[] = [];

    for (const repo of repos) {
      try {
        // Fetch README from GitHub
        const readmeUrl = `https://api.github.com/repos/${repo.full_name}/readme`;
        const response = await fetch(readmeUrl, {
          headers: { 'Accept': 'application/vnd.github.v3.raw' }
        });

        if (!response.ok) throw new Error('README not found');
        const readmeContent = await response.text();

        // Add to knowledge base
        await knowledgeManager.addItem('github-readme', {
          title: `${repo.name} - ${repo.description || 'GitHub Repository'}`,
          keywords: [repo.name, repo.language, username, 'github', 'readme'].filter(Boolean),
          solution: readmeContent.substring(0, 5000),
          commands: []
        });

        imported.push(repo.full_name);
      } catch (err) {
        console.error(`Failed to import ${repo.full_name}:`, err);
        failed.push(repo.full_name);
      }
    }

    res.json({ success: true, imported, failed });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);

  // 定时同步知识库到GitHub (每小时)
  setInterval(async () => {
    try {
      const result = await knowledgeManager.syncToGitHub();
      if (result.success) {
        console.log('[Auto Sync] Knowledge base synced to GitHub');
      }
    } catch (error) {
      console.error('[Auto Sync] Failed:', error);
    }
  }, 60 * 60 * 1000); // 1 hour

  // 启动时同步一次Marketplace到知识库
  knowledgeManager.syncFromMarketplace().then(synced => {
    console.log(`[Startup] Synced ${synced} items from marketplace to knowledge base`);
  });
});
