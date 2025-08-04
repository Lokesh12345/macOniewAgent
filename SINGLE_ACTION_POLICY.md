# Single Form Action Policy - Simple Solution to Gmail Autocomplete Issue

## Problem Analysis (From Screenshots)

1. **Screenshot 1**: Gmail compose form with empty fields (To=158, Subject=161, Body=162)
2. **Screenshot 2**: After entering email in "To" field → Gmail shows autocomplete dropdown → DOM structure changes
3. **Screenshot 3**: System needs to click autocomplete suggestion → DOM changes again

## Root Cause

**Batch Processing + DOM Changes = Wrong Element Targeting**

1. ✅ LLM plans 3 actions based on initial DOM: `input_text(158), input_text(161), input_text(162)`
2. ✅ Executes first action: Fill "To" field (index 158) - **succeeds**
3. ❌ Gmail shows autocomplete → **DOM structure changes** 
4. ❌ Executes remaining actions with stale indexes: Subject=161, Body=162
5. ❌ But indexes now point to **different elements** due to autocomplete UI

## Solution: Single Form Action Policy

### Implementation

#### 1. **Enforce Single Form Action per LLM Call**
```typescript
// In navigator.ts - Filter LLM output to keep only first form action
if (formActions.length > 1) {
  logger.warning('🚨 ENFORCING SINGLE FORM ACTION POLICY');
  // Keep only first form action, drop the rest
  const filteredActions = keepOnlyFirstFormAction(modelOutput.action);
  modelOutput.action = filteredActions;
}
```

#### 2. **Form Actions Defined**
```typescript
const isFormAction = ['click_element', 'input_text', 'select_dropdown'].includes(actionName);
```

#### 3. **Non-Form Actions Still Batch**
- Navigation actions (`go_to_url`, `scroll`, etc.) can still be batched
- Only form interactions are limited to one per execution cycle

### Expected Behavior

**Before (Problematic)**:
```
Step 1: LLM plans → [input_text(158), input_text(161), input_text(162)]
        Execute all 3 → DOM changes after first → wrong elements targeted
```

**After (Fixed)**:
```  
Step 1: LLM plans → [input_text(158), input_text(161), input_text(162)]
        Filter to → [input_text(158)] only
        Execute → Fill "To" field → DOM changes

Step 2: LLM re-plans with fresh DOM → [input_text(NEW_INDEX)]  
        Execute → Fill "Subject" field → DOM changes

Step 3: LLM re-plans with fresh DOM → [input_text(NEW_INDEX)]
        Execute → Fill "Body" field
```

## Benefits

### ✅ **Solves Gmail Autocomplete Issue**
- Each form action gets fresh DOM state
- No stale element indexes
- Autocomplete dropdowns handled naturally

### ✅ **Simple & Robust**
- No complex retry logic needed
- No over-engineering
- Leverages existing LLM re-planning capability

### ✅ **Preserves Performance**  
- Non-form actions still batch efficiently
- Only form interactions are slowed (necessarily)
- Minimal code changes

### ✅ **Self-Healing**
- System automatically adapts to any DOM changes
- Works for all dynamic websites, not just Gmail
- No website-specific hacks needed

## Code Changes

### Files Modified

1. **`/navigator.ts`** - Added single form action enforcement
   - Filters LLM output to keep only first form action
   - Logs detailed information about filtering decisions
   - Preserves non-form action batching

2. **`/builder.ts`** - Simplified verification 
   - Removed over-engineered retry logic
   - Kept simple verification for debugging
   - Updated log messages to reflect new policy

### Logging Output

The system will now show:
```
🚨 ENFORCING SINGLE FORM ACTION POLICY: LLM planned 3 actions with 3 form interactions
✅ KEEPING FIRST FORM ACTION: input_text
❌ DROPPING ADDITIONAL FORM ACTION: input_text  
❌ DROPPING ADDITIONAL FORM ACTION: input_text
📊 FILTERED ACTIONS: Reduced from 3 to 1 actions
```

## Testing

The next Gmail compose task should show:
1. **Step 1**: Fill "To" field only → Gmail autocomplete appears
2. **Step 2**: LLM re-plans with fresh DOM → Fill "Subject" field  
3. **Step 3**: LLM re-plans with fresh DOM → Fill "Body" field
4. **Each step uses correct element indexes** from fresh DOM analysis

This solves the core issue: **stale element indexes after DOM changes**.