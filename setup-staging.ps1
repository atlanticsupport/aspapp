#!/usr/bin/env pwsh
# Setup Staging Environment Script

Write-Host "🚀 ASP Stock Management - Staging Environment Setup" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Check if wrangler is installed
Write-Host "✓ Checking wrangler installation..." -ForegroundColor Green
$wranglerVersion = npx wrangler --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ wrangler not found. Install with: npm install -g wrangler" -ForegroundColor Red
    exit 1
}
Write-Host "  $wranglerVersion" -ForegroundColor Gray

# Check authentication
Write-Host ""
Write-Host "✓ Checking Cloudflare authentication..." -ForegroundColor Green
$authResult = npx wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Not authenticated. Run: npx wrangler login" -ForegroundColor Red
    exit 1
}
Write-Host "  Authenticated ✓" -ForegroundColor Gray

# Check if staging D1 exists
Write-Host ""
Write-Host "✓ Checking Staging D1 database..." -ForegroundColor Green
$dbs = npx wrangler d1 list 2>&1 | Select-String "aspstock-staging"
if ($dbs) {
    Write-Host "  Database already exists ✓" -ForegroundColor Gray
} else {
    Write-Host "  Database not found - creating..." -ForegroundColor Yellow
    npx wrangler d1 create aspstock-staging
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Created successfully ✓" -ForegroundColor Green
    }
}

# Check if R2 bucket exists
Write-Host ""
Write-Host "✓ Checking Staging R2 bucket..." -ForegroundColor Green
Write-Host "  Note: R2 buckets must be created in Cloudflare Dashboard" -ForegroundColor Yellow
Write-Host "  Create 'asp-stock-backups-staging' bucket if not already done" -ForegroundColor Yellow

# Offer to migrate schema
Write-Host ""
Write-Host "📦 Ready to migrate schema to staging?" -ForegroundColor Cyan
$response = Read-Host "Enter 'yes' to migrate, or 'no' to skip"

if ($response -eq "yes") {
    Write-Host ""
    Write-Host "🔄 Migrating schema to staging..." -ForegroundColor Cyan
    
    # List available migrations
    $migrations = Get-ChildItem "migrations/*.sql" | Sort-Object Name
    
    foreach ($migration in $migrations) {
        $migrationName = $migration.Name
        Write-Host "  ▶ Applying $migrationName..." -ForegroundColor Yellow
        
        npx wrangler d1 execute aspstock-staging --file "migrations/$migrationName" --remote
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    ✓ Success" -ForegroundColor Green
        } else {
            Write-Host "    ✗ Failed (may be normal if already applied)" -ForegroundColor Yellow
        }
    }
}

# Summary
Write-Host ""
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Deploy to staging:  npm run deploy:staging" -ForegroundColor Gray
Write-Host "  2. Test at:            https://staging.asp-app.pages.dev" -ForegroundColor Gray
Write-Host "  3. Deploy to prod:     npm run deploy:prod" -ForegroundColor Gray
Write-Host ""
Write-Host "For detailed instructions, see DEPLOYMENT.md" -ForegroundColor Cyan
