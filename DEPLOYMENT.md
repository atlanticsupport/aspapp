# Deployment & Environment Guide

## Overview

A aplicação ASP Stock Management tem **2 ambientes isolados**:

| Ambiente | URL | Banco de Dados | R2 Bucket | Propósito |
|----------|-----|---|-------|---------|
| **Production** | `https://asp-app.pages.dev` | `aspstock-db` | `asp-stock-backups-30d` | Produção em tempo real |
| **Staging** | `https://staging.asp-app.pages.dev` | `aspstock-staging` | `asp-stock-backups-staging` | Testes e desenvolvimento |

Qualquer mudança pode ser **testada em staging** antes de ir para produção, com dados e storage **completamente isolados**.

---

## 1. Development Workflow

### Local Development (com BD de produção):

```bash
npm run dev
```

Isto inicia um servidor local que liga-se **à BD de produção** (útil para pequenos testes). Abre `http://localhost:8787`.

### Desenvolver em Staging (isolado):

Para trabalhar com dados de teste isolados, **cria uma BD local com migrations**:

```bash
# 1. Criar BD local para staging
wrangler d1 create aspstock-staging-local

# 2. Migrar schema (executar migrations)
wrangler d1 execute aspstock-staging-local --file migrations/001_add_indexes.sql
wrangler d1 execute aspstock-staging-local --file migrations/002_add_constraints.sql
# ... etc

# 3. Desenvolver localmente contra esta BD
wrangler pages dev public --d1 DB=aspstock-staging-local
```

Agora tens um servidor local (`http://localhost:8787`) com:
- Código mais recente
- BD isolada para testes
- Sem afetar produção

---

## 2. Deployment Commands

### Deploy para **Staging** (recomendado antes de produção):

```bash
npm run deploy:staging
```

Isto:
- ✅ Compila Workers (`functions/api/*`)
- ✅ Faz upload de `public/` para staging.asp-app.pages.dev
- ✅ Usa BD `aspstock-staging` isolada (dados de teste)
- ✅ Usa R2 bucket `asp-stock-backups-staging` isolado

### Deploy para **Production**:

```bash
npm run deploy:prod
```

Ou simplesmente:

```bash
npm run deploy
```

Isto:
- ✅ Compila Workers
- ✅ Faz upload de `public/` para asp-app.pages.dev
- ✅ Usa BD `aspstock-db` real (dados de produção)
- ✅ Usa R2 bucket `asp-stock-backups-30d` real

---

## 3. Recommended Deployment Workflow

### ✅ Fluxo seguro (recomendado):

```
1. Desenvolver localmente
   └─ npm run dev (ou com BD local isolada)
   
2. Testes funcionais localmente
   └─ Verificar que tudo funciona
   
3. Commit ao Git
   └─ git add -A && git commit -m "feature: ..."
   
4. Deploy para Staging
   └─ npm run deploy:staging
   
5. Testes em Staging
   └─ Acede https://staging.asp-app.pages.dev
   └─ Testa com dados de teste
   
6. Após validação, deploy para Produção
   └─ npm run deploy:prod
   
7. Verificar em Produção
   └─ https://asp-app.pages.dev
   └─ Confirmar que está funcional
```

---

## 4. Database Management

### Migrar schema para **Staging**:

Quando tens mudanças que precisam de schema novo (migrations), primeiro aplica em staging:

```bash
# Aplicar migration específica a staging
wrangler d1 execute aspstock-staging --file migrations/002_add_constraints.sql --remote

# Ou via npm script
npm run db:migrate:staging
```

### Depois aplicar em **Production** (com cuidado):

```bash
npm run db:migrate
```

### Backup/Export de dados:

```bash
# Backup da BD de production
npm run db:export

# Backup da BD de staging
npm run db:export:staging
```

Os ficheiros são guardados como `database-backup-*.sql` na raiz do projeto.

---

## 5. Environment Variables & Secrets

Variáveis de ambiente são **separadas por ambiente** na Cloudflare Dashboard:

### Para adicionar uma variável a **Production**:

1. Vai a [Cloudflare Pages Dashboard](https://dash.cloudflare.com/?to=/:account/pages)
2. Seleciona `asp-app-prod`
3. Settings → Environment variables → Add
4. Adiciona a variável

### Para adicionar a **Staging**:

1. Cloudflare Pages Dashboard
2. Seleciona `asp-app-staging` (ou com `--env staging`)
3. Settings → Environment variables → Add

### Variáveis importantes agora:

- `JWT_SECRET` — chave para assinar tokens JWT (deve ser diferente em staging/prod para segurança)
- `BACKUP_TOKEN` — token para triggers de backup automático
- `PHC_API_KEY` — chave para sync PHC

Estes devem estar configurados em Cloudflare Dashboard.

---

## 6. Revert Rápido

Se algo correr mal em **Production**, tens várias opções:

### Opção 1: Revert directo no Cloudflare Pages

1. Vai a Cloudflare Pages Dashboard → asp-app-prod
2. Deployments -> click no deploy anterior
3. Rollback

### Opção 2: Revert localmente e redeploy:

```bash
git log --oneline                    # Ver commits
git revert <commit-id>               # Desfazer o commit
npm run deploy:prod                  # Redeploy versão anterior
```

### Opção 3: Hotfix em staging primeiro:

```bash
npm run deploy:staging               # Testa staging primeiro
# ... validar ...
npm run deploy:prod                  # Só depois vai para prod
```

---

## 7. Monitoring & Debugging

### Ver logs do Worker em **Production**:

```bash
wrangler tail
```

### Ver logs de **Staging**:

```bash
wrangler tail --env staging
```

Isto mostra todos os `console.log` e erros em tempo real.

---

## 8. Quick Reference

| Tarefa | Comando |
|--------|---------|
| Dev local (prod BD) | `npm run dev` |
| Dev local (staging BD) | `wrangler pages dev public --d1 DB=aspstock-staging-local` |
| Deploy staging | `npm run deploy:staging` |
| Deploy prod | `npm run deploy:prod` |
| Backup staging | `npm run db:export:staging` |
| Backup prod | `npm run db:export` |
| Migrate staging | `npm run db:migrate:staging` |
| Migrate prod | `npm run db:migrate` |
| Ver logs | `wrangler tail [--env staging]` |
| Lista BDs | `npm run db:list` |

---

## 9. Best Practices

✅ **DO's:**
- Sempre testa em staging antes de prod
- Faz commits pequenos e focados
- Usa `npm run lint` antes de commit
- Cria backups regularmente
- Documenta mudanças na BD (`migrations/`)

❌ **DON'Ts:**
- Não faças deploy directo para prod without testing
- Não mudes BD schema sem migration scripts
- Não pushas API tokens para Git (estão em Cloudflare, não em código)
- Não apagues BDs sem backup recente

---

## Troubleshooting

### "Database not found" error:
- Verifica se o `database_id` em wrangler.toml está correto
- Verifica em Cloudflare Dashboard que a BD existe

### "Permission denied" error:
- Verifica se `wrangler login` está autenticado: `npx wrangler whoami`
- Verifica se a conta tem permissão D1 (deve ter)

### Deploy falha com "Pages function timeout":
- Aumenta timeout em Cloudflare Dashboard (max 30 segundos)
- Otimiza queries da BD
- Reduz tamanho de ficheiros upload

---

**Perguntas?** Consulta esta doc ou contacta o dev team.
