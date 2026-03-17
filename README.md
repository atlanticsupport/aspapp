# ASP Stock Management System

Sistema de gestão de inventário e logística desenvolvido para Cloudflare Pages + D1.

## 🚀 Tecnologias

- **Frontend**: Vanilla JavaScript (ES6 Modules)
- **Backend**: Cloudflare Pages Functions
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **Deployment**: Cloudflare Pages

## 📦 Instalação

```bash
# Instalar dependências
npm install

# Desenvolvimento local
npm run dev

# Deploy para produção
npm run deploy
```

## 🔐 Configuração de Segurança

### Variáveis de Ambiente Obrigatórias

Adicione no Cloudflare Pages Dashboard:

```
JWT_SECRET=<seu-secret-forte-aqui>
```

⚠️ **IMPORTANTE**: Nunca faça deploy sem definir `JWT_SECRET`. O sistema irá falhar por segurança.

### Gerar JWT_SECRET Seguro

```bash
# Linux/Mac
openssl rand -base64 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 🗄️ Database Migrations

```bash
# Aplicar índices (já aplicado)
npm run db:migrate

# Executar query customizada
npm run db:query -- --command "SELECT * FROM app_users"

# Criar backup
npm run db:backup
```

## 📊 Estrutura da Database

### Tabelas Principais
- `app_users` - Utilizadores e permissões
- `products` - Inventário de produtos
- `logistics_items` - Itens logísticos
- `movements` - Movimentos de stock
- `historico_geral` - Auditoria completa
- `app_events` - Eventos do sistema

### Índices Aplicados
✅ 26 índices de performance criados
✅ Otimização para queries frequentes
✅ Partial indexes para dados ativos

## 🔒 Melhorias de Segurança Implementadas

### Críticas (✅ Resolvidas)
- ✅ JWT_SECRET obrigatório (sem fallback)
- ✅ Whitelist de tabelas para PRAGMA
- ✅ Passwords não são mais armazenadas em localStorage
- ✅ Auto-migração de passwords plain text para hash
- ✅ Tokens JWT com expiração
- ✅ Headers de segurança (CSP, X-Frame-Options, etc)

### Pendentes (⚠️ Requerem ação manual)
- ⚠️ Aplicar constraints CHECK (migration 002)
- ⚠️ Aplicar Foreign Keys (migration 003)
- ⚠️ Forçar reset de passwords para users com plain text

## 🛠️ Comandos Úteis

```bash
# Listar databases
npm run db:list

# Ver estrutura de tabela
wrangler d1 execute aspstock-db --command "PRAGMA table_info(products)" --remote

# Contar registos
wrangler d1 execute aspstock-db --command "SELECT COUNT(*) FROM products" --remote

# Backup manual
wrangler d1 backup create aspstock-db
```

## 📝 Migrations Disponíveis

1. **001_add_indexes.sql** - ✅ Aplicado
2. **002_add_constraints.sql** - ⚠️ Pendente (requer downtime)
3. **003_add_foreign_keys.sql** - ⚠️ Pendente (requer downtime)
4. **004_fix_passwords.sql** - ℹ️ Auto-migração ativa

## 🔄 Auto-Migrações

O sistema inclui auto-migrações que ocorrem automaticamente:

- **Passwords**: Convertidas de plain text para hash no próximo login
- **Timestamps**: Atualizados automaticamente
- **Soft Deletes**: Implementado via `is_deleted` flag

## 📈 Performance

- **Database Size**: ~5.7 MB
- **Query Time**: <50ms (média)
- **Índices**: 26 otimizados
- **Caching**: Cloudflare edge cache ativo

## 🐛 Troubleshooting

### Erro: "Configuração de segurança inválida"
- Verifique se `JWT_SECRET` está definido no Cloudflare Pages
- Redeploy após adicionar a variável

### Erro: "Sessão expirada"
- Tokens JWT expiram após 24h
- Faça logout e login novamente

### Database locked
- D1 não suporta transações longas
- Use batch operations para imports grandes

## 📞 Suporte

Para questões técnicas, consulte a documentação do Cloudflare:
- [D1 Documentation](https://developers.cloudflare.com/d1/)
- [Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [R2 Storage](https://developers.cloudflare.com/r2/)

## 📄 Licença

Proprietary - ASP © 2026
