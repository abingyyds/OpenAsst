import { ScriptTemplate } from './marketplace-types';
import { officialTemplates } from './script-templates';
import { supabase } from './supabase';

export class MarketplaceManager {
  private officialTemplatesMap: Map<string, ScriptTemplate> = new Map();

  constructor() {
    // 加载官方模板到内存
    officialTemplates.forEach(template => {
      this.officialTemplatesMap.set(template.id, template);
    });
  }

  // 获取所有模板（官方 + 数据库）
  async getAllTemplates(): Promise<ScriptTemplate[]> {
    const official = Array.from(this.officialTemplatesMap.values());

    try {
      const { data, error } = await supabase
        .from('script_templates')
        .select('*')
        .eq('is_public', true);

      if (error) {
        console.error('获取脚本模板失败:', error);
        return official;
      }

      const dbTemplates = (data || []).map(this.mapDbToTemplate);
      return [...official, ...dbTemplates];
    } catch (err) {
      console.error('数据库连接失败:', err);
      return official;
    }
  }

  // 获取单个模板
  async getTemplate(id: string): Promise<ScriptTemplate | undefined> {
    // 先检查官方模板
    if (this.officialTemplatesMap.has(id)) {
      return this.officialTemplatesMap.get(id);
    }

    // 从数据库查询
    try {
      const { data, error } = await supabase
        .from('script_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return undefined;
      return this.mapDbToTemplate(data);
    } catch {
      return undefined;
    }
  }

  // 提取搜索关键词
  private extractKeywords(query: string): string[] {
    // 移除常见前缀和后缀
    let cleaned = query
      .replace(/^Execute script:\s*/i, '')
      .replace(/^执行脚本:\s*/i, '')
      .replace(/安装教程|安装指南|installation guide|tutorial/gi, '')
      .replace(/安装|install|部署|deploy|配置|setup/gi, '')
      .trim();

    // 分词
    const words = cleaned.split(/[\s,，、]+/).filter(w => w.length > 0);

    // 去重并返回
    return [...new Set(words.map(w => w.toLowerCase()))];
  }

  // 计算匹配分数
  private calculateMatchScore(template: ScriptTemplate, keywords: string[]): number {
    let score = 0;
    const name = template.name.toLowerCase();
    const desc = template.description.toLowerCase();
    const docContent = ((template as any).documentContent || '').toLowerCase();
    const tags = template.tags.map(t => t.toLowerCase());

    for (const keyword of keywords) {
      // 名称完全匹配 +10
      if (name === keyword) score += 10;
      // 名称包含关键词 +5
      else if (name.includes(keyword)) score += 5;

      // 标签匹配 +4
      if (tags.some(tag => tag.includes(keyword) || keyword.includes(tag))) score += 4;

      // 描述匹配 +2
      if (desc.includes(keyword)) score += 2;

      // 文档内容匹配 +3
      if (docContent.includes(keyword)) score += 3;
    }

    return score;
  }

  // 搜索模板
  async searchTemplates(query: string, category?: string): Promise<ScriptTemplate[]> {
    const keywords = this.extractKeywords(query);
    const lowerQuery = query.toLowerCase();

    // 搜索官方模板
    const officialResults: Array<{ template: ScriptTemplate; score: number }> = [];
    for (const template of this.officialTemplatesMap.values()) {
      if (!template.isPublic) continue;
      if (category && template.category !== category) continue;

      const score = this.calculateMatchScore(template, keywords);
      // 也检查原始查询
      const directMatch =
        template.name.toLowerCase().includes(lowerQuery) ||
        template.description.toLowerCase().includes(lowerQuery) ||
        template.tags.some(tag => tag.toLowerCase().includes(lowerQuery));

      if (score > 0 || directMatch) {
        officialResults.push({ template, score: directMatch ? score + 5 : score });
      }
    }

    // 搜索数据库
    try {
      // 清理查询字符串，移除特殊字符
      const sanitizedQuery = query
        .replace(/[\n\r\t]/g, ' ')
        .replace(/[%_\\(),'"]/g, '')
        .trim()
        .substring(0, 100);

      if (!sanitizedQuery && keywords.length === 0) {
        return officialResults.sort((a, b) => b.score - a.score).map(r => r.template);
      }

      // 构建多个搜索条件
      const searchTerms = [sanitizedQuery, ...keywords].filter(t => t.length > 0);
      const orConditions = searchTerms.flatMap(term => [
        `name.ilike.%${term}%`,
        `description.ilike.%${term}%`,
        `document_content.ilike.%${term}%`
      ]).join(',');

      let dbQuery = supabase
        .from('script_templates')
        .select('*')
        .eq('is_public', true);

      if (orConditions) {
        dbQuery = dbQuery.or(orConditions);
      }

      if (category) {
        dbQuery = dbQuery.eq('category', category);
      }

      const { data, error } = await dbQuery;

      if (error) {
        console.error('搜索脚本失败:', error);
        return officialResults.sort((a, b) => b.score - a.score).map(r => r.template);
      }

      // 计算数据库结果的分数
      const dbResults: Array<{ template: ScriptTemplate; score: number }> = [];
      for (const item of data || []) {
        const template = this.mapDbToTemplate(item);
        (template as any).documentContent = item.document_content;
        const score = this.calculateMatchScore(template, keywords);
        dbResults.push({ template, score });
      }

      // 合并并排序
      const allResults = [...officialResults, ...dbResults];
      return allResults.sort((a, b) => b.score - a.score).map(r => r.template);
    } catch {
      return officialResults.sort((a, b) => b.score - a.score).map(r => r.template);
    }
  }

  // 创建新脚本
  async createTemplate(template: Partial<ScriptTemplate>, userId?: string): Promise<ScriptTemplate | null> {
    try {
      const { data, error } = await supabase
        .from('script_templates')
        .insert({
          name: template.name,
          description: template.description,
          category: template.category || 'custom',
          tags: template.tags || [],
          commands: template.commands || [],
          author: template.author,
          user_id: userId,
          is_public: template.isPublic ?? true,
          like_count: 0,
          usage_count: 0
        })
        .select()
        .single();

      if (error) {
        console.error('创建脚本失败:', error);
        return null;
      }

      return this.mapDbToTemplate(data);
    } catch (err) {
      console.error('创建脚本异常:', err);
      return null;
    }
  }

  // 更新脚本
  async updateTemplate(id: string, updates: Partial<ScriptTemplate>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('script_templates')
        .update({
          name: updates.name,
          description: updates.description,
          category: updates.category,
          tags: updates.tags,
          commands: updates.commands,
          is_public: updates.isPublic,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      return !error;
    } catch {
      return false;
    }
  }

  // 删除脚本
  async deleteTemplate(id: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('script_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      return !error;
    } catch {
      return false;
    }
  }

  // 增加使用次数
  async incrementUsage(id: string): Promise<void> {
    try {
      await supabase.rpc('increment_usage_count', { script_id: id });
    } catch (err) {
      console.error('增加使用次数失败:', err);
    }
  }

  // 点赞
  async likeScript(scriptId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('script_likes')
        .insert({ script_id: scriptId, user_id: userId });

      if (!error) {
        // 更新点赞数
        await supabase.rpc('increment_like_count', { script_id: scriptId });
      }
      return !error;
    } catch {
      return false;
    }
  }

  // 取消点赞
  async unlikeScript(scriptId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('script_likes')
        .delete()
        .eq('script_id', scriptId)
        .eq('user_id', userId);

      if (!error) {
        await supabase.rpc('decrement_like_count', { script_id: scriptId });
      }
      return !error;
    } catch {
      return false;
    }
  }

  // 检查是否已点赞
  async hasLiked(scriptId: string, userId: string): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('script_likes')
        .select('id')
        .eq('script_id', scriptId)
        .eq('user_id', userId)
        .single();

      return !!data;
    } catch {
      return false;
    }
  }

  // 数据库记录转换为 ScriptTemplate
  private mapDbToTemplate(data: any): ScriptTemplate {
    const template: any = {
      id: data.id,
      name: data.name,
      description: data.description || '',
      category: data.category || 'custom',
      tags: data.tags || [],
      commands: data.commands || [],
      author: data.author || 'Anonymous',
      authorId: data.user_id,
      isPublic: data.is_public ?? true,
      isOfficial: false,
      usageCount: data.usage_count || 0,
      rating: 0,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
    // 添加文档内容
    if (data.document_content) {
      template.documentContent = data.document_content;
    }
    return template as ScriptTemplate;
  }
}
