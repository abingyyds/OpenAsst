-- OpenAsst 完整数据库初始化脚本
-- 在Supabase SQL编辑器中执行这个脚本即可

-- ============================================
-- 第一步：清理旧表
-- ============================================
DROP TABLE IF EXISTS script_ratings CASCADE;
DROP TABLE IF EXISTS script_favorites CASCADE;
DROP TABLE IF EXISTS script_likes CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS script_executions CASCADE;
DROP TABLE IF EXISTS script_templates CASCADE;
DROP TABLE IF EXISTS servers CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ============================================
-- 第二步：创建表结构
-- ============================================

-- 用户表
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 服务器/连接表
CREATE TABLE servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  connection_type TEXT NOT NULL CHECK (connection_type IN ('ssh', 'local', 'docker', 'kubernetes', 'wsl')),
  local_only BOOLEAN DEFAULT false,

  -- SSH 连接配置
  host TEXT,
  port INTEGER DEFAULT 22,
  username TEXT,
  auth_type TEXT CHECK (auth_type IN ('password', 'privateKey')),
  encrypted_password TEXT,
  encrypted_private_key TEXT,

  -- Docker 连接配置
  container_name TEXT,
  container_id TEXT,

  -- Kubernetes 连接配置
  pod_name TEXT,
  namespace TEXT,

  -- WSL 连接配置
  distribution_name TEXT,

  -- 通用字段
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  last_connected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_servers_user_id ON servers(user_id);

-- 脚本模板表
CREATE TABLE script_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('deployment', 'maintenance', 'monitoring', 'docker', 'security', 'backup', 'network', 'custom')),
  tags TEXT[] DEFAULT '{}',
  commands TEXT[] DEFAULT '{}',

  -- 文档内容支持
  document_content TEXT,
  document_type TEXT CHECK (document_type IN ('markdown', 'text')),

  -- 作者和权限
  author TEXT,
  is_public BOOLEAN DEFAULT true,

  -- 统计数据
  like_count INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_script_templates_category ON script_templates(category);
CREATE INDEX idx_script_templates_user ON script_templates(user_id);

-- 脚本点赞表
CREATE TABLE script_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES script_templates(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(script_id, user_id)
);

CREATE INDEX idx_script_likes_script ON script_likes(script_id);
CREATE INDEX idx_script_likes_user ON script_likes(user_id);

-- 脚本收藏表
CREATE TABLE script_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES script_templates(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(script_id, user_id)
);

CREATE INDEX idx_script_favorites_script ON script_favorites(script_id);
CREATE INDEX idx_script_favorites_user ON script_favorites(user_id);

-- 脚本评分表
CREATE TABLE script_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES script_templates(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(script_id, user_id)
);

CREATE INDEX idx_script_ratings_script ON script_ratings(script_id);
CREATE INDEX idx_script_ratings_user ON script_ratings(user_id);

-- 脚本执行记录表
CREATE TABLE script_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES script_templates(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('running', 'success', 'failed')),
  logs JSONB,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 聊天消息表
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  command_context JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_server ON chat_messages(server_id);

-- ============================================
-- 第三步：启用RLS并设置策略
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Profiles策略
CREATE POLICY "用户可以查看所有profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "用户可以更新自己的profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Servers策略
CREATE POLICY "用户只能查看自己的服务器" ON servers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "用户可以创建服务器" ON servers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "用户可以更新自己的服务器" ON servers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "用户可以删除自己的服务器" ON servers FOR DELETE USING (auth.uid() = user_id);

-- Script Templates策略
CREATE POLICY "所有人可以查看公开脚本" ON script_templates FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "用户可以创建脚本" ON script_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "用户可以更新自己的脚本" ON script_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "用户可以删除自己的脚本" ON script_templates FOR DELETE USING (auth.uid() = user_id);

-- Script Likes策略
CREATE POLICY "所有人可以查看点赞" ON script_likes FOR SELECT USING (true);
CREATE POLICY "用户可以点赞" ON script_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "用户可以取消点赞" ON script_likes FOR DELETE USING (auth.uid() = user_id);

-- Script Favorites策略
CREATE POLICY "用户可以查看自己的收藏" ON script_favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "用户可以收藏" ON script_favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "用户可以取消收藏" ON script_favorites FOR DELETE USING (auth.uid() = user_id);

-- Script Ratings策略
CREATE POLICY "所有人可以查看评分" ON script_ratings FOR SELECT USING (true);
CREATE POLICY "用户可以评分" ON script_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "用户可以更新评分" ON script_ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "用户可以删除评分" ON script_ratings FOR DELETE USING (auth.uid() = user_id);

-- Chat Messages策略
CREATE POLICY "用户只能查看自己的聊天记录" ON chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "用户可以创建聊天消息" ON chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 第四步：创建触发器（自动创建profile）
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (new.id, new.email, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 第五步：为现有用户创建profile记录
-- ============================================

INSERT INTO profiles (id, username, display_name)
SELECT id, email, email
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles);
