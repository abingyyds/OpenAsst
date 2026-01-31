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

  // 同步到 GitHub
  async syncToGitHub(): Promise<{ success: boolean; message: string; synced: number }> {
    if (!this.githubToken) {
      return { success: false, message: 'GitHub token not configured', synced: 0 };
    }

    try {
      // 获取未同步的知识
      const { data: unsyncedItems } = await supabase
        .from('knowledge_items')
        .select('*')
        .eq('synced_to_github', false);

      if (!unsyncedItems || unsyncedItems.length === 0) {
        return { success: true, message: 'No items to sync', synced: 0 };
      }

      // 按分类分组
      const byCategory: Record<string, KnowledgeItem[]> = {};
      for (const item of unsyncedItems) {
        const cat = item.category || 'custom';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(item);
      }

      let totalSynced = 0;

      // 更新每个分类的文件
      for (const [category, items] of Object.entries(byCategory)) {
        const synced = await this.updateGitHubFile(category, items);
        if (synced) totalSynced += items.length;
      }

      // 更新索引文件
      await this.updateGitHubIndex();

      return { success: true, message: `Synced ${totalSynced} items`, synced: totalSynced };
    } catch (error: any) {
      console.error('GitHub sync failed:', error);
      return { success: false, message: error.message, synced: 0 };
    }
  }

  // 从市场同步 script_templates 到 knowledge_items
  async syncFromMarketplace(): Promise<number> {
    try {
      // 1. 获取所有公开的 script_templates
      const { data: scripts, error: fetchError } = await supabase
        .from('script_templates')
        .select('*')
        .eq('is_public', true);

      if (fetchError || !scripts) {
        console.error('获取脚本模板失败:', fetchError);
        return 0;
      }

      // 2. 获取已存在的 knowledge_items 标题
      const { data: existingItems } = await supabase
        .from('knowledge_items')
        .select('title');

      const existingTitles = new Set((existingItems || []).map(i => i.title));

      // 3. 转换并插入新的知识项
      let syncedCount = 0;
      for (const script of scripts) {
        // 跳过已存在的
        if (existingTitles.has(script.name)) continue;

        // 转换格式
        const knowledgeItem = {
          title: script.name,
          keywords: script.tags || [],
          solution: script.document_content || script.description || '',
          commands: script.commands || [],
          category: script.category || 'custom',
          synced_to_github: false
        };

        const { error: insertError } = await supabase
          .from('knowledge_items')
          .insert(knowledgeItem);

        if (!insertError) {
          syncedCount++;
        }
      }

      console.log(`从市场同步了 ${syncedCount} 个知识项`);
      return syncedCount;
    } catch (error) {
      console.error('市场同步失败:', error);
      return 0;
    }
  }

  // 更新 GitHub 文件
  private async updateGitHubFile(category: string, newItems: KnowledgeItem[]): Promise<boolean> {
    const filePath = `knowledge/${category}.json`;
    const [owner, repo] = this.githubRepo!.split('/');

    try {
      // 1. 获取现有文件内容和 SHA
      let existingItems: any[] = [];
      let sha: string | undefined;

      try {
        const getRes = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
          { headers: { Authorization: `token ${this.githubToken}` } }
        );
        sha = getRes.data.sha;
        const content = Buffer.from(getRes.data.content, 'base64').toString('utf-8');
        const parsed = JSON.parse(content);
        existingItems = parsed.items || [];
      } catch (e: any) {
        if (e.response?.status !== 404) throw e;
      }

      // 2. 合并新旧数据
      const mergedItems = [...existingItems];
      for (const item of newItems) {
        const exists = mergedItems.some(e => e.title === item.title);
        if (!exists) {
          mergedItems.push({
            id: item.id,
            title: item.title,
            keywords: item.keywords,
            solution: item.solution,
            commands: item.commands
          });
        }
      }

      // 3. 创建文件内容
      const fileContent = {
        category,
        description: `${category} related knowledge`,
        items: mergedItems
      };

      // 4. 更新 GitHub
      const contentBase64 = Buffer.from(JSON.stringify(fileContent, null, 2)).toString('base64');
      await axios.put(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        {
          message: `Update ${category} knowledge`,
          content: contentBase64,
          sha
        },
        { headers: { Authorization: `token ${this.githubToken}` } }
      );

      // 5. 标记为已同步
      const ids = newItems.map(i => i.id);
      await supabase
        .from('knowledge_items')
        .update({ synced_to_github: true })
        .in('id', ids);

      return true;
    } catch (error) {
      console.error(`Failed to update ${category}:`, error);
      return false;
    }
  }

  // 更新 GitHub 索引文件
  private async updateGitHubIndex(): Promise<void> {
    const filePath = 'knowledge/index.json';
    const [owner, repo] = this.githubRepo!.split('/');

    try {
      // 获取所有分类
      const { data } = await supabase
        .from('knowledge_items')
        .select('category');

      const categories = [...new Set((data || []).map(d => d.category))];
      const files = categories.map(c => `${c}.json`);

      // 获取现有 SHA
      let sha: string | undefined;
      try {
        const getRes = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
          { headers: { Authorization: `token ${this.githubToken}` } }
        );
        sha = getRes.data.sha;
      } catch (e: any) {
        if (e.response?.status !== 404) throw e;
      }

      // 创建索引内容
      const indexContent = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        categories: categories.map(c => ({ id: c, name: c, description: `${c} knowledge` })),
        files
      };

      // 更新 GitHub
      const contentBase64 = Buffer.from(JSON.stringify(indexContent, null, 2)).toString('base64');
      await axios.put(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        { message: 'Update knowledge index', content: contentBase64, sha },
        { headers: { Authorization: `token ${this.githubToken}` } }
      );
    } catch (error) {
      console.error('Failed to update index:', error);
    }
  }
}
