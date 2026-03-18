# 🔧 Refactoring & Improvement Plan

**Status:** 🟡 In Progress  
**Last Updated:** 2026-03-18  
**Priority Levels:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## ✅ Completed (Phase 0)

- [x] 🔒 Remove JWT_SECRET from wrangler.toml
- [x] 🧹 Remove 5 duplicate app/state files
- [x] 🔧 Remove outdated cache busters
- [x] 📦 Create full database backup
- [x] 🔌 Add ESLint configuration
- [x] 💅 Add Prettier configuration

---

## 🚀 Phase 1: Code Quality (Next 1-2 weeks)

### 1.1 Window Pollution - Object.assign(window) 🟠 HIGH

**Current Problem:**
```javascript
// app.js
Object.assign(window, inventoryLogic);
Object.assign(window, productsLogic);
Object.assign(window, historyLogic);
Object.assign(window, adminLogic);
Object.assign(window, printingLogic);
Object.assign(window, shimLogic);
```

**Issues:**
- Pollutes global scope with ~200+ functions
- Makes code hard to tree-shake for optimization
- Risk of name collisions
- Breaks module encapsulation

**Solution & Migration Path:**

**Step 1:** Audit which inline handlers are actually used
```bash
grep -r 'on\w*=' public/*.html | grep -o 'on\w*="[^"]*' | sort -u
```

**Step 2:** Create modern event delegation layer
```javascript
// modules/event-delegation.js
export function setupGlobalHandlers() {
    // Map legacy onclick handlers to event delegation
    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('change', handleGlobalChange);
}

function handleGlobalClick(e) {
    const fn = e.target.dataset.action;
    if (fn && window._legacyHandlers?.[fn]) {
        window._legacyHandlers[fn](e);
    }
}
```

**Step 3:** Transition HTML gradually
```javascript
// BEFORE: <button onclick="loadInventory()">
// AFTER:  <button data-action="loadInventory">
```

**Effort:** 3-4 hours  
**Risk:** Medium (need to test all handlers)  
**Benefit:** Better code organization, smaller bundle, improved performance

---

### 1.2 Inline onclick Handlers 🟠 HIGH

**Current Pattern:**
```html
<button onclick="navigateTo('inventory')">Inventário</button>
<button onclick="loadInventory()">Carregar</button>
```

**Better Pattern:**
```html
<button data-view="inventory" class="btn-nav">Inventário</button>
<button data-action="load-inventory" class="btn-action">Carregar</button>
```

```javascript
// Handle in modules/events.js
document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
        navigateTo(btn.dataset.view);
    });
});
```

**Effort:** 2-3 hours  
**Risk:** Low-Medium  
**Benefit:** Cleaner HTML, better testability

---

### 1.3 Import Cycle Detection 🟡 MEDIUM

**Potential Cycles Found:**
- `state.js` → `core/state.js` (circular re-export)
- `auth/auth.js` → `data.js` → `auth.js`(?)

**Fix:**
```bash
# Install madge for cycle detection
npm install --save-dev madge

# Run analysis
npx madge --circular public/js/app.js
```

**Effort:** 1-2 hours  
**Risk:** Low

---

## 🎓 Phase 2: Documentation (Week 2)

### 2.1 JSDoc Comments 🟡 MEDIUM

Add documentation to all public exports:

```javascript
/**
 * Load inventory with optional filters
 * @param {Object} options - Configuration options
 * @param {boolean} options.lowStockOnly - Filter to low stock items only
 * @param {boolean} options.skipRefetch - Use cached data if available
 * @returns {Promise<void>}
 * @throws {Error} If fetch fails
 * @example
 * await loadInventory({ lowStockOnly: true });
 */
export async function loadInventory(options = {}) {
    // ...
}
```

**Files to Document:**
- `public/js/app.js` (entry point)
- `modules/state.js` (state management)
- `modules/data.js` (API layer)
- `modules/ui.js` (UI utilities)
- `functions/api/*.js` (backend)

**Effort:** 4-6 hours  
**Benefit:** Better IDE support, maintainability

---

### 2.2 README Updates 🟢 LOW

- [ ] Add Architecture Diagram (Mermaid)
- [ ] Document API Endpoints
- [ ] Add Development Guide
- [ ] Add Deployment Checklist

---

## 🧪 Phase 3: Testing (Week 3)

### 3.1 Unit Tests 🟠 HIGH

```bash
npm install --save-dev vitest @vitest/ui

# Test structure
tests/
├── unit/
│   ├── state.test.js
│   ├── data.test.js
│   ├── ui.test.js
│   └── inventory.test.js
└── integration/
    └── api.test.js
```

**Priority Tests:**
1. State management (add/update/delete products)
2. Data fetching (fetch, filter, pagination)
3. Auth flow (login, logout, permissions)

**Effort:** 8-10 hours  
**Benefit:** Confidence in refactoring, fewer bugs

---

### 3.2 E2E Tests 🟡 MEDIUM

```bash
npm install --save-dev playwright

# Critical flows to test
- Login/logout
- Create product
- Search and filter inventory
- Transit workflow
- Reports generation
```

**Effort:** 6-8 hours  
**Benefit:** Product quality validation

---

## 🏗️ Phase 4: Architecture (Week 4)

### 4.1 Module Reorganization 🟠 HIGH

**Current Structure (Messy):**
```
modules/
├── state.js, state-v2, state-v3
├── auth.js + auth/auth.js
├── data.js + data/data.js
├── ui.js + ui/ui.js
├── views.js + views/...
└── 50+ other files (mixed concerns)
```

**Target Structure (Clean):**
```
modules/
├── core/
│   ├── state.js (single source of truth)
│   ├── events.js (event system)
│   └── api.js (fetch wrapper)
├── features/
│   ├── auth/
│   │   ├── index.js
│   │   ├── login.js
│   │   └── permissions.js
│   ├── inventory/
│   │   ├── index.js
│   │   ├── products.js
│   │   └── search.js
│   ├── logistics/
│   ├── transit/
│   └── reports/
└── ui/
    ├── components/
    ├── dialogs/
    └── utils.js
```

**Effort:** 12-16 hours  
**Migration Path:** Gradual, one module at a time  
**Benefit:** Scalability, team collaboration

---

### 4.2 API Layer Abstraction 🟡 MEDIUM

Create proper API client:

```javascript
// modules/core/api.js
export class AspStockAPI {
    async getProducts(filters = {}) { }
    async createProduct(data) { }
    async updateProduct(id, data) { }
    async deleteProduct(id) { }
    async recordMovement(data) { }
    // ... other endpoints
}

export const api = new AspStockAPI();
```

**Effort:** 4-6 hours  
**Benefit:** Type safety, testability

---

## 📊 Phase 5: Performance (Week 5)

### 5.1 Bundle Analysis 🟡 MEDIUM

```bash
npm install --save-dev esbuild esbuild-plugin-visualizer

# Analyze what's included
npx esbuild public/js/app.js --bundle --analyze
```

**Expected Issues:**
- Large dependencies (PDF.js, ExcelJS, ag-grid)
- Multiple copies of dependencies
- Unused features of libraries

---

### 5.2 Dynamic Imports 🟡 MEDIUM

Load heavy features on-demand:

```javascript
// BEFORE: Always loaded
import { generateReports } from './modules/reports.js';

// AFTER: Loaded on-demand
async function initReports() {
    const { generateReports } = await import('./modules/reports.js');
    return generateReports;
}
```

---

## 🔐 Phase 6: Security Review (Week 6)

- [ ] Audit SQL queries for injection vulnerabilities
- [ ] Review JWT implementation (expiry, refresh tokens)
- [ ] Check CORS headers
- [ ] Validate input sanitization
- [ ] Review file upload handling
- [ ] Check rate limiting on APIs

---

## 🗓️ Timeline Summary

| Phase | Duration | Effort | Priority |
|-------|----------|--------|----------|
| Phase 1: Code Quality | 1-2 weeks | 10-15h | 🔴 HIGH |
| Phase 2: Documentation | 1 week | 6-8h | 🟡 MEDIUM |
| Phase 3: Testing | 1 week | 14-18h | 🟠 HIGH |
| Phase 4: Architecture | 1-2 weeks | 16-22h | 🟠 HIGH |
| Phase 5: Performance | 3-5 days | 5-8h | 🟡 MEDIUM |
| Phase 6: Security | 3-5 days | 6-10h | 🔴 CRITICAL |
| **TOTAL** | **4-6 weeks** | **57-81h** | - |

---

## 🎯 Success Metrics

After completing all phases:

- ✅ 100% documented public APIs (JSDoc)
- ✅ 100% of critical paths covered by tests
- ✅ 0 (or < 3) ESLint warnings
- ✅ Bundle size reduced by 15-20%
- ✅ Module cycle: 0
- ✅ Page load: < 2s on 3G
- ✅ Lighthouse score: > 90

---

## 📝 Notes

- Each phase should be in separate PR/branch
- Backup database before each phase
- Run full test suite before merging
- Keep backward compatibility where possible
- Document decisions in commit messages

---

## 🚨 Emergency Fixes (Do First)

If you need quick wins before refactoring:

1. **Add error boundaries** (5 mins) - Prevent crashes
2. **Add logging** (15 mins) - Debug issues
3. **Add rate limiting** (30 mins) - Prevent abuse
4. **Add input validation** (30 mins) - Security

These can be done in parallel with refactoring.
