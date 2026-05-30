# 🧬 ALMANAC — SEED

> **Gerado pelo Reversa (reversa-spec-sdd) em 2026-05-30**
> Status: ✅ PRONTO — Implementável por agente de IA
> Stack: Vercel + Supabase + Google Auth

---

## 1. ESCOPO GERAL

Esta SEED descreve o **Almanac**, uma ferramenta de colaboração visual onde um usuário faz upload de mockups HTML, compartilha links com a equipe, e os membros podem deixar feedbacks ancorados (pins) em pontos exatos da tela.

**Stack OBRIGATÓRIA (RFC 2119 — MUST):**
- Banco de dados: **Supabase** (PostgreSQL + Auth + Storage + Realtime)
- Deploy: **Vercel**
- Autenticação: **Google OAuth** (via Supabase Auth)

**Stack LIVRE (framework/biblioteca):** A critério da IA implementadora (Next.js, Nuxt, SvelteKit, etc.). A estrutura abaixo usa convenções de projeto web moderno.

**Prazo de submissão:** 30/05/2026 23:59

---

## 2. CONVENÇÕES DESTE DOCUMENTO

Palavras-chave RFC 2119:
- **MUST** = obrigatório
- **SHOULD** = recomendado
- **MAY** = opcional
- **MUST NOT** = proibido

---

## 3. ARQUITETURA GERAL

```
                     ┌─────────────┐
                     │  Vercel     │
                     │  (Frontend) │
                     └──────┬──────┘
                            │ HTTPS
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
       ┌──────────┐ ┌──────────┐ ┌──────────────┐
       │ Supabase │ │ Supabase │ │  Supabase    │
       │   Auth   │ │ Storage  │ │  Realtime    │
       └──────────┘ └──────────┘ └──────────────┘
                               │
                        ┌──────▼──────┐
                        │ PostgreSQL  │
                        └─────────────┘
```

Navegação:
- `/` → Landing page com login
- `/dashboard` → Lista de projetos do usuário
- `/projeto/:id` → Tela do mockup + pins + versões
- `/compartilhado/:id` → Link público (read-only para não logados)

---

## 4. BANCO DE DADOS (Supabase PostgreSQL)

### 4.1 Tabelas

#### `users`
Sincronizada automaticamente com Supabase Auth via trigger `on_auth_user_created`.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para criar user automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

#### `projects`
```sql
CREATE TYPE project_status AS ENUM ('active', 'archived');

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status project_status DEFAULT 'active',
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own projects"
  ON projects FOR ALL
  USING (user_id = auth.uid());
```

#### `versions`
```sql
CREATE TABLE versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(project_id, version_number)
);

ALTER TABLE versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can read versions"
  ON versions FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM project_shares WHERE project_id = versions.project_id)
  );

CREATE POLICY "Owners can insert versions"
  ON versions FOR INSERT
  WITH CHECK (created_by = auth.uid());
```

#### `pins`
```sql
CREATE TYPE pin_status AS ENUM ('open', 'resolved', 'reopened');

CREATE TABLE pins (
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

CREATE INDEX idx_pins_project ON pins(project_id);

ALTER TABLE pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone with link can read pins"
  ON pins FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert pins"
  ON pins FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Pin author can update"
  ON pins FOR UPDATE
  USING (created_by = auth.uid());
```

#### `pin_comments`
```sql
CREATE TABLE pin_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  parent_id UUID REFERENCES pin_comments(id) ON DELETE CASCADE,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pin_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone with link can read comments"
  ON pin_comments FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert comments"
  ON pin_comments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own comments"
  ON pin_comments FOR UPDATE
  USING (user_id = auth.uid());
```

#### `pin_reactions`
```sql
CREATE TABLE pin_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  emoji TEXT NOT NULL,
  UNIQUE(pin_id, user_id, emoji)
);

ALTER TABLE pin_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read reactions" ON pin_reactions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can react" ON pin_reactions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
```

#### `activity_feed`
```sql
CREATE TABLE activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone with link can read activity"
  ON activity_feed FOR SELECT
  USING (true);
```

### 4.2 Supabase Storage

- **Bucket:** `mockups`
- **Política:** Público para leitura, autenticado para escrita
- **Prefixos:** `{user_id}/{project_id}/v{version_number}.html`

---

## 5. REQUISITOS FUNCIONAIS

### 5.1 Autenticação (MUST)

| ID | Requisito |
|----|-----------|
| AUTH-01 | Sistema **MUST** exibir botão "Entrar com Google" na landing page |
| AUTH-02 | Sistema **MUST** usar Supabase Auth com provedor Google OAuth |
| AUTH-03 | Sistema **MUST** criar/atualizar registro na tabela `users` ao primeiro login |
| AUTH-04 | Sistema **MUST** manter sessão via JWT (não expirar ao recarregar) |
| AUTH-05 | Sistema **MUST** exibir nome + avatar do usuário no header |
| AUTH-06 | Sistema **MUST** permitir logout em 1 clique |
| AUTH-07 | Sistema **MUST** redirecionar para `/` quando token expirar |
| AUTH-08 | Google **MUST** ser o único provedor (sem email/senha, sem GitHub) |

### 5.2 Projetos (MUST)

| ID | Requisito |
|----|-----------|
| PROJ-01 | Usuário **MUST** poder criar projeto com nome |
| PROJ-02 | Sistema **MUST** listar projetos do usuário logado no dashboard |
| PROJ-03 | Usuário **MUST** poder renomear projeto (inline edit) |
| PROJ-04 | Usuário **MUST** poder arquivar/desarquivar projeto |
| PROJ-05 | Usuário **MUST** poder excluir projeto com confirmação |
| PROJ-06 | Sistema **MUST** exibir estado vazio com CTA "Criar primeiro projeto" |
| PROJ-07 | Dashboard **SHOULD** mostrar card com: nome, status, data, contagem de pins |
| PROJ-08 | Usuário **SHOULD** poder filtrar projetos por status (ativo/arquivado) |
| PROJ-09 | Sistema **SHOULD** paginar ou scroll infinito para 100+ projetos |

### 5.3 Upload e Renderização HTML (MUST)

| ID | Requisito |
|----|-----------|
| HTML-01 | Usuário **MUST** poder fazer upload de arquivo `.html` via file picker |
| HTML-02 | Sistema **MUST** armazenar HTML no Supabase Storage |
| HTML-03 | Sistema **MUST** renderizar HTML em iframe com atributo `sandbox` |
| HTML-04 | Sistema **MUST** rejeitar uploads > 10MB com mensagem |
| HTML-05 | Usuário **MUST** poder substituir HTML (nova versão) mantendo pins |
| HTML-06 | Sistema **SHOULD** gerar thumbnail do mockup para o card do projeto |

### 5.4 Pins — Feedback Ancorado (MUST)

| ID | Requisito |
|----|-----------|
| PIN-01 | Usuário **MUST** poder clicar em qualquer ponto do iframe |
| PIN-02 | Sistema **MUST** calcular coordenada percentual (x%, y%) |
| PIN-03 | Sistema **MUST** exibir marcador visual (bolinha) no ponto clicado |
| PIN-04 | Sistema **MUST** abrir formulário de comentário ao criar pin |
| PIN-05 | Sistema **MUST** salvar pin no Supabase e persistir após refresh |
| PIN-06 | Sistema **MUST** carregar todos os pins ao abrir o projeto |
| PIN-07 | Usuário **SHOULD** poder reposicionar pin arrastando |
| PIN-08 | Sistema **SHOULD** agrupar pins em raio < 30px |
| PIN-09 | Sistema **SHOULD** usar fallback via seletor/XPath para resiliência |
| PIN-10 | Sistema **MUST** exibir pins de forma consistente entre versões |

### 5.5 Compartilhamento (MUST)

| ID | Requisito |
|----|-----------|
| SHARE-01 | Sistema **MUST** gerar URL única para cada projeto |
| SHARE-02 | Sistema **MUST** exibir botão "Copiar Link" |
| SHARE-03 | Visitante sem login **MUST** poder ver mockup + pins (read-only) |
| SHARE-04 | Visitante **MUST NOT** criar/editar pins sem login |
| SHARE-05 | Sistema **MUST** exibir modal "Faça login para comentar" para visitantes |
| SHARE-06 | Link de projeto excluído **MUST** retornar 404 |

### 5.6 Conversas e Threads (SHOULD)

| ID | Requisito |
|----|-----------|
| THREAD-01 | Usuário **SHOULD** poder responder comentários (thread aninhada) |
| THREAD-02 | Usuário **SHOULD** poder reagir com emoji a comentários |
| THREAD-03 | Autor **SHOULD** poder marcar pin como resolvido |
| THREAD-04 | Qualquer membro **SHOULD** poder reabrir pin resolvido |
| THREAD-05 | Usuário **SHOULD** poder editar seu próprio comentário |
| THREAD-06 | Usuário **MUST** poder deletar seu próprio comentário |
| THREAD-07 | Sistema **MUST** mostrar indicador "[editado]" em comentários editados |
| THREAD-08 | Comentário deletado **MUST** mostrar "[deletado]" mantendo a thread |

### 5.7 Histórico de Versões (SHOULD)

| ID | Requisito |
|----|-----------|
| VER-01 | Usuário **SHOULD** poder criar nova versão a partir da atual |
| VER-02 | Sistema **SHOULD** listar versões em ordem cronológica |
| VER-03 | Usuário **SHOULD** poder alternar entre versões no visualizador |
| VER-04 | Sistema **SHOULD** exibir número da versão atual no header |
| VER-05 | Sistema **SHOULD** preservar pins entre versões (mesmas coordenadas) |
| VER-06 | Sistema **MAY** permitir comparar duas versões lado a lado |

### 5.8 Presença ao Vivo (MAY)

| ID | Requisito |
|----|-----------|
| LIVE-01 | Sistema **MAY** detectar quando usuário entra na página do projeto |
| LIVE-02 | Sistema **MAY** exibir avatares dos usuários ativos no header |
| LIVE-03 | Sistema **MAY** remover avatar quando usuário sai (< 5s) |
| LIVE-04 | Sistema **MAY** manter feed de atividades (últimas 20 ações) |
| LIVE-05 | Atualização **MUST** usar Supabase Realtime |
| LIVE-06 | Múltiplas abas do mesmo usuário **MUST** contar como 1 presença |

### 5.9 Dashboard e Status (SHOULD)

| ID | Requisito |
|----|-----------|
| DASH-01 | Dashboard **MUST** listar todos os projetos do usuário |
| DASH-02 | Card **SHOULD** mostrar: nome, status, data, contagem de pins |
| DASH-03 | Usuário **SHOULD** poder filtrar por status |
| DASH-04 | Card **SHOULD** mostrar thumbnail preview do mockup |
| DASH-05 | Dashboard **SHOULD** mostrar contadores: total projetos, total pins |

---

## 6. COMPONENTES DE UI

### 6.1 Landing Page (`/`)
- Logotipo + nome "Almanac" centralizado
- Botão "Entrar com Google" (grande, central)
- Fundo clean, sem distrações

### 6.2 Header (global após login)
- Avatar circular (32px) + nome do usuário
- Dropdown: "Sair"
- Link "Dashboard"

### 6.3 Dashboard (`/dashboard`)
- Grid de cards dos projetos
- Cada card: thumbnail, nome, status badge, data, pin count
- Botão "Novo Projeto" flutuante ou no topo
- Abas: Ativos | Arquivados | Todos
- Estado vazio: ilustração + "Crie seu primeiro projeto"

### 6.4 Tela do Projeto (`/projeto/:id`)
- **Header:** Nome do projeto, seletor de versão, botão "Compartilhar"
- **Canvas:** iframe com mockup renderizado
- **Sidebar (opcional):** Lista de pins com preview
- **Overlay Pins:** Marcadores sobre o iframe
- **Modal Pin:** Comentário + área de replies + emojis + ações

### 6.5 Tela Compartilhada (`/compartilhado/:id`)
- Mesma tela do projeto, sem header de edição
- Visitante vê pins mas não pode criar
- Clicar no mockup abre modal "Faça login para comentar"

---

## 7. FLUXOS COMPLETOS

### 7.1 Jornada Principal (Mary)

```
1. Landing → clica "Entrar com Google" → autoriza → /dashboard
2. Dashboard → "Novo Projeto" → digita nome → /projeto/:id
3. Projeto → "Upload HTML" → seleciona arquivo → iframe renderiza
4. Projeto → "Compartilhar" → link copiado → envia para equipe
5. Colega abre link → vê mockup + pins existentes
6. Colega clica no mockup → cria pin com comentário
7. Mary recebe notificação (visual) → abre pin → responde → resolve
8. Mary cria nova versão → faz upload de HTML atualizado
9. Mary alterna entre v1 e v2 para comparar
10. Projeto aprovado → Mary arquiva o projeto
```

### 7.2 Fluxo de Pin

```
Usuário clica no iframe
  → Calcula (x%, y%) relativo ao viewport
  → Renderiza marcador na posição
  → Abre modal "Adicionar comentário"
  → Usuário digita texto + salva
  → POST /api/pins → Inserts no Supabase
  → Pin aparece para todos em tempo real (Realtime)
  → Ao clicar no pin → Modal com comentário + replies
```

### 7.3 Fluxo de Compartilhamento

```
Usuário clica "Compartilhar"
  → Gera URL: /compartilhado/{project_id}
  → Copia automaticamente para clipboard
  → Usuário cola no Slack/e-mail
  → Destinatário abre link (pode ou não estar logado)
  → Se não logado → vê mockup + pins (read-only)
  → Se logado → vê mockup + pins + pode criar/edit
```

---

## 8. ESTADOS DE UI

### 8.1 Estados Globais

| Componente | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Dashboard | Skeleton grid | "Crie seu primeiro projeto" | "Erro ao carregar projetos" | Grid de cards |
| Projeto | Spinner no iframe | — | "Erro ao carregar mockup" | iframe renderizado |
| Pins | — | "Nenhum feedback ainda" | "Erro ao salvar pin" | Marcador visível |
| Upload | Barra de progresso | File picker vazio | "Arquivo muito grande" / "Falha no upload" | iframe atualizado |

### 8.2 Status dos Pins

| Status | Cor do Marcador | Ícone |
|---|---|---|
| `open` | 🟠 Laranja | ● |
| `resolved` | 🟢 Verde | ✓ |
| `reopened` | 🔵 Azul | ↺ |

---

## 9. VARIAVEIS DE AMBIENTE

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=<url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# URLs
NEXT_PUBLIC_BASE_URL=<vercel_deploy_url>

# Google OAuth (configurado no painel Supabase Auth)
# Nenhuma variável extra — configurar no Supabase Dashboard
```

---

## 10. DEPLOY (Vercel) — MUST

### Configuração:
1. Conectar repositório GitHub à Vercel
2. Framework preset conforme stack escolhida (Next.js, etc.)
3. Adicionar variáveis de ambiente acima
4. Deploy automático na branch `main`

### Scripts:
```json
{
  "build": "comando de build da stack escolhida",
  "dev": "comando de dev da stack escolhida"
}
```

---

## 11. SUPABASE SETUP

### Auth:
1. Ativar provedor Google no Supabase Dashboard
2. Configurar Redirect URLs: `{vercel_url}/auth/callback`, `http://localhost:3000/auth/callback`
3. Desabilitar sign-ups por email/senha (apenas Google)

### Storage:
1. Criar bucket `mockups`
2. Política: `SELECT` anônimo, `INSERT` autenticado
3. Tamanho máximo: 10MB

### Realtime:
1. Habilitar Realtime para tabelas: `pins`, `pin_comments`, `activity_feed`
2. Usar Supabase Realtime client no frontend

---

## 12. CRITERIOS DE ACEITE (Hackathon)

Para ser aprovado no hackathon, o deploy **MUST** atender:

- [ ] Login com Google funciona (redirect + sessão + logout)
- [ ] Upload de HTML e renderização no iframe
- [ ] Criar pin em ponto exato do mockup
- [ ] Pin persiste após refresh
- [ ] Link compartilhável funciona para usuário não logado
- [ ] Visitante vê pins mas não pode criar (modal de login)
- [ ] Histórico de projetos no dashboard
- [ ] Deploy na Vercel com banco no Supabase
- [ ] **Bônus (winner):** Threads, emojis, resolver/reabrir, pins arrastáveis, versões

---

## 13. ESTRUTURA DE PASTAS RECOMENDADA

```
/
├── src/
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── PinMarker.tsx
│   │   ├── PinModal.tsx
│   │   ├── ProjectCard.tsx
│   │   └── VersionSelector.tsx
│   ├── pages/
│   │   ├── index.tsx (landing + login)
│   │   ├── dashboard.tsx
│   │   ├── projeto/[id].tsx
│   │   └── compartilhado/[id].tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── usePins.ts
│   │   └── usePresence.ts
│   └── styles/
├── public/
├── .env.local
├── seed.sql
└── README.md
```

---

## 14. ENTREGAVEIS DO HACKATHON (Lembrete)

1. **Link do GitHub:** Repositório contendo `SEED.md` + seed SQL + código
2. **Link do Deploy:** URL Vercel funcionando com Supabase
3. **Vídeo de Demonstração:** Mostrando login, upload, pins, compartilhamento

---

> 🏆 **Boa sorte, SextaFeira! Esta SEED está pronta para a IA construir o Almanac do zero.**
>
> **Gerado automaticamente pelo Reversa Framework — Time Code New Project Agents**
> **Componentes:** reversa-ideator → reversa-researcher → reversa-drafter → reversa-spec-sdd
