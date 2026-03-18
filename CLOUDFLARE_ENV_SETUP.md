#!/usr/bin/env bash
# Configure JWT_SECRET in Cloudflare Dashboard
# Run this after deploying to production

# ============================================
# CLOUDFLARE DASHBOARD CONFIGURATION
# ============================================

# 1. Aceda a:
#    https://dash.cloudflare.com/
#
# 2. Selecione a conta: "Support@atlantic.com.pt's Account"
#
# 3. Navegue para:
#    Pages > asp-app > Settings > Environment Variables
#
# 4. Clique em "Add Variable" ou "Edit"
#
# 5. Preencha:
#    Name:     JWT_SECRET
#    Value:    7m/gwXwqnDY1+g9Eu3OCrJKMTWjmTgmLlYeWn1FLCz4=
#    Bindings: Leave empty (usar como env var)
#
# 6. Clique em "Save"
#
# 7. DEPLOYS APÓS MUDANÇAS DE ENV VARS:
#    npm run deploy
#
# ============================================

echo "✅ JWT_SECRET foi removido de wrangler.toml"
echo "✅ Criado .env.local com novo secret para desenvolvimento local"
echo ""
echo "⚠️  AINDA FALTA configurar em Produção:"
echo ""
echo "1. Acede a: https://dash.cloudflare.com/"
echo "2. Pages > asp-app > Settings > Environment Variables"
echo "3. Add Variable:"
echo "   Name:  JWT_SECRET"
echo "   Value: 7m/gwXwqnDY1+g9Eu3OCrJKMTWjmTgmLlYeWn1FLCz4="
echo ""
echo "4. Depois faz deploy: npm run deploy"
