# Almanac

Colaboração visual com feedbacks ancorados em mockups HTML.

## Stack

- **Frontend:** Next.js + TypeScript + Tailwind
- **Auth:** Supabase Auth (Google OAuth)
- **Banco:** Supabase PostgreSQL
- **Storage:** Supabase Storage
- **Deploy:** Vercel

## Setup Local

```bash
# 1. Clonar
git clone https://github.com/HicaroDev/Almanac_ex.git
cd Almanac_ex

# 2. Instalar dependências
npm install

# 3. Configurar .env.local (copie .env.example e preencha)
cp .env.example .env.local

# 4. Rodar seed.sql no SQL Editor do Supabase Dashboard

# 5. Iniciar dev
npm run dev
```

## Variáveis de Ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key
```

## Configuração Supabase

1. **Auth → Providers → Google:** Ativar + configurar Client ID/Secret
2. **SQL Editor:** Rodar `seed.sql`
3. **Storage:** Criar bucket `mockups` (público)
4. **Realtime:** Habilitar para tabelas `pins`, `pin_comments`, `activity_feed`

## Deploy na Vercel

1. Conectar repositório GitHub
2. Adicionar env vars do `.env.local`
3. Deploy automático na branch `main`

## Estrutura

```
src/
├── app/
│   ├── page.tsx                    # Landing + Login
│   ├── dashboard/                  # Lista de projetos
│   ├── projeto/[id]/               # Mockup + Pins
│   ├── compartilhado/[id]/         # Link público
│   └── auth/callback/              # Callback OAuth
├── components/
│   ├── auth-provider.tsx           # Contexto de auth
│   └── header.tsx                  # Header global
└── lib/
    ├── supabase.ts                 # Cliente browser
    ├── supabase-server.ts          # Cliente server
    └── types.ts                    # Tipos TS
```
