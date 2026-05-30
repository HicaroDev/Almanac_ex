-- Almanac - Database Schema
-- Execute este SQL no SQL Editor do Supabase Dashboard

-- Users (auto-sync com Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Projects
DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status project_status DEFAULT 'active',
  thumbnail_url TEXT,
  pin_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own projects" ON projects;
CREATE POLICY "Users can manage own projects"
  ON projects FOR ALL USING (user_id = auth.uid());

-- Versions
CREATE TABLE IF NOT EXISTS versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(project_id, version_number)
);

ALTER TABLE versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read versions" ON versions;
CREATE POLICY "Anyone can read versions"
  ON versions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert versions" ON versions;
CREATE POLICY "Authenticated users can insert versions"
  ON versions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Pins
DO $$ BEGIN
  CREATE TYPE pin_status AS ENUM ('open', 'resolved', 'reopened');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_id UUID REFERENCES versions(id) ON DELETE CASCADE,
  x_percent FLOAT NOT NULL,
  y_percent FLOAT NOT NULL,
  selector TEXT,
  status pin_status DEFAULT 'open',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pins_project_version ON pins(project_id, version_id);

ALTER TABLE pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read pins" ON pins;
CREATE POLICY "Anyone can read pins"
  ON pins FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert pins" ON pins;
CREATE POLICY "Authenticated users can insert pins"
  ON pins FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Pin author can update pins" ON pins;
CREATE POLICY "Pin author can update pins"
  ON pins FOR UPDATE USING (created_by = auth.uid());

-- Pin Comments
CREATE TABLE IF NOT EXISTS pin_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  parent_id UUID REFERENCES pin_comments(id) ON DELETE CASCADE,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pin_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read comments" ON pin_comments;
CREATE POLICY "Anyone can read comments"
  ON pin_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert comments" ON pin_comments;
CREATE POLICY "Authenticated users can insert comments"
  ON pin_comments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own comments" ON pin_comments;
CREATE POLICY "Users can update own comments"
  ON pin_comments FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own comments" ON pin_comments;
CREATE POLICY "Users can delete own comments"
  ON pin_comments FOR DELETE USING (user_id = auth.uid());

-- Pin Reactions
CREATE TABLE IF NOT EXISTS pin_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  emoji TEXT NOT NULL,
  UNIQUE(pin_id, user_id, emoji)
);

ALTER TABLE pin_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read reactions" ON pin_reactions;
CREATE POLICY "Anyone can read reactions"
  ON pin_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can react" ON pin_reactions;
CREATE POLICY "Authenticated users can react"
  ON pin_reactions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Activity Feed
CREATE TABLE IF NOT EXISTS activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read activity" ON activity_feed;
CREATE POLICY "Anyone can read activity"
  ON activity_feed FOR SELECT USING (true);

-- Storage: criar bucket 'mockups' via Supabase Dashboard
-- Config: público para SELECT, autenticado para INSERT

-- Realtime: habilitar replicação para tabelas pins, pin_comments, activity_feed
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pins;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pin_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE activity_feed;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
