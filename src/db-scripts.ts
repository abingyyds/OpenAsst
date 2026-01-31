import { supabase } from './supabase';

export interface DbScript {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  commands: string[];
  author: string;
  user_id?: string;
  is_public: boolean;
  like_count: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

// 获取所有脚本
export async function loadScriptsFromDb(): Promise<DbScript[]> {
  const { data, error } = await supabase
    .from('script_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('加载脚本失败:', error);
    return [];
  }
  return data || [];
}

// 保存新脚本
export async function saveScriptToDb(script: Partial<DbScript>): Promise<DbScript | null> {
  const { data, error } = await supabase
    .from('script_templates')
    .insert({
      name: script.name,
      description: script.description,
      category: script.category || 'custom',
      tags: script.tags || [],
      commands: script.commands || [],
      author: script.author,
      user_id: script.user_id,
      is_public: script.is_public ?? true,
      like_count: 0,
      usage_count: 0
    })
    .select()
    .single();

  if (error) {
    console.error('保存脚本失败:', error);
    return null;
  }
  return data;
}

// 删除脚本
export async function deleteScriptFromDb(id: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('script_templates')
    .delete()
    .eq('id', id);

  return !error;
}

// 点赞
export async function addLikeToDb(scriptId: string, visitorId: string): Promise<boolean> {
  // 先检查是否已点赞
  const { data: existing } = await supabase
    .from('script_likes')
    .select('id')
    .eq('script_id', scriptId)
    .eq('user_id', visitorId)
    .single();

  if (existing) return false;

  const { error } = await supabase
    .from('script_likes')
    .insert({ script_id: scriptId, user_id: visitorId });

  if (!error) {
    // 更新点赞数
    await supabase
      .from('script_templates')
      .update({ like_count: supabase.rpc('increment_like_count', { script_id: scriptId }) })
      .eq('id', scriptId);
  }
  return !error;
}

// 取消点赞
export async function removeLikeFromDb(scriptId: string, visitorId: string): Promise<boolean> {
  const { error } = await supabase
    .from('script_likes')
    .delete()
    .eq('script_id', scriptId)
    .eq('user_id', visitorId);

  return !error;
}

// 检查是否已点赞
export async function hasLikedInDb(scriptId: string, visitorId: string): Promise<boolean> {
  const { data } = await supabase
    .from('script_likes')
    .select('id')
    .eq('script_id', scriptId)
    .eq('user_id', visitorId)
    .single();

  return !!data;
}

// 获取点赞数
export async function getLikeCountFromDb(scriptId: string): Promise<number> {
  const { count } = await supabase
    .from('script_likes')
    .select('*', { count: 'exact', head: true })
    .eq('script_id', scriptId);

  return count || 0;
}
