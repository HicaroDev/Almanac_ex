# CONFIG.md — Guia de Implantação do Almanac

> Documentação de deploy + troubleshooting dos imprevistos encontrados.
> Leia ANTES de configurar um novo ambiente.

---

## Sumário

1. [Stack e Dependências](#1-stack-e-dependencias)
2. [Passo a passo completo](#2-passo-a-passo-completo)
3. [Imprevistos e soluções](#3-imprevistos-e-solucoes)
4. [Checklist de verificação](#4-checklist-de-verificacao)

---

## 1. Stack e dependências

| Componente | Tecnologia | Versão |
|---|---|---|
| Frontend | Next.js (App Router) | 16+ |
| Linguagem | TypeScript | 5.x |
| Estilo | Tailwind CSS | 4.x |
| Banco | Supabase PostgreSQL | — |
| Auth | Supabase Auth + Google OAuth | — |
| Storage | Supabase Storage (bucket `mockups`) | — |
| Realtime | Supabase Realtime | — |
| Deploy | Vercel | — |

---

## 2. Passo a passo completo

### 2.1 Supabase — SQL Editor

Executar o `seed.sql` na íntegra. Cria:
- Tabelas: `users`, `projects`, `versions`, `pins`, `pin_comments`, `pin_reactions`, `activity_feed`
- Triggers: `on_auth_user_created` (sincroniza auth.users → users)
- RLS policies
- Realtime replication para `pins`, `pin_comments`, `activity_feed`

### 2.2 Supabase — Authentication

1. **Providers** → Ativar Google
2. **Google Cloud Console** → APIs & Services → Credentials → OAuth Web Client:
   - Authorized redirect URIs: `https://<projeto>.supabase.co/auth/v1/callback`
3. Copiar Client ID + Client Secret → colar no Supabase Auth Google provider
4. **URL Configuration**:
   - Site URL: `https://<vercel-url>.vercel.app`
   - Redirect URLs: `https://<vercel-url>.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`

### 2.3 Supabase — Storage

1. **Buckets** → New bucket → nome: `mockups` → público
2. **Policies**:
   - `SELECT`: true (público)
   - `INSERT`: auth.role() = 'authenticated'

### 2.4 Supabase — Realtime

1. **Database → Replication** → habilita `pins`, `pin_comments`, `activity_feed` na publicação `supabase_realtime`

### 2.5 Vercel — Deploy

1. Importar repositório do GitHub
2. Framework: Next.js
3. Variáveis de ambiente:

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<projeto>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key do Supabase (Settings → API) |

4. Deploy → aguardar build + deploy

---

## 3. Imprevistos e soluções

### 3.1 Build error: "Middleware is missing expected function export name"

**Contexto:** Next.js 16 depreciou `middleware.ts` em favor de `proxy.ts`.

**Sintoma:**
```
Error: Turbopack build failed with 1 errors:
./src/middleware.ts
Middleware is missing expected function export name
```

**Solução:**
- Renomear `src/middleware.ts` → `src/proxy.ts`
- Exportar função `proxy` (não `middleware`):
  ```ts
  import { NextResponse } from "next/server";
  import type { NextRequest } from "next/server";

  export function proxy(request: NextRequest) {
    return NextResponse.next();
  }

  export const config = {
    matcher: [],
  };
  ```
- Git push + Redeploy na Vercel (Clear cache and redeploy)

### 3.2 Login redireciona para localhost após deploy

**Contexto:** Google OAuth redireciona para `localhost:3000` mesmo em produção.

**Causa:** Supabase Auth Site URL estava como `http://localhost:3000`.

**Solução:**
1. Supabase Dashboard → Authentication → URL Configuration
2. Site URL: alterar para `https://<vercel-url>.vercel.app`
3. Redirect URLs: adicionar `https://<vercel-url>.vercel.app/auth/callback`
4. No Google Cloud Console, conferir se `https://<projeto>.supabase.co/auth/v1/callback` está nos redirect URIs autorizados

### 3.3 Login redireciona para root com `?code=` em vez de `/auth/callback`

**Contexto:** Após configurar Site URL, o OAuth redireciona para a raiz (`/`) com o parâmetro `?code=...`, mas o app espera o callback em `/auth/callback`.

**Causa:** O Supabase Auth usa o Site URL como fallback quando o `redirectTo` não corresponde exatamente a um Redirect URL configurado.

**Solução:** Adicionar o caminho exato `https://<vercel-url>.vercel.app/auth/callback` nos Redirect URLs do Supabase Auth.

### 3.4 Erro de build após `Clear cache and redeploy`

**Contexto:** Mesmo após limpar o cache, o build ainda falha com o mesmo erro de middleware.

**Causa:** Às vezes o cache da Vercel não é completamente limpo.

**Solução:**
1. Verificar se o commit correto está no GitHub (`git log`)
2. Na Vercel, ir em Deployments → "...", "Redeploy" → marcar "Clear cache and redeploy"
3. Se persistir, criar um novo deploy vazio (ex: adicionar um comentário, fazer push)

### 3.5 Coluna `user_id` não existe na tabela `versions`

**Contexto:** O SEED.md original continha `user_id = auth.uid()` no RLS de versions. A coluna correta é `created_by`.

**Solução:** Usar a policy correta do `seed.sql`:
```sql
CREATE POLICY "Anyone can read versions"
  ON versions FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert versions"
  ON versions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
```

### 3.6 Tabela `project_shares` não existe

**Contexto:** O SEED.md original referenciava `project_shares` no RLS de versions, mas essa tabela nunca foi definida.

**Solução:** Remover a referência. O schema real usa policies simples (sem tabela de shares intermediária).

### 3.7 Bucket `mockups` não criado

**Sintoma:** Upload de HTML falha silenciosamente.

**Solução:** Criar bucket `mockups` no Supabase Storage com policy pública de SELECT e autenticada de INSERT.

---

## 4. Checklist de verificação

### Pré-deploy
- [ ] `seed.sql` executado no Supabase SQL Editor
- [ ] Google OAuth ativado no Supabase Auth
- [ ] Google Cloud Console com redirect URI correto
- [ ] Supabase Site URL = URL do deploy
- [ ] Supabase Redirect URLs incluem `/auth/callback`
- [ ] Bucket `mockups` criado no Storage
- [ ] Realtime habilitado para `pins`, `pin_comments`, `activity_feed`

### Deploy
- [ ] Repositório conectado à Vercel
- [ ] Env vars configuradas na Vercel
- [ ] Build passa (sem erro de middleware/proxy)
- [ ] Deploy verde (sem crash)

### Pós-deploy
- [ ] Login Google funciona (redirect → dashboard)
- [ ] Upload HTML funcional
- [ ] Pins funcionam (criar, persistir, comentar)
- [ ] Link compartilhável funciona (read-only sem login)
- [ ] Versões funcionam (upload novo → alternar entre versões)
- [ ] Logout funciona
