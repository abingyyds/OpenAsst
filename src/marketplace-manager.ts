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

  // 搜索模板
  async searchTemplates(query: string, category?: string): Promise<ScriptTemplate[]> {
    const lowerQuery = query.toLowerCase();

    // 搜索官方模板
    const officialResults = Array.from(this.officialTemplatesMap.values()).filter(template => {
      const matchesQuery =
        template.name.toLowerCase().includes(lowerQuery) ||
        template.description.toLowerCase().includes(lowerQuery) ||
        template.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
      const matchesCategory = !category || template.category === category;
      return matchesQuery && matchesCategory && template.isPublic;
    });

    // 搜索数据库
    try {
      // 清理查询字符串，移除特殊字符
      const sanitizedQuery = query
        .replace(/[\n\r\t]/g, ' ')  // 换行符替换为空格
        .replace(/[%_\\(),'"]/g, '') // 移除SQL特殊字符
        .trim()
        .substring(0, 100); // 限制长度

      if (!sanitizedQuery) {
        return officialResults;
      }

      let dbQuery = supabase
        .from('script_templates')
        .select('*')
        .eq('is_public', true)
        .or(`name.ilike.%${sanitizedQuery}%,description.ilike.%${sanitizedQuery}%`);

      if (category) {
        dbQuery = dbQuery.eq('category', category);
      }

      const { data, error } = await dbQuery;

      if (error) {
        console.error('搜索脚本失败:', error);
        return officialResults;
      }

      const dbResults = (data || []).map(this.mapDbToTemplate);
      return [...officialResults, ...dbResults];
    } catch {
      return officialResults;
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
    return {
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
  }
}
