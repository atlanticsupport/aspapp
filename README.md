# ASP Stock Management System

Sistema de gestão de inventário e logística desenvolvido para Cloudflare Pages + D1.

**Status:** ✅ Production Ready | **Last Updated:** 2026-03-18

---

## 🎯 Features

- ✅ Gestão de inventário com busca avançada
- ✅ Controlo de logística e trânsitos
- ✅ Histórico de movimentos
- ✅ Import/Export Excel
- ✅ Geração de QR Codes e Barcode
- ✅ Autenticação JWT
- ✅ Relatórios e gráficos
- ✅ Backup automático
- ✅ Interface responsiva (desktop + mobile)

---

## 🚀 Tecnologias

| Camada | Tecnologia | Detalhes |
|--------|-----------|----------|
| **Frontend** | Vanilla JavaScript (ES6) | Sem build step, módulos nativos |
| **Backend** | Cloudflare Pages Functions | Edge computing, low latency |
| **Database** | Cloudflare D1 (SQLite) | Managed, 5.89 MB atual |
| **Storage** | Cloudflare R2 | Backups e ficheiros |
| **Auth** | JWT (HS256) | Token-based, stateless |
| **Deploy** | Cloudflare Pages | Git-integrated CI/CD |

---

## 📦 Instalação

```bash
# 1. Clonar repositório
git clone https://github.com/atlanticsupport/aspapp.git
cd aspstock

# 2. Instalar dependências
npm install

# 3. Configurar .env.local (desenvolvimento)
cp .env.example .env.local
# Editar .env.local com JWT_SECRET gerado:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 4. Iniciar desenvolvimento
npm run dev
# Aceder a: http://localhost:8788
```

---

## 🔐 Configuração de Segurança

### ⚠️ Variáveis de Ambiente OBRIGATÓRIAS

**Desenvolvimento Local** (.env.local):
```bash
JWT_SECRET=seu-secret-aqui-gerado-com-openssl
```

**Produção** (Cloudflare Dashboard):
```
Pages > asp-app > Settings > Environment Variables

Name:  JWT_SECRET
Value: (novo secret gerado)
```

### Gerar JWT_SECRET Seguro

```bash
# Option 1: Node.js (cross-platform)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option 2: Linux/Mac
openssl rand -base64 32

# Output example: 7m/gwXwqnDY1+g9Eu3OCrJKMTWjmTgmLlYeWn1FLCz4=
```

---

## 🗄️ Database

### Informações Atuais

```
Size:       5.89 MB
Tables:     10
Region:     WEUR (Western Europe)
Records:    ~12 products, 2 users, etc.
Queries:    1,755 reads + 337 writes (últimas 24h)
Status:     ✅ Healthy
```

### Tabelas Principais

| Tabela | Descrição | Records |
|--------|-----------|---------|
| `products` | Inventário | 12 |
| `app_users` | Utilizadores | 2 |
| `movements` | Histórico de movimentos | 1+ |
| `logistics_items` | Itens logísticos | ? |
| `import_history` | Histórico de imports | ? |
| `phc` | Dados PHC-Sync | ? |

### Database Backups

```bash
# Fazer backup manual
npm run db:export

# Restaurar de backup
wrangler d1 execute aspstock-db \
  --file database-backup-2026-03-18.sql --remote

# Ver detalhes completos
cat BACKUP_RECOVERY.md
```

---

## 🚀 Deployment

### Opção 1: Automático (Git Push)

```bash
git push origin main
# Cloudflare Pages faz deploy automaticamente
# Dashboard: https://dash.cloudflare.com/
```

### Opção 2: Manual

```bash
npm run deploy
```

### Checklist Pré-Deploy

- [ ] `.env.local` não foi committed
- [ ] `npm run lint:check` passa sem erros
- [ ] `npm run format:check` passa sem erros
- [ ] Database backup criado (`npm run db:export`)
- [ ] Testes passam (se houver)

---

## 📋 Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev              # Start local dev server

# Deployment
npm run deploy           # Deploy to Cloudflare Pages

# Código
npm run lint             # Fix eslint + prettier issues
npm run lint:check       # Check without fixing
npm run format           # Format code
npm run format:check     # Check formatting

# Database
npm run db:export        # Backup database
npm run db:list          # List all databases
npm run db:migrate       # Run migration
```

---

## 📁 Project Structure

```
aspstock/
├── public/                      # Static assets + frontend
│   ├── index.html              # Main app entry
│   ├── js/
│   │   ├── app.js              # App initialization
│   │   └── modules/            # Feature modules
│   │       ├── core/           # Core functionality
│   │       ├── features/       # Feature-specific logic
│   │       └── ui/             # UI utilities
│   └── css/
│       ├── modules/            # CSS by feature
│       └── styles.css
├── functions/api/              # Backend handlers
│   ├── rpc.js                  # Main RPC handler
│   ├── auth.js                 # Auth endpoints
│   └── data.js                 # Data operations
├── migrations/                 # Database migrations
│   ├── 001_add_indexes.sql
│   ├── 002_add_constraints.sql
│   └── ...
├── wrangler.toml               # Cloudflare config
├── package.json                # Dependencies
└── README.md                   # This file
```

---

## 🔧 Development

### Code Quality

ESLint e Prettier configurados:

```bash
# Antes de fazer commit
npm run lint    # Fix issues
npm run format  # Format code
```

### Debugging

```javascript
// Habilitar logs (app.js)
// ... já tem console.time/timeEnd

// Ver estado global
window.state

// Ver dados do utilizador
window.state.currentUser
```

### Testes (Future)

```bash
# Será implementado em fase 3 do refactoring
npm run test
npm run test:watch
```

---

## 📊 Documentação

- 📖 [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) - Guia de backup/restauro
- 📖 [CLOUDFLARE_ENV_SETUP.md](CLOUDFLARE_ENV_SETUP.md) - Setup de variáveis
- 📖 [REFACTORING_PLAN.md](REFACTORING_PLAN.md) - Roadmap de melhorias
- 📖 [CHANGELOG.md](CHANGELOG.md) - Histórico de mudanças

---

## 🐛 Troubleshooting

### "JWT_SECRET not found"

```bash
# 1. Certifique-se que .env.local existe
cat .env.local

# 2. Se vazio, gerar novo:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. Adicionar a .env.local
echo "JWT_SECRET=seu-secret" >> .env.local
```

### "Database connection failed"

```bash
# 1. Verificar autenticação
npx wrangler d1 info aspstock-db

# 2. Verificar binding em wrangler.toml
cat wrangler.toml | grep database_id

# 3. Restaurar de backup se necessário
npm run db:export  # criar novo backup primeiro!
```

### "Port 8788 already in use"

```bash
# Matara processo anterior
# Windows
netstat -ano | findstr :8788
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :8788
kill -9 <PID>
```

---

## 🔐 Security Notes

- ✅ JWT_SECRET nunca em plaintext em repositório
- ✅ SQL injection protection (whitelist tables)
- ✅ Password hashing (SHA-256 + salt)
- ✅ CORS headers configured
- ✅ Rate limiting on RPC endpoints
- ⚠️ TODO: Adicionar CSRF protection
- ⚠️ TODO: Adicionar rate limiting global

---

## 🎯 Roadmap

### Phase 1: Code Quality ✅ (Em progresso)
- [x] Security fixes (JWT_SECRET)
- [x] Remove duplicates
- [x] Setup ESLint + Prettier
- [ ] Fix window pollution

### Phase 2: Documentation (Próxima)
- [ ] JSDoc comments
- [ ] API documentation
- [ ] Architecture diagram

### Phase 3: Testing (Em planeamento)
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests

### Phase 4: Performance
- [ ] Bundle optimization
- [ ] Code splitting
- [ ] Caching strategy

Ver [REFACTORING_PLAN.md](REFACTORING_PLAN.md) para detalhes completos.

---

## 👥 Time & Support

- **Maintainer:** Support@atlantic.com.pt
- **Repository:** https://github.com/atlanticsupport/aspapp
- **Issues:** [GitHub Issues](https://github.com/atlanticsupport/aspapp/issues)
- **Cloudflare:** https://dash.cloudflare.com/

---

## 📝 License

UNLICENSED - Internal use only
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
