// This module is a bridge to attach all module functions to the window object 
// so that existing HTML onclick attributes continue to work.

import * as inventory from '../inventory.js';
import * as products from '../products.js';
import * as history from '../history.js';
import * as admin from '../admin.js';
import * as printing from '../printing.js';
import * as views from '../views/views.js';
import * as auth from '../auth/auth.js';
import { openViewer, closeViewer } from '../ag-grid-shim.js'; // Assuming basic shim

export function exposeToWindow() {
    // Inventory
    window.loadInventory = inventory.loadInventory;
    window.editProduct = inventory.editProduct; // Attached to window in inventory.js? Yes, likely. 
    // Wait, modules execute. If they assign to window, we don't need to reassign here unless we want to be explicit.
    // However, since we are using ES modules, top-level code runs once.

    // Explicit assignments just in case modules didn't self-attach or to centralize.

    // Views
    window.navigateTo = views.navigateTo;

    // Auth
    window.logout = auth.logout;

    // Products
    window.updateStock = inventory.updateStock; // Defined in inventory.js
    window.deleteProduct = inventory.deleteProduct; // Defined in inventory.js

    // History
    window.loadHistory = history.loadHistory;
    window.revertMovement = history.revertMovement;

    // Admin
    window.clearAllMovements = admin.clearAllMovements;
    window.openUserModal = admin.openUserModal;

    // Printing
    window.printSingleLabel = printing.printSingleLabel;

    // Shim
    window.openViewer = openViewer;
    window.closeViewer = closeViewer;
}
