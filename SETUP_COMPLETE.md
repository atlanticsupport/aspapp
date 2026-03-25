# ✅ Staging Environment Setup Complete

## O que foi feito

### 1. **2 Ambientes Isolados Criados**

| Componente | Production | Staging |
|-----------|-----------|---------|
| **Git Branch** | `main` | `staging` |
| **URL** | asp-app.pages.dev | staging.asp-app.pages.dev |
| **D1 Database** | aspstock-db | aspstock-staging |
| **R2 Bucket** | asp-stock-backups-30d | asp-stock-backups-staging* |
| **Auto-deploy** | ✅ Sim | ✅ Sim |

*R2 bucket staging precisa ser criado manualmente em Cloudflare Dashboard (R2 section)

---

### 2. **Databases Prontas**

```
$ npm run db:list

✅ aspstock-db (production, 6.2 MB com dados)
✅ aspstock-staging (staging, vazio, pronto para testes)
```

Cada uma pode rodar migrations independentemente:
```bash
npm run db:migrate           # Produção
npm run db:migrate:staging   # Staging
```

---

### 3. **NPM Scripts Novos**

```bash
npm run deploy:prod        # Deploy para produção (main branch)
npm run db:export:staging  # Backup da BD staging
npm run db:migrate:staging # Migrar schema em staging
npm run db:list            # Listar ambas as BDs
```

---

## Como Usar

### Quick Workflow:

```bash
# 1. Cria feature branch
git checkout staging
git pull origin staging
git checkout -b feature/meu-recurso

# 2. Desenvolve
npm run dev           # Local dev
git add . && git commit -m "feature: ..."

# 3. Push para feature branch
git push origin feature/meu-recurso

# 4. Em GitHub: Cria Pull Request (feature → staging)
# 5. Após approval: Merge para staging
git checkout staging
git merge feature/meu-recurso
git push origin staging

# Cloudflare auto-deploy em 1-2 minutos
# → Testa em staging.asp-app.pages.dev

# 6. Quando pronto, leva para produção
git checkout main
git pull origin main
git merge staging
git push origin main

# Cloudflare auto-deploy produção
# → Live em asp-app.pages.dev
```

---

## Próximos Passos

### 1. Criar branch staging remota (se ainda não feita):

```bash
git checkout main
git pull origin main
git checkout -b staging
git push -u origin staging
```

### 2. Criar R2 bucket de staging:

1. Vai a [Cloudflare Dashboard](https://dash.cloudflare.com)
2. R2
3. Create bucket → nome: `asp-stock-backups-staging`

### 3. Configurar variáveis de ambiente (opcional):

Se tiveres variáveis que diferem entre staging/prod:
1. Cloudflare Pages Dashboard → asp-app-prod
2. Settings → Environment variables → Add
3. Mesma coisa para asp-app-staging (quando criada como projeto separado no Cloudflare)

> **Nota:** Staging.asp-app.pages.dev atualmente aponta para o mesmo projeto que produção. Para ter páginas completamente separadas, cria um novo Pages project no Cloudflare chamado "asp-app-staging".

---

## Commits Feitos

```
25a48c0 - docs: Update DEPLOYMENT guide for git-branch based environments
bdb8471 - feat: Add staging environment for safe development
7d88d03 - config: Simplify wrangler.toml for Cloudflare Pages compatibility
```

Consulta [DEPLOYMENT.md](DEPLOYMENT.md) para documentação completa.

---

## Resumo Final

✅ **Produção** (main) → asp-app.pages.dev (com dados reais)
✅ **Staging** (staging) → staging.asp-app.pages.dev (ambiente de teste)
✅ **Databases isoladas** - mudanças não afectam produção
✅ **Auto-deploy via Git** - push = deploy automático
✅ **Documentation** - DEPLOYMENT.md com guide completo

Agora podes:
- 🚀 Continuar desenvolvimento em staging
- 🔍 Testar em ambiente isolado
- 👥 Receber feedback antes de ir para produção  
- 📦 Fazer deploy em grupos de mudanças grandes
- 🔄 Revert rápido se algo correr mal

**Questões?** Lê [DEPLOYMENT.md](DEPLOYMENT.md) para mais detalhes.
