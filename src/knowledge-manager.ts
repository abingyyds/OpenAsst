import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CommandScript } from './types';

const execAsync = promisify(exec);

export interface KnowledgeItem {
  id: string;
  title: string;
  keywords: string[];
  solution: string;
  commands: string[];
  category?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  description: string;
}

export interface KnowledgeIndex {
  version: string;
  lastUpdated: string;
  categories: KnowledgeCategory[];
  files: string[];
}

export class KnowledgeManager {
  private knowledgeDir: string;
  private repoDir: string;
  private dataDir: string;
  private githubToken?: string;
  private githubRepo?: string;

  constructor(repoDir: string, githubToken?: string, githubRepo?: string, dataDir?: string) {
    this.repoDir = repoDir;
    this.knowledgeDir = path.join(repoDir, 'knowledge');
    this.dataDir = dataDir || './data';
    this.githubToken = githubToken;
    this.githubRepo = githubRepo;

    if (!fs.existsSync(this.knowledgeDir)) {
      fs.mkdirSync(this.knowledgeDir, { recursive: true });
    }
  }

  // Get index
  getIndex(): KnowledgeIndex {
    const indexPath = path.join(this.knowledgeDir, 'index.json');
    if (fs.existsSync(indexPath)) {
      return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    }
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      categories: [],
      files: []
    };
  }

  // Save index
  private saveIndex(index: KnowledgeIndex): void {
    index.lastUpdated = new Date().toISOString();
    const indexPath = path.join(this.knowledgeDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  // Get all items from a category
  getCategoryItems(categoryId: string): KnowledgeItem[] {
    const filePath = path.join(this.knowledgeDir, `${categoryId}.json`);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data.items || [];
    }
    return [];
  }

  // Get all items
  getAllItems(): KnowledgeItem[] {
    const index = this.getIndex();
    const allItems: KnowledgeItem[] = [];

    for (const file of index.files) {
      const filePath = path.join(this.knowledgeDir, file);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const items = (data.items || []).map((item: KnowledgeItem) => ({
          ...item,
          category: data.category
        }));
        allItems.push(...items);
      }
    }

    return allItems;
  }

  // Search knowledge base
  search(query: string): KnowledgeItem[] {
    const allItems = this.getAllItems();
    const queryLower = query.toLowerCase();

    return allItems.filter(item => {
      const titleMatch = item.title.toLowerCase().includes(queryLower);
      const keywordMatch = item.keywords.some(k => k.toLowerCase().includes(queryLower));
      const solutionMatch = item.solution.toLowerCase().includes(queryLower);
      return titleMatch || keywordMatch || solutionMatch;
    });
  }

  // Update index
  private updateIndex(categoryId: string): void {
    const index = this.getIndex();
    const fileName = `${categoryId}.json`;
    if (!index.files.includes(fileName)) {
      index.files.push(fileName);
    }
    this.saveIndex(index);
  }

  // Add item
  addItem(categoryId: string, item: Omit<KnowledgeItem, 'id'>): KnowledgeItem {
    const filePath = path.join(this.knowledgeDir, `${categoryId}.json`);
    let data = { category: categoryId, items: [] as KnowledgeItem[] };

    if (fs.existsSync(filePath)) {
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    const newItem: KnowledgeItem = {
      ...item,
      id: `${categoryId}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data.items.push(newItem);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    this.updateIndex(categoryId);
    return newItem;
  }

  // Delete item
  deleteItem(categoryId: string, itemId: string): boolean {
    const filePath = path.join(this.knowledgeDir, `${categoryId}.json`);
    if (!fs.existsSync(filePath)) return false;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const index = data.items.findIndex((i: KnowledgeItem) => i.id === itemId);
    if (index === -1) return false;

    data.items.splice(index, 1);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  }

  // Sync from Marketplace - 从命令市场同步到知识库
  syncFromMarketplace(): number {
    const scriptsFile = path.join(this.dataDir, 'scripts.json');
    if (!fs.existsSync(scriptsFile)) return 0;

    const scripts: CommandScript[] = JSON.parse(fs.readFileSync(scriptsFile, 'utf-8'));
    let synced = 0;

    for (const script of scripts) {
      const category = script.category || 'custom';
      const item: Omit<KnowledgeItem, 'id'> = {
        title: script.name,
        keywords: script.tags || [],
        solution: script.description + (script.documentContent ? '\n\n' + script.documentContent : ''),
        commands: script.commands || [],
        createdAt: script.createdAt,
        updatedAt: script.updatedAt
      };

      // Check if already exists
      const existing = this.getCategoryItems(category);
      const exists = existing.some(e => e.title === item.title);

      if (!exists) {
        this.addItem(category, item);
        synced++;
      }
    }

    return synced;
  }

  // AI自动学习 - 从执行结果中提取知识
  learnFromExecution(task: string, commands: string[], result: string, success: boolean): KnowledgeItem | null {
    if (!success) return null; // 只学习成功的执行

    // 提取关键词
    const keywords = this.extractKeywords(task);

    // 确定分类
    const category = this.detectCategory(task, commands);

    const item: Omit<KnowledgeItem, 'id'> = {
      title: task.substring(0, 100),
      keywords,
      solution: `Task: ${task}\n\nSolution:\n${commands.join('\n')}\n\nResult:\n${result.substring(0, 500)}`,
      commands,
      createdAt: new Date().toISOString()
    };

    // 检查是否已存在类似知识
    const existing = this.search(task);
    if (existing.length > 0 && existing[0].title === item.title) {
      return null; // 已存在
    }

    return this.addItem(category, item);
  }

  // 提取关键词
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const stopWords = ['the', 'and', 'for', 'with', 'how', 'what', 'please'];
    return [...new Set(words.filter(w => !stopWords.includes(w)))].slice(0, 10);
  }

  // 检测分类
  private detectCategory(task: string, commands: string[]): string {
    const text = (task + ' ' + commands.join(' ')).toLowerCase();

    if (text.includes('docker') || text.includes('container')) return 'docker';
    if (text.includes('nginx') || text.includes('deploy') || text.includes('pm2')) return 'deployment';
    if (text.includes('firewall') || text.includes('ssl') || text.includes('cert')) return 'security';
    if (text.includes('port') || text.includes('network') || text.includes('ping')) return 'network';
    if (text.includes('disk') || text.includes('memory') || text.includes('cpu')) return 'system';

    return 'custom';
  }

  // Sync to GitHub
  async syncToGitHub(): Promise<{ success: boolean; message: string }> {
    if (!this.githubToken || !this.githubRepo) {
      return { success: false, message: 'GitHub not configured' };
    }

    try {
      await execAsync(`cd ${this.repoDir} && git add knowledge/`);
      await execAsync(`cd ${this.repoDir} && git commit -m "Update knowledge base"`);
      await execAsync(`cd ${this.repoDir} && git push`);
      return { success: true, message: 'Synced to GitHub' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}