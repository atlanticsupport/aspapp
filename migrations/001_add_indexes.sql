-- Migration 001: Add Performance Indexes
-- Created: 2026-03-13
-- Purpose: Improve query performance on frequently accessed columns

-- Products table indexes
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_products_location ON products(location) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_products_sales_process ON products(sales_process) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_products_batch_id ON products(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON products(is_deleted);
CREATE INDEX IF NOT EXISTS idx_products_part_number ON products(part_number) WHERE is_deleted = 0;

-- Logistics items indexes
CREATE INDEX IF NOT EXISTS idx_logistics_status ON logistics_items(status) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_logistics_sales_process ON logistics_items(sales_process) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_logistics_shipment_id ON logistics_items(shipment_id) WHERE shipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_logistics_is_deleted ON logistics_items(is_deleted);

-- Movements indexes
CREATE INDEX IF NOT EXISTS idx_movements_product_id ON movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_type ON movements(type);

-- Historico geral indexes
CREATE INDEX IF NOT EXISTS idx_historico_tabela ON historico_geral(tabela_nome);
CREATE INDEX IF NOT EXISTS idx_historico_criado_em ON historico_geral(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_historico_operacao ON historico_geral(operacao);
CREATE INDEX IF NOT EXISTS idx_historico_revertido ON historico_geral(foi_revertido);
CREATE INDEX IF NOT EXISTS idx_historico_utilizador ON historico_geral(utilizador_id);

-- App events indexes
CREATE INDEX IF NOT EXISTS idx_events_created_at ON app_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON app_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON app_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_target_id ON app_events(target_id) WHERE target_id IS NOT NULL;

-- Attachments indexes
CREATE INDEX IF NOT EXISTS idx_attachments_product_id ON attachments(product_id);

-- PHC indexes
CREATE INDEX IF NOT EXISTS idx_phc_processo_id ON phc(processo_id);
CREATE INDEX IF NOT EXISTS idx_phc_cliente ON phc(cliente_principal);
