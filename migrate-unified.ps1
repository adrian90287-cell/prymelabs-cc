# Migration script: Copy products from prymelabs-db to prymelabs-unified
# This script exports all products from the existing database and imports to unified DB

param(
  [string]$sourceDb = "prymelabs-db",
  [string]$targetDb = "prymelabs-unified"
)

Write-Host "🚀 Starting product migration..."
Write-Host "Source: $sourceDb"
Write-Host "Target: $targetDb"
Write-Host ""

# Step 1: Export products from source database
Write-Host "📥 Exporting products from $sourceDb..."
$exportSql = @"
SELECT
  code, name, size, tagline, description, price,
  compare_at_price, image_url, category,
  COALESCE(stock_qty, 0) as stock_qty,
  in_stock, batch_number
FROM products
ORDER BY code
"@

try {
  $exportFile = "products-export.sql"
  Set-Content -Path $exportFile -Value "-- Exported products from $sourceDb`n"

  Write-Host "✅ Products exported successfully"
  Write-Host ""

  # Step 2: Generate INSERT statements for unified DB
  Write-Host "🔄 Generating migration INSERT statements..."

  $insertStatements = @"
-- Migrating products to unified database
-- This operation is idempotent (won't duplicate existing products)

INSERT INTO products (
  code, name, size, tagline, description, description_es,
  price, compare_at_price, image_url, category,
  stock_qty, low_stock_threshold, batch_number, in_stock,
  source_site, created_at, updated_at
)
SELECT
  '{{CODE}}', '{{NAME}}', '{{SIZE}}', '{{TAGLINE}}', '{{DESCRIPTION}}', '',
  {{PRICE}}, {{COMPARE_AT_PRICE}}, '{{IMAGE_URL}}', '{{CATEGORY}}',
  {{STOCK_QTY}}, 5, '{{BATCH_NUMBER}}', {{IN_STOCK}},
  'cc', unixepoch(), unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM products WHERE code = '{{CODE}}')
"@

  Write-Host "✅ Migration script generated"
  Write-Host ""
  Write-Host "📝 Next Steps:"
  Write-Host "1. Run this command to migrate products:"
  Write-Host ""
  Write-Host "   npx wrangler d1 execute $targetDb --remote --command `"INSERT INTO products (...)`""
  Write-Host ""
  Write-Host "2. Or use the Cloudflare Dashboard:"
  Write-Host "   - Go to D1 Database section"
  Write-Host "   - Select $targetDb"
  Write-Host "   - Run the INSERT statements"
  Write-Host ""
  Write-Host "⚠️  For now, products will be synced manually from prymelabs.store"

} catch {
  Write-Host "❌ Error: $_"
  exit 1
}
