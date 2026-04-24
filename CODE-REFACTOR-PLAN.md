# TrackWise Code Refinement Plan

**Goal:** Transform from prototype to robust, stable tool  
**Scope:** Fix 5 critical + 7 high-severity issues  
**Timeline:** 4 weeks (phased implementation)  
**Stability Target:** Zero data loss, graceful error handling, consistent state

---

## Critical Issues (Block Production) - Week 1

### 1. Hardcoded API URLs → Environment Config ⭐
**Current Risk:** Application breaks if server port changes  
**Impact:** 30+ locations need fixing

**Solution:**
```typescript
// src/config/api.ts (NEW)
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const API_ENDPOINTS = {
  dashboard: `${API_BASE_URL}/api/dashboard`,
  parseSportsbet: `${API_BASE_URL}/api/parse-sportsbet`,
  placeBet: `${API_BASE_URL}/api/bets/sportsbet`,
  placeBets: `${API_BASE_URL}/api/bets/batch`,
  // ... 25 more
} as const;
```

**Files to Create:**
- `.env.local.example` with `VITE_API_URL=http://localhost:3001`
- `src/config/api.ts` with centralized endpoints
- `src/lib/fetch.ts` with typed fetch wrapper

**Implementation:** 2-3 hours

---

### 2. Missing HTTP Status Validation ⭐⭐
**Current Risk:** Failed API calls treated as successful; silent data loss  
**Impact:** Every fetch call (30+)

**Solution - Wrapper Function:**
```typescript
// src/lib/fetch.ts (NEW)
export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 100)}`);
  }
  
  try {
    return await response.json() as T;
  } catch {
    throw new Error(`Invalid JSON response from ${url}`);
  }
}
```

**Usage Example:**
```typescript
// Before (WRONG - silent failures)
const res = await fetch(url);
const data = await res.json();

// After (CORRECT - explicit error handling)
try {
  const data = await apiFetch<DashboardData>(API_ENDPOINTS.dashboard);
} catch (err) {
  setError(err instanceof Error ? err.message : 'API error');
}
```

**Files to Update:** DailyPicks.tsx, RaceEntry.tsx, PaperTradingDashboard.tsx, FormHub.tsx, Recommender.tsx, Analysis.tsx

**Implementation:** 3-4 hours

---

### 3. Type Safety - Remove `any` Types ⭐
**Current Risk:** Runtime crashes on missing properties  
**Impact:** 15+ instances

**Solution:**
```typescript
// src/types/index.ts (NEW)
export interface DashboardData {
  success: boolean;
  bank: number;
  totalStaked: number;
  totalReturned: number;
  betsPlaced: number;
  betsWon: number;
}

export interface ParsedPick {
  track: string;
  raceNum: number;
  horse: string;
  jockey: string;
  trainer: string;
  odds: number;
  confidence: number;
  raceTime?: string;
}

// More interfaces for all API responses...
```

**Files to Create:**
- `src/types/index.ts` (centralized types)
- `src/types/api.ts` (API request/response types)
- `src/types/domain.ts` (business logic types)

**Update DailyPicks.tsx:**
```typescript
// Before
const results = await Promise.allSettled(
  urls.map(url => fetch(...).then(res => res.json()))
);

// After
const results = await Promise.allSettled(
  urls.map(url => apiFetch<ParseSportsbetResponse>(API_ENDPOINTS.parseSportsbet, { ... }))
);
```

**Implementation:** 4-5 hours

---

### 4. JSON.parse Safety ⭐
**Current Risk:** Corrupted localStorage crashes app  
**Impact:** 8+ locations

**Solution:**
```typescript
// src/lib/storage.ts (NEW)
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    console.warn('Failed to parse JSON:', json.slice(0, 50));
    return fallback;
  }
}

// Usage in App.tsx:
const savedKB = safeJsonParse(
  localStorage.getItem(LS_KB) || '{}',
  initKB()
);
```

**Files to Update:** App.tsx, DailyPicks.tsx

**Implementation:** 1-2 hours

---

### 5. Race Condition: Atomic Bet Placement ⭐
**Current Risk:** Bank updated before bets saved → data corruption  
**Location:** DailyPicks.tsx lines 614-628

**Solution - Transaction Pattern:**
```typescript
// src/lib/betTransaction.ts (NEW)
export async function placeBetsTransaction(
  bets: Bet[],
  currentBank: number
) {
  const totalStaked = calculateStake(bets);
  
  // 1. Validate we have funds
  if (totalStaked > currentBank) {
    throw new Error('Insufficient funds');
  }
  
  // 2. Place all bets FIRST (this is the transaction)
  const placedBets = await Promise.all(
    bets.map(bet => placeSingleBet(bet))
  );
  
  // 3. ONLY THEN deduct from bank (commit)
  await updateBank(currentBank - totalStaked);
  
  // 4. Log transaction
  await logBetsPlaced(placedBets);
  
  return placedBets;
}
```

**Error Handling:**
```typescript
try {
  const placed = await placeBetsTransaction(topPicks, currentBank);
  setBets(placed);
  // Bank updated atomically
} catch (err) {
  // Bank is unchanged, bets may be partially placed
  // User can retry or manually sync
  setError('Failed to place all bets. Check dashboard.');
}
```

**Implementation:** 2-3 hours

---

## High-Severity Issues - Week 2

### 6. Component Bloat: Split DailyPicks.tsx (1520 lines) ⭐⭐
**Solution: Extract 5 focused components**

```
src/pages/DailyPicks/
  ├── index.tsx (main container, 200 lines)
  ├── PickGenerator.tsx (315-430, generate picks UI)
  ├── BetPlacer.tsx (place bets logic)
  ├── ResultRecorder.tsx (entry form logic)
  ├── HistoricalChart.tsx (chart display)
  ├── BetsTable.tsx (table display)
  ├── hooks/useBets.ts (shared bet state)
  ├── hooks/useGeneration.ts (generation logic)
  └── hooks/usePlacement.ts (placement logic)
```

**Files to Create:** 8 files, ~200 lines each (much testable)

**Implementation:** 8-10 hours

---

### 7. Timeout Handling for All Fetches
**Add timeout wrapper:**
```typescript
// src/lib/fetch.ts (extend previous)
export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000  // Default 15s
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json() as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Implementation:** 1 hour (integrated with issue #2)

---

### 8. Memory Leak: setInterval Cleanup
**Location:** FormHub.tsx (line 88), Analysis.tsx (line 113)

```typescript
// Before (WRONG)
const interval = setInterval(fetchKB, 10000);

// After (CORRECT)
useEffect(() => {
  const interval = setInterval(fetchKB, 10000);
  return () => clearInterval(interval);
}, []);
```

**Files to Fix:** 2 files  
**Implementation:** 0.5 hours

---

### 9. Duplicate State Management
**Location:** DailyPicks.tsx (lines 73-92)

**Current:**
```typescript
const [picks, setPicks] = useState<Bet[]>([]);
const [placedBets, setPlacedBets] = useState<Bet[]>([]);
const [activeBets, setActiveBets] = useState<Bet[]>([]);
const [archiveBets, setArchiveBets] = useState<Bet[]>([]);
```

**After (Single Source of Truth):**
```typescript
// src/pages/DailyPicks/hooks/useBets.ts
interface BetsState {
  generated: Bet[];      // From generation step
  placed: Bet[];         // Successfully placed
  active: Bet[];         // Waiting for results
  archived: Bet[];       // Completed
}

export function useBets() {
  const [state, setState] = useState<BetsState>({
    generated: [],
    placed: [],
    active: [],
    archived: []
  });
  
  return { state, setState };
}
```

**Implementation:** 1-2 hours

---

### 10. Null/Undefined Checks in simulation.ts
**Pattern fix:**
```typescript
// Before (UNSAFE)
const winner = resolved.find(r => r.finishing === 1)!;
const runner = resolved.find(r => r.id === top.id)!;

// After (SAFE)
const winner = resolved.find(r => r.finishing === 1);
if (!winner) {
  throw new Error(`No winner found for race`);
}

const runner = resolved.find(r => r.id === top.id);
if (!runner) {
  throw new Error(`Runner ${top.id} not found`);
}
```

**Files to Fix:** simulation.ts (8+ locations)  
**Implementation:** 1 hour

---

### 11. Console.log Cleanup
**Remove debug logs or make conditional:**
```typescript
// src/lib/debug.ts (NEW)
const DEBUG = import.meta.env.DEV;

export function debugLog(message: string, data?: any) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data);
  }
}

// Usage
debugLog('[CLV] Fetching TAB odds for races:', racesToFetch);
```

**Files to Update:** DailyPicks.tsx (remove 10+ console.log lines)  
**Implementation:** 0.5 hours

---

### 12. Race Condition: Bank Atomicity
**Extend betTransaction (issue #5) to handle bank:**
```typescript
async function atomicBetAndBankUpdate(bets: Bet[], currentBank: number) {
  // Use database transaction if possible
  // Or implement optimistic update + rollback
}
```

**Implementation:** 1-2 hours

---

### 13. UI Framework Standardization
**Decision: Keep shadcn (lighter, already in App.tsx)**

**Action:**
- Replace MUI imports in DailyPicks.tsx with shadcn equivalents
- Create shadcn wrapper components for table, form inputs
- Remove MUI dependency from package.json

**Files to Update:** DailyPicks.tsx, RaceEntry.tsx, and 3 more  
**Implementation:** 6-8 hours

---

## Implementation Order

### Phase 1: Critical Fixes (Week 1) - 4-5 days
1. ✅ API config + fetch wrapper (`src/lib/fetch.ts`, `src/config/api.ts`)
2. ✅ Type definitions (`src/types/index.ts`)
3. ✅ Safe JSON parsing (`src/lib/storage.ts`)
4. ✅ Atomic bet placement pattern
5. Update all fetch calls to use new wrapper

**Effort:** ~12-15 hours  
**Benefit:** Eliminates data loss risk, improves error visibility

---

### Phase 2: High-Severity Fixes (Week 2) - 3-4 days
6. ✅ Component split (DailyPicks → 5 components)
7. ✅ Memory leak fixes (setInterval cleanup)
8. ✅ State consolidation (single source of truth)
9. ✅ Null checks in simulation.ts
10. ✅ Console.log cleanup

**Effort:** ~20-25 hours  
**Benefit:** Testable code, memory safety, cleaner state

---

### Phase 3: Code Quality (Week 3) - 2-3 days
11. ✅ UI framework standardization (shadcn only)
12. ✅ Offline detection
13. ✅ Centralized error formatting

**Effort:** ~15-20 hours  
**Benefit:** Maintainability, consistent UX

---

### Phase 4: Testing & Validation (Week 4) - 2-3 days
14. ✅ Add integration tests for critical paths
15. ✅ Add error scenario tests
16. ✅ Load testing
17. ✅ Data consistency validation

**Effort:** ~15-20 hours  
**Benefit:** Confidence in stability

---

## Metrics for Success

| Metric | Before | Target |
|--------|--------|--------|
| API errors handled | 5% | 100% |
| Type coverage | 60% | 95% |
| Large files (>500 lines) | 3 | 0 |
| Memory leaks | 2 | 0 |
| Test coverage | 0% | >60% |
| Data loss incidents | Possible | None |

---

## Files to Create

1. ✅ `src/lib/fetch.ts` — API wrapper with error handling
2. ✅ `src/lib/storage.ts` — Safe localStorage access
3. ✅ `src/lib/debug.ts` — Conditional logging
4. ✅ `src/config/api.ts` — Centralized API endpoints
5. ✅ `src/types/index.ts` — Shared type definitions
6. ✅ `src/pages/DailyPicks/` — Component split
7. ✅ `src/pages/DailyPicks/hooks/useBets.ts` — State management
8. ✅ `.env.local.example` — Environment config template

---

## Breaking Changes (Plan for Migration)

1. API endpoints centralized → no breaking change for users
2. Component restructure → internal only, same API surface
3. Removed MUI → UI looks same (shadcn is compatible)
4. Type additions → backward compatible (stronger validation)

**Migration Path:** Deploy as single release; no gradual rollout needed

---

## Sign-Off Criteria

- [ ] All critical issues fixed and tested
- [ ] Zero data loss possible (atomic transactions)
- [ ] All errors visible to user (no silent failures)
- [ ] No memory leaks (test with DevTools)
- [ ] Types cover 95% of code
- [ ] DailyPicks < 300 lines (split complete)
- [ ] Tests pass for critical paths
- [ ] Staging environment validates changes

---

**Total Effort:** ~60-80 hours (1.5-2 weeks with 40h/week)  
**ROI:** From "prototype" to "production-ready"
