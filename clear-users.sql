PRAGMA foreign_keys = OFF;
DELETE FROM app_users;
PRAGMA foreign_keys = ON;

INSERT INTO app_users (
    id, username, password, role,
    can_read, can_create, can_update, can_delete,
    view_dashboard, view_inventory, view_history, view_transit, view_admin,
    can_view_prices,
    inventory_access, logistics_access, transit_access,
    view_logistics, view_settings,
    history_access, dashboard_access, settings_access, admin_access,
    backups_access, usage_access,
    view_backups, view_usage, view_stock_out, stock_out_access,
    created_at, updated_at
) VALUES (
    'admin-001', 'admin', 'HASH:GjDoQ00QDbNbWb/NV4rm6PYn1v5yCcAZImFrOPDDlGA=', 'admin',
    1, 1, 1, 1,
    1, 1, 1, 1, 1,
    1,
    'RCUD', 'RCUD', 'RCUD',
    1, 1,
    'RCUD', 'RCUD', 'RCUD', 'RCUD',
    'RCUD', 'RCUD',
    1, 1, 1, 'RCUD',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
