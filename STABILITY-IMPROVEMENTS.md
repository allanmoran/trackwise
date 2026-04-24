# TrackWise Stability Improvements - Implementation Log

**Date Started:** April 11, 2026  
**Status:** Phase 1 (Critical Fixes) - 50% complete  
**Target:** Production-ready tool

---

## ✅ Completed - Critical Infrastructure

### 1. API Configuration Module
**File:** `src/config/api.ts`  
**What:** Centralized API endpoint management  
**Status:** ✅ Ready
```typescript
import { API_ENDPOINTS } from '@/config/api';
const data = await apiFetch(API_ENDPOINTS.dashboard);
```

### 2. Safe Fetch Wrapper
**File:** `src/lib/fetch.ts`  
**What:** Error handling, timeouts, type safety  
**Features:**
- ✅ HTTP status validation (required)
- ✅ Timeout handling (15s default)
- ✅ Typed responses (`apiFetch<T>()`)
- ✅ Distinguishes ApiError, TimeoutError, NetworkError
- ✅ Helper functions: `apiPost()`, `apiGet()`

**Status:** ✅ Ready

### 3. Type Definitions
**File:** `src/types/index.ts`  
**What:** Centralized TypeScript interfaces  
**Includes:**
- ✅ API Response types (DashboardData, ParseSportsbetResponse, etc.)
- ✅ Domain models (Bet, Race, Runner, ParsedPick)
- ✅ Request body types
- ✅ UI/State types
- ✅ Configuration types

**Status:** ✅ Ready

### 4. Safe Storage Utilities
**File:** `src/lib/storage.ts`  
**What:** localStorage access with fallbacks  
**Functions:**
- ✅ `safeJsonParse()` - parse JSON with fallback
- ✅ `getStorage<T>()` - read from localStorage
- ✅ `setStorage()` - write to localStorage
- ✅ `removeStorage()` - delete keys
- ✅ `clearAllStorage()` - clear all

**Status:** ✅ Ready

### 5. Debug Logging Utility
**File:** `src/lib/debug.ts`  
**What:** Development-only logging (removed from production)  
**Status:** ✅ Ready

### 6. Environment Configuration
**File:** `.env.local.example`  
**What:** Template for environment setup  
**Status:** ✅ Ready

---

## 📋 Remaining - Code Migration

### Phase 1: Update DailyPicks.tsx (1520 lines → split + migrate)

**Tasks:**
- [ ] **Step 1a:** Replace all `fetch()` calls with `apiFetch()`
  - Lines 104, 116, 143, 170, 186, 288, 344, 499, 567, 590, 621, 672, 682, 730, 763
  - Use: `const data = await apiFetch(API_ENDPOINTS.dashboard);`
  
- [ ] **Step 1b:** Add proper error handling
  - Wrap in try-catch blocks
  - Show error messages to user
  - Use debug.log() instead of console.log()

- [ ] **Step 1c:** Replace `useState<any>` with typed versions
  - Use types from `src/types/index.ts`
  - `useState<Bet[]>` instead of `useState<any>`

- [ ] **Step 1d:** Replace `JSON.parse()` calls
  - Use `safeJsonParse()` function
  - Lines: 295, 506, 735, 767

- [ ] **Step 1e:** Split into 5 components
  - `PickGenerator.tsx` (generation logic)
  - `BetPlacer.tsx` (placement logic)
  - `ResultRecorder.tsx` (entry form)
  - `HistoricalChart.tsx` (chart display)
  - `BetsTable.tsx` (table display)
  - Create `src/pages/DailyPicks/` folder

**Effort:** 12-15 hours  
**Benefit:** Type-safe, testable, maintainable

---

### Phase 2: Update Other Pages (RaceEntry, PaperTradingDashboard, etc.)

**Files to update:**
- [ ] `src/pages/RaceEntry.tsx` (lines 246, 282, 300, 319)
- [ ] `src/pages/PaperTradingDashboard.tsx` (lines 71, 115, 144, 185, 218, 231, 256)
- [ ] `src/pages/FormHub.tsx` (lines 67, 95)
- [ ] `src/pages/Recommender.tsx` (lines 61, 74, 118)
- [ ] `src/pages/Analysis.tsx` (lines 113-120)

**Per-file effort:** 1-2 hours  
**Total:** 8-10 hours

---

### Phase 3: Fix Memory Leaks

**Tasks:**
- [ ] Fix FormHub.tsx (line 88): setInterval cleanup
  ```typescript
  useEffect(() => {
    const interval = setInterval(fetchKB, 10000);
    return () => clearInterval(interval);
  }, []);
  ```

- [ ] Fix Analysis.tsx (line 113): similar setInterval cleanup

**Effort:** 0.5 hours

---

### Phase 4: Remove Console Logs

**Tasks:**
- [ ] Replace console.log() with debug.log()
- [ ] Remove debug logs from production code
- [ ] Keep error logs only (console.error)

**Files:** DailyPicks.tsx (10+ lines), others  
**Effort:** 1 hour

---

### Phase 5: Fix Null Checks in simulation.ts

**Tasks:**
- [ ] Replace `!` non-null assertions with runtime checks
  - Line 85: `const winner = resolved.find(...)`
  - Line 104: `const runner = resolved.find(...)`
  - Line 293: `const r = resolved.find(...)`

**Effort:** 1 hour

---

## 🎯 Progress Tracking

### Infrastructure (100%)
- [x] API config
- [x] Fetch wrapper
- [x] Type definitions
- [x] Storage utilities
- [x] Debug logging
- [x] Environment config

### DailyPicks.tsx Migration (0%)
- [ ] Replace fetch calls (Phase 1a)
- [ ] Add error handling (Phase 1b)
- [ ] Add type safety (Phase 1c)
- [ ] Safe JSON parsing (Phase 1d)
- [ ] Component split (Phase 1e)

### Other Pages (0%)
- [ ] RaceEntry.tsx
- [ ] PaperTradingDashboard.tsx
- [ ] FormHub.tsx
- [ ] Recommender.tsx
- [ ] Analysis.tsx

### Bug Fixes (0%)
- [ ] Memory leak fixes
- [ ] Console.log cleanup
- [ ] Null check safety
- [ ] Status validation on all fetches

---

## 📊 Impact Assessment

| Issue | Before | After | Benefit |
|-------|--------|-------|---------|
| API errors handled | 30 silent fails | 30 explicit errors | Users see what went wrong |
| Type safety | 60% | 95%+ | Fewer runtime crashes |
| Memory leaks | 2 instances | 0 | Stable long-running tool |
| Component size | 1 × 1520 lines | 5 × 300 lines | Testable, maintainable |
| Data loss risk | Possible | None (atomic) | Safe bet placement |
| Production console logs | 10+ per page | Debug only | Cleaner, faster |

---

## 📋 Integration Checklist

Before shipping, verify:
- [ ] All pages use `apiFetch()` instead of raw `fetch()`
- [ ] All error handling in try-catch blocks
- [ ] All types use definitions from `src/types/index.ts`
- [ ] All localStorage uses `getStorage()`, `setStorage()`
- [ ] All logging uses `debug.log()` not `console.log()`
- [ ] No `any` types except in legacy interfaces
- [ ] No `!` non-null assertions
- [ ] setInterval calls have cleanup in useEffect
- [ ] HTTP 4xx/5xx responses throw errors
- [ ] Timeouts handled (at least 15s default)

---

## 🚀 Next Steps

1. **Immediate (Today):**
   - ✅ Create infrastructure files (DONE)
   - Create pull request with new utilities

2. **This Week (Days 1-3):**
   - Update DailyPicks.tsx to use new utilities
   - Update other pages (RaceEntry, etc.)
   - Fix memory leaks

3. **This Week (Days 4-5):**
   - Fix null check assertions
   - Remove console.log() statements
   - Testing and validation

4. **Next Week:**
   - Component split (DailyPicks)
   - Integration tests
   - Load testing
   - Staging validation

---

## 📚 Usage Examples

### Using the new fetch wrapper
```typescript
import { apiFetch, apiPost } from '@/lib/fetch';
import { API_ENDPOINTS } from '@/config/api';
import type { DashboardData } from '@/types';

// GET request
try {
  const dashboard = await apiFetch<DashboardData>(
    API_ENDPOINTS.dashboard
  );
  setBank(dashboard.bank);
} catch (err) {
  if (err instanceof ApiError) {
    setError(`Server error: ${err.status}`);
  } else if (err instanceof TimeoutError) {
    setError('Request timeout - server may be down');
  } else {
    setError(err instanceof Error ? err.message : 'Unknown error');
  }
}

// POST request
try {
  const result = await apiPost(
    API_ENDPOINTS.placeBets,
    { bets: topPicks },
    { timeoutMs: 30000 }
  );
} catch (err) {
  // Error automatically propagated
}
```

### Using type-safe storage
```typescript
import { getStorage, setStorage } from '@/lib/storage';
import type { BetsState } from '@/types';

const saved = getStorage<BetsState>(
  'trackwise_bets',
  { generated: [], placed: [], active: [], archived: [] }
);

setStorage('trackwise_bets', { ...saved, active: newBets });
```

### Using debug logging
```typescript
import { debug } from '@/lib/debug';

debug.log('[CLV] Fetching odds for races:', racesToFetch);
debug.warn('Request took longer than expected');
debug.error('Failed to place bet', error);
```

---

## Rollback Plan

If issues arise during migration:
1. Keep old utility functions alongside new ones
2. Feature flag the migration (e.g., `VITE_USE_NEW_FETCH=true`)
3. Gradual rollout by page (not all at once)
4. Easy revert: just toggle flag or remove new imports

---

**Questions?** See `CODE-REFACTOR-PLAN.md` for full details.

**Status:** Ready for migration phase. Infrastructure 100% complete, waiting on code updates.
