# Controle de Custos

Plataforma de controle de custos por projeto — Next.js + Supabase + Vercel.

---

## 🚀 Como colocar no ar (passo a passo)

### 1. Criar repositório no GitHub

1. Acesse [github.com](https://github.com) e clique em **"New repository"**
2. Nome: `controle-custos`
3. Deixe **Private** (recomendado)
4. Clique em **"Create repository"**
5. Siga as instruções para fazer upload dos arquivos ou use git:

```bash
git init
git add .
git commit -m "feat: initial project setup"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/controle-custos.git
git push -u origin main
```

---

### 2. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta ou faça login
2. Clique em **"New Project"**
3. Preencha nome, senha do banco, região (escolha **South America - São Paulo**)
4. Aguarde o projeto ser criado (~2 min)
5. Vá em **SQL Editor** → **New Query**
6. Cole o conteúdo do arquivo `supabase_setup.sql` e clique em **"Run"**
7. Vá em **Project Settings → API**
8. Copie:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

### 3. Deploy na Vercel

1. Acesse [vercel.com](https://vercel.com) e crie uma conta ou faça login
2. Clique em **"Add New Project"**
3. Conecte com GitHub e selecione o repositório `controle-custos`
4. Antes de fazer deploy, clique em **"Environment Variables"** e adicione:
   - `NEXT_PUBLIC_SUPABASE_URL` = (valor copiado do Supabase)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (valor copiado do Supabase)
5. Clique em **"Deploy"**
6. Aguarde ~2 minutos e sua plataforma estará no ar! 🎉

---

## 💻 Rodando localmente

```bash
# Instalar dependências
npm install

# Criar arquivo de variáveis de ambiente
cp .env.local.example .env.local
# Edite o arquivo .env.local com suas chaves do Supabase

# Rodar em desenvolvimento
npm run dev
```

Acesse: http://localhost:3000

---

## 📁 Estrutura do projeto

```
controle-custos/
├── app/
│   ├── layout.tsx          # Layout raiz
│   ├── page.tsx            # Página inicial (lista de projetos)
│   ├── globals.css         # Estilos globais
│   └── projeto/[id]/
│       └── page.tsx        # Página do projeto com abas
├── components/
│   ├── NovoProjetoModal.tsx # Modal para criar projeto
│   └── ProjetoCard.tsx     # Card de projeto na tela inicial
├── lib/
│   └── supabase.ts         # Cliente Supabase
├── supabase_setup.sql      # SQL para criar as tabelas
└── .env.local.example      # Modelo de variáveis de ambiente
```

---

## 🗂️ Abas do projeto

- Controle de Custos Diretos
- Controle de Custos de Utilidades
- Controle de Custos de Pessoas
- Controle de Custos de SG&A
- Custos de Manutenção
- Custos de Secagem de MP
- Logística Interna
- Rolo
- Análise de Laboratório
- Outros Custos
- Frete
- Impostos
