# 🗄️ Database Backup & Recovery Guide

## Backup Information

**Created:** 2026-03-18 16:09 UTC  
**Database:** aspstock-db  
**Backup File:** `database-backup-2026-03-18.sql` (5.1 MB)  
**Type:** Full export (schema + data)

---

## ✅ Recovery Instructions

### Option 1: Restore to Remote D1 (Production)

**⚠️ WARNING: This will overwrite production data. Use only in emergency!**

```bash
# 1. Backup current state first
npx wrangler d1 export aspstock-db --remote --output database-backup-$(date +%s).sql

# 2. Reset database to clean state
npx wrangler d1 execute aspstock-db --command "pragma integrity_check;" --remote

# 3. Restore from backup
npx wrangler d1 execute aspstock-db --file database-backup-2026-03-18.sql --remote
```

### Option 2: Restore to Local Development DB

```bash
# 1. Run with --local for development
npx wrangler d1 execute aspstock-db --file database-backup-2026-03-18.sql --local
```

### Option 3: Manual Review First

```bash
# 1. Inspect backup before restoring
head -100 database-backup-2026-03-18.sql

# 2. Create a new temp database for testing
npx wrangler d1 create aspstock-db-restore-test

# 3. Restore to temp DB
npx wrangler d1 execute aspstock-db-restore-test --file database-backup-2026-03-18.sql

# 4. Test and verify...

# 5. When ready, restore to production
# (see Option 1)
```

---

## 📋 Backup Contents

This backup includes full database schema and data for:

- `products` (12 records)
- `app_users` (2 records)
- `movements` (1 record)
- `attachments` (1 record)
- `logistics_items`
- `historico_geral`
- `phc`
- `import_history`
- `import_items`
- `app_events`
- `_cf_KV` (Cloudflare internal)
- `sqlite_sequence` (auto-increment tracking)

---

## 🔄 Automated Backup Schedule

Add to your deployment/CI pipeline:

```bash
#!/bin/bash
# backup-database.sh

DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="database-backup-${DATE}.sql"

npx wrangler d1 export aspstock-db \
  --remote \
  --output "${BACKUP_FILE}"

# Upload to R2 for long-term storage
npx wrangler r2 object put \
  asp-stock-backups-30d \
  "db-backups/${BACKUP_FILE}" \
  --file="${BACKUP_FILE}"

echo "✅ Backup created: ${BACKUP_FILE}"
```

---

## ⚠️ Important Notes

1. **Retention:** Backups in this directory are kept for manual recovery only
2. **Automatic Backups:** Consider setting up D1's built-in backup feature
3. **Point-in-Time Recovery:** Use `wrangler d1 time-travel` for specific timestamps
4. **Before Refactoring:** Always create backups before major schema changes
5. **Test First:** Always test restore in development before production

---

## 🚨 Emergency Recovery

If production is corrupted and you need to restore immediately:

```bash
# 1. Contact Cloudflare Support (have backup ready)
# 2. Get database ID: 8c0bd9de-e51a-46a2-8ba3-112ce6034e86
# 3. Request restore from this backup
```

**Backup ID for reference:**  
Database: `aspstock-db` (8c0bd9de-e51a-46a2-8ba3-112ce6034e86)  
Date: 2026-03-18
