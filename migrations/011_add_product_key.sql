-- Migration 011: Stable product key for image persistence across resets/imports

ALTER TABLE products ADD COLUMN product_key TEXT;
ALTER TABLE attachments ADD COLUMN product_key TEXT;

UPDATE products
SET product_key = CASE
    WHEN COALESCE(TRIM(part_number), '') <> ''
     AND UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(part_number), ' ', ''), '-', ''), '/', ''), '.', ''), '_', '')) NOT IN (
        'SEMPARTNUMBER',
        'SEMPARTNUMBERAUTO',
        'SEMREFERENCIA',
        'SEMREFERENCIAAUTO',
        'SEMREF',
        'SEMDESCRICAO',
        'SEMDESCRICAOAUTO',
        'SEMDESIGNACAO',
        'SEMDESIGNACAOAUTO',
        'SEMNOME',
        'SEMNOMEAUTO'
    ) THEN
        'PN:' || UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(part_number), ' ', ''), '-', ''), '/', ''), '.', ''), '_', '')) ||
        '|SP:' || CASE
            WHEN COALESCE(TRIM(sales_process), '') <> '' THEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(sales_process), ' ', ''), '-', ''), '/', ''), '.', ''), '_', ''))
            ELSE '-'
        END ||
        '|BR:' || CASE
            WHEN COALESCE(TRIM(COALESCE(brand, maker)), '') <> '' THEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(brand, maker)), ' ', ''), '-', ''), '/', ''), '.', ''), '_', ''))
            ELSE '-'
        END
    ELSE
        'NM:' || CASE
            WHEN COALESCE(TRIM(name), '') <> '' THEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(name), ' ', ''), '-', ''), '/', ''), '.', ''), '_', ''))
            ELSE '-'
        END ||
        '|SP:' || CASE
            WHEN COALESCE(TRIM(sales_process), '') <> '' THEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(sales_process), ' ', ''), '-', ''), '/', ''), '.', ''), '_', ''))
            ELSE '-'
        END ||
        '|BR:' || CASE
            WHEN COALESCE(TRIM(COALESCE(brand, maker)), '') <> '' THEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(brand, maker)), ' ', ''), '-', ''), '/', ''), '.', ''), '_', ''))
            ELSE '-'
        END ||
        '|CT:' || CASE
            WHEN COALESCE(TRIM(category), '') <> '' THEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(category), ' ', ''), '-', ''), '/', ''), '.', ''), '_', ''))
            ELSE '-'
        END ||
        '|LC:' || CASE
            WHEN COALESCE(TRIM(location), '') <> '' THEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(location), ' ', ''), '-', ''), '/', ''), '.', ''), '_', ''))
            ELSE '-'
        END ||
        '|BX:' || CASE
            WHEN COALESCE(TRIM(box), '') <> '' THEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(box), ' ', ''), '-', ''), '/', ''), '.', ''), '_', ''))
            ELSE '-'
        END ||
        '|PL:' || CASE
            WHEN COALESCE(TRIM(pallet), '') <> '' THEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(pallet), ' ', ''), '-', ''), '/', ''), '.', ''), '_', ''))
            ELSE '-'
        END
END;

UPDATE attachments
SET product_key = (
    SELECT product_key
    FROM products
    WHERE products.id = attachments.product_id
)
WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_product_key ON products(product_key);
CREATE INDEX IF NOT EXISTS idx_attachments_product_key ON attachments(product_key);
