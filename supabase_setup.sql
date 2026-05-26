-- Tabela de projetos
-- Execute este SQL no Supabase SQL Editor

CREATE TABLE projetos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  produto TEXT NOT NULL,
  cliente TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE projetos ENABLE ROW LEVEL SECURITY;

-- Política: permitir todas as operações (ajuste conforme necessário no futuro)
CREATE POLICY "Allow all operations" ON projetos
  FOR ALL
  USING (true)
  WITH CHECK (true);
