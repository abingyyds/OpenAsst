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
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

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
  undefined,
  searchService
);
const scriptExecutor = new ScriptExecutor(connectionManager, claudeAssistant);

const sessionManager = new SessionManager(dataDir);
const marketplaceManager = new MarketplaceManager(dataDir);
const knowledgeManager = new KnowledgeManager(
  process.env.REPO_DIR || '.',
  process.env.GITHUB_TOKEN,
  process.env.GITHUB_REPO
);

const serversFile = path.join(dataDir, 'servers.json');
const scriptsFile = path.join(dataDir, 'scripts.json');
const likesFile = path.join(dataDir, 'likes.json');
const statisticsFile = path.join(dataDir, 'statistics.json');
const favoritesFile = path.join(dataDir, 'favorites.json');
const ratingsFile = path.join(dataDir, 'ratings.json');

function loadServers(): ServerConfig[] {
  if (fs.existsSync(serversFile)) {
    const servers = JSON.parse(fs.readFileSync(serversFile, 'utf-8'));
    // 为没有 connectionType 的服务器添加默认值
    return servers.map((server: any) => {
      if (!server.connectionType) {
        // 根据配置推断连接类型
        if (server.host && server.port) {
          server.connectionType = 'ssh';
        } else if (server.containerName || server.containerId) {
          server.connectionType = 'docker';
        } else if (server.podName) {
          server.connectionType = 'kubernetes';
        } else if (server.distributionName) {
          server.connectionType = 'wsl';
        } else {
          server.connectionType = 'local';
        }
      }
      return server;
    });
  }
  return [];
}

function saveServers(servers: ServerConfig[]): void {
  fs.writeFileSync(serversFile, JSON.stringify(servers, null, 2));
}

function loadScripts(): CommandScript[] {
  if (fs.existsSync(scriptsFile)) {
    return JSON.parse(fs.readFileSync(scriptsFile, 'utf-8'));
  }
  return [];
}

function saveScripts(scripts: CommandScript[]): void {
  fs.writeFileSync(scriptsFile, JSON.stringify(scripts, null, 2));
}

// Likes management
function loadLikes(): Like[] {
  if (fs.existsSync(likesFile)) {
    return JSON.parse(fs.readFileSync(likesFile, 'utf-8'));
  }
  return [];
}

function saveLikes(likes: Like[]): void {
  fs.writeFileSync(likesFile, JSON.stringify(likes, null, 2));
}

function hasUserLiked(scriptId: string, userId: string): boolean {
  const likes = loadLikes();
  return likes.some(like => like.scriptId === scriptId && like.userId === userId);
}

function addLike(scriptId: string, userId: string): void {
  const likes = loadLikes();
  const likeId = `like_${Date.now()}_${userId}`;
  likes.push({
    id: likeId,
    scriptId,
    userId,
    createdAt: new Date().toISOString()
  });
  saveLikes(likes);

  // Update script likeCount
  const scripts = loadScripts();
  const script = scripts.find(s => s.id === scriptId);
  if (script) {
    script.likeCount = (script.likeCount || 0) + 1;
    saveScripts(scripts);
  }
}

function removeLike(scriptId: string, userId: string): void {
  const likes = loadLikes();
  const filtered = likes.filter(like => !(like.scriptId === scriptId && like.userId === userId));
  saveLikes(filtered);

  // Update script likeCount
  const scripts = loadScripts();
  const script = scripts.find(s => s.id === scriptId);
  if (script && script.likeCount && script.likeCount > 0) {
    script.likeCount = script.likeCount - 1;
    saveScripts(scripts);
  }
}

// Statistics management
function loadStatistics(): Statistics {
  if (fs.existsSync(statisticsFile)) {
    return JSON.parse(fs.readFileSync(statisticsFile, 'utf-8'));
  }
  return {
    totalServers: 0,
    totalScripts: 0,
    totalExecutions: 0,
    totalAiInteractions: 0,
    currentModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    lastUpdated: new Date().toISOString()
  };
}

function saveStatistics(stats: Statistics): void {
  stats.lastUpdated = new Date().toISOString();
  fs.writeFileSync(statisticsFile, JSON.stringify(stats, null, 2));
}

function updateStatistics(updates: Partial<Statistics>): void {
  const stats = loadStatistics();
  Object.assign(stats, updates);
  saveStatistics(stats);
}

function recalculateStatistics(): Statistics {
  const servers = loadServers();
  const scripts = loadScripts();
  const stats = loadStatistics();

  stats.totalServers = servers.length;
  stats.totalScripts = scripts.length;

  saveStatistics(stats);
  return stats;
}

function incrementScriptUsage(scriptId: string): void {
  const scripts = loadScripts();
  const script = scripts.find(s => s.id === scriptId);
  if (script) {
    script.usageCount = (script.usageCount || 0) + 1;
    saveScripts(scripts);
  }
}

function sortScripts(scripts: CommandScript[], sortBy: string): CommandScript[] {
  const sorted = [...scripts];
  switch (sortBy) {
    case 'likes':
      return sorted.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
    case 'usage':
      return sorted.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    case 'recent':
      return sorted.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
    default:
      return sorted;
  }
}

// Favorites management
function loadFavorites(): Favorite[] {
  if (fs.existsSync(favoritesFile)) {
    return JSON.parse(fs.readFileSync(favoritesFile, 'utf-8'));
  }
  return [];
}

function saveFavorites(favorites: Favorite[]): void {
  fs.writeFileSync(favoritesFile, JSON.stringify(favorites, null, 2));
}

function addFavorite(scriptId: string, userId: string): void {
  const favorites = loadFavorites();
  const favoriteId = `fav_${Date.now()}_${userId}`;
  favorites.push({
    id: favoriteId,
    scriptId,
    userId,
    createdAt: new Date().toISOString()
  });
  saveFavorites(favorites);
}

function removeFavorite(scriptId: string, userId: string): void {
  const favorites = loadFavorites();
  const filtered = favorites.filter(fav => !(fav.scriptId === scriptId && fav.userId === userId));
  saveFavorites(filtered);
}

function getUserFavorites(userId: string): string[] {
  const favorites = loadFavorites();
  return favorites.filter(fav => fav.userId === userId).map(fav => fav.scriptId);
}

// Ratings management
function loadRatings(): Rating[] {
  if (fs.existsSync(ratingsFile)) {
    return JSON.parse(fs.readFileSync(ratingsFile, 'utf-8'));
  }
  return [];
}

function saveRatings(ratings: Rating[]): void {
  fs.writeFileSync(ratingsFile, JSON.stringify(ratings, null, 2));
}

function addOrUpdateRating(scriptId: string, userId: string, rating: number): void {
  const ratings = loadRatings();
  const existingIndex = ratings.findIndex(r => r.scriptId === scriptId && r.userId === userId);

  if (existingIndex >= 0) {
    // Update existing rating
    ratings[existingIndex].rating = rating;
    ratings[existingIndex].createdAt = new Date().toISOString();
  } else {
    // Add new rating
    const ratingId = `rating_${Date.now()}_${userId}`;
    ratings.push({
      id: ratingId,
      scriptId,
      userId,
      rating,
      createdAt: new Date().toISOString()
    });
  }
  saveRatings(ratings);
}

function getUserRating(scriptId: string, userId: string): number | null {
  const ratings = loadRatings();
  const userRating = ratings.find(r => r.scriptId === scriptId && r.userId === userId);
  return userRating ? userRating.rating : null;
}

function getScriptAverageRating(scriptId: string): { average: number; count: number } {
  const ratings = loadRatings();
  const scriptRatings = ratings.filter(r => r.scriptId === scriptId);

  if (scriptRatings.length === 0) {
    return { average: 0, count: 0 };
  }

  const sum = scriptRatings.reduce((acc, r) => acc + r.rating, 0);
  const average = sum / scriptRatings.length;

  return { average: Math.round(average * 10) / 10, count: scriptRatings.length };
}

// API Routes
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

app.get('/api/servers', (req, res) => {
  const servers = loadServers();
  res.json(servers);
});

app.post('/api/servers', (req, res) => {
  const servers = loadServers();
  const newServer: ServerConfig = {
    id: Date.now().toString(),
    ...req.body,
  };
  servers.push(newServer);
  saveServers(servers);

  // Update statistics
  updateStatistics({ totalServers: servers.length });

  res.json(newServer);
});

app.delete('/api/servers/:id', (req, res) => {
  const servers = loadServers();
  const filtered = servers.filter(s => s.id !== req.params.id);
  saveServers(filtered);
  connectionManager.disconnect(req.params.id);

  // Update statistics
  updateStatistics({ totalServers: filtered.length });

  res.json({ success: true });
});

app.post('/api/servers/:id/connect', async (req, res) => {
  try {
    const servers = loadServers();
    const server = servers.find(s => s.id === req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    // 测试连接 - 获取执行器会验证配置
    await connectionManager.getExecutor(server);
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

    const servers = loadServers();
    const server = servers.find(s => s.id === serverId);
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
app.get('/api/statistics', (req, res) => {
  const stats = recalculateStatistics();
  res.json(stats);
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

app.get('/api/scripts', (req, res) => {
  let scripts = loadScripts();

  // Apply category filter
  const category = req.query.category as string;
  if (category && category !== 'all') {
    scripts = scripts.filter(s => s.category === category);
  }

  // Apply sorting
  const sort = req.query.sort as string;
  if (sort) {
    scripts = sortScripts(scripts, sort);
  }

  res.json(scripts);
});

app.get('/api/scripts/popular', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 5;
  const scripts = loadScripts();
  const sorted = sortScripts(scripts, 'likes');
  res.json(sorted.slice(0, limit));
});

app.post('/api/scripts', (req, res) => {
  const scripts = loadScripts();
  const newScript: CommandScript = {
    id: Date.now().toString(),
    ...req.body,
    usageCount: 0,
    likeCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  scripts.push(newScript);
  saveScripts(scripts);

  // Update statistics
  updateStatistics({ totalScripts: scripts.length });

  res.json(newScript);
});

app.delete('/api/scripts/:id', (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    const scripts = loadScripts();
    const script = scripts.find(s => s.id === scriptId);

    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Check if user is the author (allow deletion if no author or user matches)
    if (script.authorId && userId && script.authorId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own scripts' });
    }

    const filtered = scripts.filter(s => s.id !== scriptId);
    saveScripts(filtered);

    // Update statistics
    updateStatistics({ totalScripts: filtered.length });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Like endpoints
app.post('/api/scripts/:id/like', (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (hasUserLiked(scriptId, userId)) {
      return res.status(400).json({ error: 'Already liked' });
    }

    addLike(scriptId, userId);
    const scripts = loadScripts();
    const script = scripts.find(s => s.id === scriptId);

    res.json({ success: true, likeCount: script?.likeCount || 0 });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/scripts/:id/like', (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    removeLike(scriptId, userId);
    const scripts = loadScripts();
    const script = scripts.find(s => s.id === scriptId);

    res.json({ success: true, likeCount: script?.likeCount || 0 });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/scripts/:id/likes', (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    const scripts = loadScripts();
    const script = scripts.find(s => s.id === scriptId);
    const likeCount = script?.likeCount || 0;
    const userHasLiked = userId ? hasUserLiked(scriptId, userId) : false;

    res.json({ likeCount, userHasLiked });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Favorite endpoints
app.post('/api/scripts/:id/favorite', (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    addFavorite(scriptId, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/scripts/:id/favorite', (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    removeFavorite(scriptId, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/favorites', (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const favoriteIds = getUserFavorites(userId);
    const scripts = loadScripts();
    const favoriteScripts = scripts.filter(s => favoriteIds.includes(s.id));

    res.json(favoriteScripts);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Rating endpoints
app.post('/api/scripts/:id/rate', (req, res) => {
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

    addOrUpdateRating(scriptId, userId, rating);
    const ratingInfo = getScriptAverageRating(scriptId);

    res.json({
      success: true,
      average: ratingInfo.average,
      count: ratingInfo.count,
      userRating: rating
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/scripts/:id/rating', (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    const ratingInfo = getScriptAverageRating(scriptId);
    const userRating = userId ? getUserRating(scriptId, userId) : null;

    res.json({
      average: ratingInfo.average,
      count: ratingInfo.count,
      userRating
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/scripts/:id/execute', async (req, res) => {
  try {
    const { serverId, parameters } = req.body;
    const scripts = loadScripts();
    const script = scripts.find(s => s.id === req.params.id);

    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    if (!serverId) {
      return res.status(400).json({ error: 'Server ID is required' });
    }

    // 确保服务器已连接
    const servers = loadServers();
    const server = servers.find(s => s.id === serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // 获取执行器
    const executor = await connectionManager.getExecutor(server);

    // 执行脚本中的所有命令
    const logs = [];

    // 如果是文档模式，使用 AI 读取文档并生成命令
    if (script.documentContent) {
      try {
        // 使用 AI 分析文档内容并生成执行计划
        const aiPrompt = `请分析以下操作文档，提取出需要执行的命令列表。只返回命令，每行一个命令，不要有其他说明文字。

文档内容：
${script.documentContent}

请提取命令列表：`;

        const aiResponse = await claudeAssistant.chat(aiPrompt, [], []);
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

    // Increment usage count and update statistics
    incrementScriptUsage(req.params.id);
    const stats = loadStatistics();
    updateStatistics({ totalExecutions: stats.totalExecutions + 1 });

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
    const servers = loadServers();
    const server = servers.find(s => s.id === serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // 获取执行器
    const executor = await connectionManager.getExecutor(server);

    // 获取系统信息
    const systemInfo = await executor.execute('uname -a && cat /etc/os-release 2>/dev/null || echo "OS info not available"');

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
${historyContext}

请分析任务需求，生成下一步需要执行的shell命令。

## 信息收集策略（第一轮必须先收集信息）：

如果这是第一轮或需要更多信息，请使用以下方法收集信息：

1. **搜索GitHub仓库**：
   curl -s "https://api.github.com/search/repositories?q=软件名&sort=stars&order=desc" | jq -r '.items[0:3] | .[] | "\\(.full_name) - \\(.description) - Stars: \\(.stargazers_count)"'

2. **搜索Python包（PyPI）**：
   curl -s "https://pypi.org/pypi/包名/json" | jq -r '.info | "Name: \\(.name), Version: \\(.version), Summary: \\(.summary)"'

3. **搜索npm包**：
   curl -s "https://registry.npmjs.org/包名" | jq -r '"Name: \\(.name), Version: \\(."dist-tags".latest), Description: \\(.description)"'

4. **搜索Docker镜像**：
   curl -s "https://hub.docker.com/v2/repositories/library/镜像名/" | jq -r '"Name: \\(.name), Stars: \\(.star_count), Description: \\(.description)"'

5. **检查系统包管理器**：
   - CentOS/RHEL: yum search 软件名 || dnf search 软件名
   - Ubuntu/Debian: apt-cache search 软件名
   - 通用: which 软件名 || command -v 软件名

6. **搜索多个GitHub仓库**：
   curl -s "https://api.github.com/search/repositories?q=软件名+in:name,description&per_page=5" | jq -r '.items[] | "Repo: \\(.full_name)\\nStars: \\(.stargazers_count)\\nDesc: \\(.description)\\nClone: \\(.clone_url)\\n"'

## 执行策略：

1. **第一轮**：必须先收集信息，确认软件来源
2. **后续轮次**：根据收集到的信息执行安装
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
    const servers = loadServers();
    const server = servers.find(s => s.id === serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // 获取执行器
    const executor = await connectionManager.getExecutor(server);

    // 获取系统信息
    const systemInfo = await executor.execute('uname -a && cat /etc/os-release 2>/dev/null || echo "OS info not available"');

    // 创建流式执行器并执行
    const streamExecutor = new AutoExecuteStream(connectionManager, assistant, res, marketplaceManager);
    await streamExecutor.execute(server, task, systemInfo);

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
    const { message } = req.body;
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
      session.commandHistory
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
    const { message } = req.body;
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
    for await (const chunk of assistant.chatStream(message, session.messages, session.commandHistory)) {
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
    const servers = loadServers();
    const server = servers.find(s => s.id === serverId);
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
    const { task, executionResult, systemInfo } = req.body;

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

    const analysisPrompt = `你是一个专业的系统管理顾问。请分析以下任务执行结果，提供详细的解读和建议。

## 用户任务
${task}

## 系统信息
${systemInfo || '未知'}

## 执行结果
${JSON.stringify(executionResult, null, 2)}

请提供：
1. **执行摘要**：简要说明执行了什么操作
2. **结果分析**：分析每个步骤的执行结果
3. **问题诊断**：如果有错误，分析原因
4. **解决方案**：针对问题提供具体的解决步骤
5. **后续建议**：任务完成后的优化建议

请以结构化的方式回答，使用markdown格式。`;

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
app.get('/api/knowledge/index', (req, res) => {
  try {
    const index = knowledgeManager.getIndex();
    res.json(index);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get category items
app.get('/api/knowledge/category/:id', (req, res) => {
  try {
    const items = knowledgeManager.getCategoryItems(req.params.id);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add knowledge item
app.post('/api/knowledge/:category', (req, res) => {
  try {
    const item = knowledgeManager.addItem(req.params.category, req.body);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete knowledge item
app.delete('/api/knowledge/:category/:id', (req, res) => {
  try {
    const success = knowledgeManager.deleteItem(req.params.category, req.params.id);
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
