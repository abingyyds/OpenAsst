import { supabase } from './supabase';
import axios from 'axios';

export interface KnowledgeItem {
  id: string;
  title: string;
  keywords: string[];
  solution: string;
  commands: string[];
  category?: string;
  synced_to_github?: boolean;
  created_at?: string;
  updated_at?: string;
}

export class KnowledgeManager {
  private githubToken?: string;
  private githubRepo?: string;

  constructor(githubToken?: string, githubRepo?: string) {
    this.githubToken = githubToken || process.env.GITHUB_TOKEN;
    this.githubRepo = githubRepo || process.env.GITHUB_REPO || 'abingyyds/OpenAsst';
  }

  // 获取所有知识
  async getAllItems(): Promise<KnowledgeItem[]> {
    const { data, error } = await supabase
      .from('knowledge_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('获取知识库失败:', error);
      return [];
    }
    return data || [];
  }

  // 获取索引
  async getIndex(): Promise<{ categories: string[]; total: number }> {
    const { data } = await supabase
      .from('knowledge_items')
      .select('category');

    const categories = [...new Set((data || []).map(d => d.category))];
    return { categories, total: data?.length || 0 };
  }

  // 获取分类下的项目
  async getCategoryItems(categoryId: string): Promise<KnowledgeItem[]> {
    const { data, error } = await supabase
      .from('knowledge_items')
      .select('*')
      .eq('category', categoryId);

    if (error) return [];
    return data || [];
  }

  // 搜索知识库
  async search(query: string): Promise<KnowledgeItem[]> {
    const queryLower = query.toLowerCase();
    const { data, error } = await supabase
      .from('knowledge_items')
      .select('*');

    if (error) return [];

    return (data || []).filter(item => {
      const titleMatch = item.title?.toLowerCase().includes(queryLower);
      const keywordMatch = item.keywords?.some((k: string) => k.toLowerCase().includes(queryLower));
      const solutionMatch = item.solution?.toLowerCase().includes(queryLower);
      return titleMatch || keywordMatch || solutionMatch;
    });
  }

  // 添加知识
  async addItem(category: string, item: Omit<KnowledgeItem, 'id'>): Promise<KnowledgeItem | null> {
    const { data, error } = await supabase
      .from('knowledge_items')
      .insert({
        category,
        title: item.title,
        keywords: item.keywords || [],
        solution: item.solution,
        commands: item.commands || [],
        synced_to_github: false
      })
      .select()
      .single();

    if (error) {
      console.error('添加知识失败:', error);
      return null;
    }
    return data;
  }

  // 删除知识
  async deleteItem(category: string, id: string): Promise<boolean> {
    const { error } = await supabase
      .from('knowledge_items')
      .delete()
      .eq('id', id);

    return !error;
  }

  // AI 自动学习
  async learnFromExecution(task: string, commands: string[], result: string, success: boolean): Promise<KnowledgeItem | null> {
    if (!success) return null;

    const keywords = this.extractKeywords(task);
    const category = this.detectCategory(task, commands);

    // 检查是否已存在
    const existing = await this.search(task);
    if (existing.length > 0 && existing[0].title === task.substring(0, 100)) {
      return null;
    }

    return this.addItem(category, {
      title: task.substring(0, 100),
      keywords,
      solution: `Task: ${task}\n\nCommands:\n${commands.join('\n')}\n\nResult:\n${result.substring(0, 500)}`,
      commands
    });
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

  // 同步到 GitHub (暂时返回成功，后续实现 GitHub API)
  async syncToGitHub(): Promise<{ success: boolean; message: string }> {
    // TODO: 使用 GitHub API 同步
    return { success: true, message: 'Sync scheduled' };
  }

  // 从市场同步 (暂时返回0，后续实现)
  async syncFromMarketplace(): Promise<number> {
    // TODO: 从 script_templates 同步到 knowledge_items
    return 0;
  }
}
