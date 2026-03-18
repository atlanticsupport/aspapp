// Permission Management System
// This module handles all permission-related operations securely

// Permission levels
export const PERMISSION_LEVELS = {
    NONE: 'none',
    READ: 'read',
    WRITE: 'write',
    RCUD: 'RCUD' // Read, Create, Update, Delete
};

// Module definitions with their required permissions
export const MODULES = {
    dashboard: {
        viewKey: 'view_dashboard',
        accessKey: 'dashboard_access',
        defaultAccess: PERMISSION_LEVELS.READ,
        adminOnly: false
    },
    inventory: {
        viewKey: 'view_inventory',
        accessKey: 'inventory_access',
        defaultAccess: PERMISSION_LEVELS.READ,
        adminOnly: false
    },
    logistics: {
        viewKey: 'view_logistics',
        accessKey: 'logistics_access',
        defaultAccess: PERMISSION_LEVELS.READ,
        adminOnly: false
    },
    transit: {
        viewKey: 'view_transit',
        accessKey: 'transit_access',
        defaultAccess: PERMISSION_LEVELS.READ,
        adminOnly: false
    },
    history: {
        viewKey: 'view_history',
        accessKey: 'history_access',
        defaultAccess: PERMISSION_LEVELS.READ,
        adminOnly: false
    },
    admin: {
        viewKey: 'view_admin',
        accessKey: 'admin_access',
        defaultAccess: PERMISSION_LEVELS.NONE,
        adminOnly: true
    },
    settings: {
        viewKey: 'view_settings',
        accessKey: 'settings_access',
        defaultAccess: PERMISSION_LEVELS.READ,
        adminOnly: false
    },
    backups: {
        viewKey: 'view_backups',
        accessKey: 'backups_access',
        defaultAccess: PERMISSION_LEVELS.READ,
        adminOnly: false
    },
    usage: {
        viewKey: 'view_usage',
        accessKey: 'usage_access',
        defaultAccess: PERMISSION_LEVELS.NONE,
        adminOnly: true
    },
    'stock-out': {
        viewKey: 'view_stock_out',
        accessKey: 'stock_out_access',
        defaultAccess: PERMISSION_LEVELS.READ,
        adminOnly: false
    }
};

/**
 * Check if a user has access to a specific module
 * @param {Object} user - The user object
 * @param {string} module - The module name
 * @param {string} action - The action required (view, create, update, delete)
 * @returns {boolean} - Whether the user has access
 */
export function hasModuleAccess(user, module, action = 'view') {
    if (!user || !module) return false;
    
    // Admin has access to everything
    if (user.role === 'admin') return true;
    
    const moduleConfig = MODULES[module];
    if (!moduleConfig) {
        return false;
    }
    
    // Check if module is admin-only
    if (moduleConfig.adminOnly && user.role !== 'admin') return false;
    
    // Check view permission
    const hasView = user[moduleConfig.viewKey] === 1 || 
                   user[moduleConfig.viewKey] === true || 
                   user[moduleConfig.viewKey] === '1';
    
    if (!hasView) return false;
    
    // Check action-specific permissions
    const access = user[moduleConfig.accessKey] || PERMISSION_LEVELS.NONE;
    
    switch (action) {
        case 'view':
            return access !== PERMISSION_LEVELS.NONE;
        case 'create':
            return access === PERMISSION_LEVELS.WRITE || 
                   access === PERMISSION_LEVELS.RCUD ||
                   access.includes('C');
        case 'update':
            return access === PERMISSION_LEVELS.WRITE || 
                   access === PERMISSION_LEVELS.RCUD ||
                   access.includes('U');
        case 'delete':
            return access === PERMISSION_LEVELS.RCUD ||
                   access.includes('D');
        default:
            return false;
    }
}

/**
 * Apply user permissions to the UI
 * @param {Object} user - The user object
 */
export function applyPermissionsToUI(user) {
    if (!user) {
        return;
    }
    
    // Apply navigation permissions
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    navItems.forEach(item => {
        const page = item.dataset.page;
        const hasAccess = hasModuleAccess(user, page, 'view');
        item.style.display = hasAccess ? 'flex' : 'none';
    });
    
    // Apply folder visibility
    document.querySelectorAll('.nav-folder').forEach(folder => {
        const items = folder.querySelectorAll('.nav-item');
        const hasVisibleItems = Array.from(items).some(item => 
            item.style.display !== 'none'
        );
        folder.style.display = hasVisibleItems ? 'block' : 'none';
    });
    
    // Apply button permissions
    applyButtonPermissions(user);
    
    // Update user info
    const nameEl = document.getElementById('current-user-name');
    if (nameEl) nameEl.textContent = user.username;
    
}

/**
 * Apply permissions to action buttons
 * @param {Object} user - The user object
 */
function applyButtonPermissions(user) {
    // Inventory buttons only - other pages control their own buttons
    const canCreateInventory = hasModuleAccess(user, 'inventory', 'create');
    
    const btnAddProduct = document.getElementById('btn-add-product');
    const btnImportPhc = document.getElementById('btn-import-phc');
    const btnAddMobile = document.getElementById('btn-add-product-mobile');
    
    if (btnAddProduct) btnAddProduct.style.display = canCreateInventory ? 'flex' : 'none';
    if (btnImportPhc) btnImportPhc.style.display = canCreateInventory ? 'flex' : 'none';
    if (btnAddMobile) btnAddMobile.style.display = canCreateInventory ? 'flex' : 'none';
    
    // Don't control PHC buttons from other pages here - they control their own
}

/**
 * Validate user session and permissions
 * @param {Object} user - The user object from localStorage
 * @returns {boolean} - Whether the session is valid
 */
export function validateUserSession(user) {
    if (!user) return false;
    
    // Check required fields
    const required = ['id', 'username', 'role', 'token'];
    for (const field of required) {
        if (!user[field]) {
            console.warn(`[PERMISSIONS] Invalid session: missing ${field}`);
            return false;
        }
    }
    
    // Check token format (basic JWT validation)
    const parts = user.token.split('.');
    if (parts.length !== 3) {
        console.warn('[PERMISSIONS] Invalid token format');
        return false;
    }
    
    return true;
}

/**
 * Get user permissions summary for debugging
 * @param {Object} user - The user object
 * @returns {Object} - Permissions summary
 */
export function getPermissionsSummary(user) {
    if (!user) return null;
    
    const summary = {
        username: user.username,
        role: user.role,
        modules: {}
    };
    
    Object.entries(MODULES).forEach(([module, config]) => {
        summary.modules[module] = {
            canView: hasModuleAccess(user, module, 'view'),
            canCreate: hasModuleAccess(user, module, 'create'),
            canUpdate: hasModuleAccess(user, module, 'update'),
            canDelete: hasModuleAccess(user, module, 'delete')
        };
    });
    
    return summary;
}
