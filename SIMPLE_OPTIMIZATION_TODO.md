# Simple Agent Optimization TODO - Oniew Agent

**Created:** August 2025  
**Approach:** KEEP IT SIMPLE - No complex Mac app coordination  
**Goal:** Fix core bottlenecks causing 15% failure rate and 12-24s delays  

---

## 🚨 LESSONS FROM PREVIOUS ATTEMPT

### **What Went Wrong Before:**
- ❌ **Over-engineering**: Complex 7-week Mac app coordination plan
- ❌ **Type duplication hell**: 64+ compilation errors from duplicate types  
- ❌ **Dependency loops**: Each fix broke something else
- ❌ **Big bang approach**: Tried to change everything at once
- ❌ **Ignored basic issues**: Focused on architecture while compilation was broken

### **What We'll Do Different:**
- ✅ **Chrome extension only**: No Mac app changes initially
- ✅ **One fix at a time**: Test each change independently  
- ✅ **Compilation first**: Fix basic errors before optimization
- ✅ **Measure impact**: Track actual performance improvements
- ✅ **Simple wins**: Focus on obvious bottlenecks only

---

## 🎯 PHASE 1: BASIC STABILITY (Week 1)

### **1.1 Fix Compilation Errors (CRITICAL)**
**Problem:** Can't optimize what doesn't compile  
**Impact:** Enable any changes at all  

**Tasks:**
- [ ] Fix TaskAction type ambiguity (Models.swift vs PredictiveTaskPlanningService.swift)
- [ ] Fix RealTimeLoggingService initializer override
- [ ] Fix WebSocketMessage Codable conformance
- [ ] Fix TaskStep property mismatches
- [ ] Test: Full Xcode build without errors

**Files to touch:**
- `Models/Models.swift` - Keep as single source of truth
- `Services/PredictiveTaskPlanningService.swift` - Remove duplicate types
- `Services/RealTimeLoggingService.swift` - Fix initializer
- `Models/ProtocolModels.swift` - Fix Codable issues

**Success criteria:** Zero compilation errors

### **1.2 Add Missing Actions (HIGH IMPACT)**
**Problem:** 15% task failure from missing action types  
**Impact:** Should reduce failures to <5%  

**Tasks:**
- [ ] Add ScrollPageAction to existing action registry
- [ ] Add RefreshPageAction for page reload scenarios
- [ ] Add WaitAction with configurable timeouts
- [ ] Add ModalDismissAction for popup handling
- [ ] Test: Run tasks that previously failed

**Files to touch:**
- `nanobrowser-master/chrome-extension/src/background/agent/actions/index.ts`
- Add new action files: `scroll.ts`, `refresh.ts`, `wait.ts`, `modal.ts`

**Success criteria:** Fewer "action not found" errors

---

## 🎯 PHASE 2: CORE SPEED FIXES (Week 2)  

### **2.1 Fix LLM Provider Reliability (HIGH IMPACT)**
**Problem:** "Planning failed" errors cause task stalls  
**Impact:** More reliable task execution  

**Tasks:**
- [ ] Add simple retry logic for LLM calls (3 retries with backoff)
- [ ] Add provider fallback (if OpenAI fails, try Anthropic)
- [ ] Add timeout handling for stuck LLM calls
- [ ] Fix authentication refresh issues
- [ ] Test: Tasks that previously stalled on planning

**Files to touch:**
- `nanobrowser-master/chrome-extension/src/background/agent/base.ts`
- `nanobrowser-master/chrome-extension/src/background/agent/planner.ts`

**Success criteria:** Fewer planning failures

### **2.2 DOM Build Timeout Prevention (MEDIUM IMPACT)**
**Problem:** DOM building hangs on complex pages  
**Impact:** Prevent infinite loops  

**Tasks:**
- [ ] Add hard timeout for DOM building (10 seconds max)
- [ ] Add fallback to simple DOM when full DOM fails
- [ ] Add page complexity detection (element count > 1000)
- [ ] Skip DOM rebuild if page hasn't changed
- [ ] Test: Complex pages that previously hung

**Files to touch:**
- `nanobrowser-master/chrome-extension/src/background/browser/dom.ts`
- `nanobrowser-master/chrome-extension/src/background/browser/page.ts`

**Success criteria:** No DOM build hangs

---

## 🎯 PHASE 3: SIMPLE SPEED IMPROVEMENTS (Week 3)

### **3.1 Skip Unnecessary DOM Rebuilds (MEDIUM IMPACT)**
**Problem:** Full DOM rebuild every step (2-3s waste)  
**Impact:** Save 2-3s per step  

**Tasks:**
- [ ] Add simple page change detection (URL + title hash)
- [ ] Skip DOM rebuild if page is unchanged
- [ ] Cache DOM for 30 seconds on static pages
- [ ] Only rebuild DOM when navigator reports page change
- [ ] Test: Multi-step tasks on same page

**Files to touch:**
- `nanobrowser-master/chrome-extension/src/background/browser/dom.ts`
- `nanobrowser-master/chrome-extension/src/background/browser/page.ts`

**Success criteria:** Fewer DOM rebuilds logged

### **3.2 Reduce Context Size (MEDIUM IMPACT)**
**Problem:** Sending full DOM + history every LLM call  
**Impact:** Faster LLM responses, lower costs  

**Tasks:**
- [ ] Trim DOM to relevant elements only (visible + interactive)
- [ ] Limit history to last 3 steps instead of all steps
- [ ] Remove duplicate or redundant context information
- [ ] Compress long text content in DOM elements
- [ ] Test: Compare token usage before/after

**Files to touch:**
- `nanobrowser-master/chrome-extension/src/background/agent/base.ts`
- `nanobrowser-master/chrome-extension/src/background/browser/dom.ts`

**Success criteria:** 30-50% token reduction

---

## 🎯 PHASE 4: USER EXPERIENCE FIXES (Week 4)

### **4.1 Better Error Messages (LOW EFFORT, HIGH UX)**
**Problem:** Generic error messages don't help users  
**Impact:** Users understand what went wrong  

**Tasks:**
- [ ] Add specific error messages for common failures
- [ ] Show progress updates during long operations
- [ ] Add retry suggestions for failed tasks
- [ ] Show estimated time remaining for tasks
- [ ] Test: User feedback on error clarity

**Files to touch:**
- `nanobrowser-master/chrome-extension/src/background/agent/base.ts`
- Mac app UI components for better error display

**Success criteria:** Users understand errors and next steps

### **4.2 Task Progress Visibility (LOW EFFORT, HIGH UX)**
**Problem:** Users don't know what agents are doing  
**Impact:** Keep users engaged during long tasks  

**Tasks:**
- [ ] Add step-by-step progress messages
- [ ] Show current agent phase (Planning/Navigating/Validating)
- [ ] Display found elements and actions being taken
- [ ] Add progress percentage for multi-step tasks
- [ ] Test: User feedback on progress visibility

**Files to touch:**
- WebSocket messages between extension and Mac app
- Mac app UI for progress display

**Success criteria:** Users see real-time progress

---

## 📊 SUCCESS METRICS

### **Performance Targets:**
- [ ] **Compilation:** 0 errors (from 64+ errors)
- [ ] **Failure rate:** <5% (from 15%)  
- [ ] **Speed improvement:** 30-50% faster (from 12-24s to 6-12s)
- [ ] **Token usage:** 30-50% reduction
- [ ] **DOM timeouts:** 0 hangs (from multiple daily)

### **Validation Tests:**
- [ ] Run 10 common tasks and measure success rate
- [ ] Time task completion before/after each phase
- [ ] Monitor WebSocket messages for error patterns
- [ ] Test on complex pages (Gmail, Amazon, GitHub)
- [ ] Verify no regressions in working functionality

---

## 🚦 IMPLEMENTATION RULES

### **DO:**
- ✅ Test each change immediately with real tasks
- ✅ Keep changes small and focused
- ✅ Measure performance impact of each phase
- ✅ Fix compilation errors before optimization
- ✅ Document what works and what doesn't

### **DON'T:**
- ❌ Change Mac app architecture (too complex)
- ❌ Add new services or major refactoring  
- ❌ Make multiple changes at once
- ❌ Skip testing after each change
- ❌ Add complex coordination between components

### **Rollback Plan:**
- Keep git commits small for easy rollback
- Test each phase independently
- If any phase causes new issues, revert immediately
- Only proceed to next phase if current phase is stable

---

## 📝 TRACKING PROGRESS

### **Week 1: Stability**
- [ ] Phase 1.1: Compilation fixed (0 errors)
- [ ] Phase 1.2: Basic actions added (5+ new actions)

### **Week 2: Reliability** 
- [ ] Phase 2.1: LLM reliability improved (<3% planning failures)
- [ ] Phase 2.2: DOM timeouts prevented (0 hangs)

### **Week 3: Speed**
- [ ] Phase 3.1: DOM rebuilds reduced (50% fewer rebuilds)
- [ ] Phase 3.2: Context size reduced (40% token savings)

### **Week 4: UX**
- [ ] Phase 4.1: Error messages improved (user-friendly)
- [ ] Phase 4.2: Progress visibility added (real-time updates)

---

## 🎯 EXPECTED RESULTS

**After Week 1:** Project compiles, basic task success rate improves  
**After Week 2:** Reliable task execution, no more stalls or hangs  
**After Week 3:** 30-50% faster task completion, lower API costs  
**After Week 4:** Better user experience, clearer feedback  

**Total effort:** 4 weeks vs 7 weeks from previous plan  
**Risk level:** LOW (no architectural changes)  
**Rollback difficulty:** EASY (small isolated changes)

---

*This plan focuses on proven bottlenecks with simple fixes, avoiding the complexity that caused previous attempts to fail.*