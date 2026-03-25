# Deployment & Development Guide

## Overview

A aplicação ASP Stock Management tem **2 ambientes isolados** gerenciados através de Git branches:

| Ambiente | Git Branch | URL | Banco de Dados | Auto-deploy |
|----------|-----------|-----|---|---------|
| **Production** | `main` | https://asp-app.pages.dev | `aspstock-db` | ✅ Sim |
| **Staging** | `staging` | https://staging.asp-app.pages.dev | `aspstock-staging` | ✅ Sim |

Cada push a uma branch é automaticamente deployado pelo Cloudflare Pages no seu respetivo ambiente.

---

## Quick Start

### 1️⃣ Crear branch staging localmente:

```bash
git checkout main
git pull origin main
git checkout -b staging
git push -u origin staging
```

Pronto! Agora tens:
- `main` → produção (asp-app.pages.dev)
- `staging` → teste (staging.asp-app.pages.dev)

### 2️⃣ Trabalhar em staging:

```bash
git checkout staging
# Faz mudanças...
git add -A
git commit -m "feature: ..."
git push origin staging

# Cloudflare redeploy automático em ~1-2 min
# → Testa em https://staging.asp-app.pages.dev
```

### 3️⃣ Levar para produção:

```bash
git checkout main
git merge staging
git push origin main

# Cloudflare redeploy automático
# → Produção atualizada em https://asp-app.pages.dev
```

---

## Development Workflow Recomendado

```
┌─────────────────────────────────────────────────────────┐
│ 1. Cria feature branch a partir do staging              │
│    git checkout staging && git pull                     │
│    git checkout -b feature/my-feature                   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Desenvolve localmente                                │
│    npm run dev                                          │
│    git add/commit conforme avança                       │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Push para feature branch                             │
│    git push origin feature/my-feature                   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Pull Request no GitHub (feature → staging)           │
│    Permite code review                                  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Merge para staging branch                            │
│    Cloudflare auto-deploy para staging.asp-app...      │
│    https://staging.asp-app.pages.dev                    │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 6. EQA/QA testa em staging                              │
│    Valida funcionalidade, dados, performance           │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 7. Merge para main branch                               │
│    git checkout main && git merge staging               │
│    git push origin main                                 │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 8. Cloudflare auto-deploy para produção                 │
│    https://asp-app.pages.dev (VIVO!)                    │
└─────────────────────────────────────────────────────────┘
```

---

## Branch Naming Convention

```
main              ← Production (protegida, merge only de staging)
  ↓ stable
staging           ← Staging/QA (mergea para main quando pronto)
  ↓ development
feature/*         ← Feature development
  ↓ development
hotfix/*          ← Emergency fixes para production
  ↓ direto para main
```

**Exemplos de feature branches:**
- `feature/inventory-dashboard`
- `feature/phc-import-system`
- `bugfix/password-reset`
- `hotfix/critical-db-query`

---

## Commands Reference

### Development

```bash
npm run dev              # Local dev (porta 8787, BD produção)
npm run lint             # ESLint fix
npm run format          # Prettier format
npm run lint:check      # ESLint check
```

### Database Management

```bash
npm run db:list                    # Lista ambas as BDs
npm run db:export                  # Backup produção
npm run db:export:staging          # Backup staging
npm run db:migrate                 # Migrar schema produção
npm run db:migrate:staging         # Migrar schema staging
```

### Git Operations

```bash
git checkout staging                           # Ir para staging
git pull origin staging                        # Atualizar staging
git checkout -b feature/my-feature             # Criar feature branch
git add -A && git commit -m "message"          # Commit
git push origin feature/my-feature             # Push
git pull request                               # Criar PR (GitHub)
git checkout main && git merge staging         # Merge para main
git push origin main                           # Deploy produção
```

---

## Environment Database Setup

As duas BDs estão prontas:
- **Production:** `aspstock-db` (id: 8c0bd9de-e51a-46a2-8ba3-112ce6034e86)
- **Staging:** `aspstock-staging` (id: 39db27e3-c119-4545-b6f4-a7a6eeb2cce4)

Ambas podem rodar migrations independentemente:

```bash
# Aplica migration 001 a staging
wrangler d1 execute aspstock-staging --file migrations/001_add_indexes.sql --remote

# Aplica migration 001 a produção
wrangler d1 execute aspstock-db --file migrations/001_add_indexes.sql --remote
```

---

## R2 Buckets (Storage)

Cria manualmente em [Cloudflare R2 Dashboard](https://dash.cloudflare.com):

1. **Production:** `asp-stock-backups-30d` (já existe)
2. **Staging:** `asp-stock-backups-staging` (criar)

Localização em `wrangler.toml`:
```toml
[[r2_buckets]]
binding = "BACKUP_BUCKET"
bucket_name = "asp-stock-backups-30d"

[[env.staging.r2_buckets]]
binding = "BACKUP_BUCKET"
bucket_name = "asp-stock-backups-staging"
```

---

## Environment Variables (Secrets)

Configura em Cloudflare Pages Dashboard:

**Para Production:**
1. Cloudflare Dashboard → Pages → asp-app-prod
2. Settings → Environment variables

**Para Staging:**
1. Cloudflare Dashboard → Pages → asp-app-staging
2. Settings → Environment variables

**Variáveis importantes:**
- `JWT_SECRET` (use different secrets para segurança)
- `BACKUP_TOKEN`
- `PHC_API_KEY`

---

## Revert / Rollback

### Revert rápido (via Git):

```bash
git log --oneline -5          # Ver últimos commits
git revert <commit-hash>      # Desfaz um commit
git push origin main           # Redeploy produção
```

### Rollback via Cloudflare Pages:

1. Cloudflare Dashboard → Pages → (asp-app-prod ou asp-app-staging)
2. Deployments tab
3. Click deployment anterior
4. "Rollback to this deployment"

---

## Troubleshooting

### "Branch não encontrado"
```bash
git fetch origin           # Download all branches
git branch -a             # List all branches
```

### Staging não atualiza após push
- Cloudflare demora 1-3 min a compilar
- Check Deployments tab em Cloudflare Pages para status

### BD staging não existe
```bash
npm run db:list                                  # Verifica
wrangler d1 create aspstock-staging              # Cria se necessário
npm run db:migrate:staging                       # Aplica migrations
```

### Erro "database not found"
- Verifica `database_id` em `wrangler.toml`
- Confirma que a BD existe em Cloudflare Dashboard

---

## Best Practices

✅ **DO:**
- Sempre testa em staging antes de main
- Usa branches feature para isolação
- Faz commits pequenos e descritivos
- Cria backups (git + DB backups)
- Código review antes de merge para main

❌ **DON'T:**
- Diretos commits para main (sem teste staging)
- Force push a main/staging
- Mude secrets em Git (estão em Cloudflare)
- Apague BDs/buckets sem backup
- Use credenciais em código

---

**Última atualização:** 2026-03-25
**Dúvidas?** Contacta o dev team.
