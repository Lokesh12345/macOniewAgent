# Compilation Errors TODO - Oniew Agent macOS

**Status:** 40+ ACTIVE COMPILATION ERRORS  
**Priority:** CRITICAL - Must fix all before project can build  
**Last Updated:** December 2024

---

## 🚨 CRITICAL ERRORS TO FIX

### **ERROR 1: TaskAction Ambiguous Type Lookup**
- **File:** Models/Models.swift:77
- **Issue:** 'TaskAction' is ambiguous for type lookup in this context
- **Root Cause:** Multiple TaskAction definitions exist
  
**Locations:**
- [ ] **Models.swift:113** - Main definition: `struct TaskAction: Codable { type, target, parameters }`
- [ ] **PredictiveTaskPlanningService.swift:766** - Conflicting definition: `struct TaskAction { type, selector, value, metadata }`

**Fix Required:**
- [ ] Remove TaskAction from PredictiveTaskPlanningService.swift
- [ ] Ensure PredictiveTaskPlanningService uses Models.swift TaskAction
- [ ] Update any code expecting `selector`, `value`, `metadata` fields

---

### **ERROR 2: WebSocketMessage Codable Conformance**
- **File:** Models/ProtocolModels.swift:8
- **Issue:** Type 'WebSocketMessage' does not conform to protocol 'Decodable'
- **Root Cause:** MessageData protocol or implementing structs have Codable issues

**Investigation Required:**
- [ ] Check WebSocketMessage struct definition at line 8
- [ ] Verify MessageData protocol is properly Codable
- [ ] Check all MessageData conforming structs for Codable compliance
- [ ] Fix any non-Codable properties or missing implementations

---

### **ERROR 3: RealTimeLoggingService Initializer Override**
- **File:** Services/RealTimeLoggingService.swift:30
- **Issue:** Initializer does not override a designated initializer from its superclass
- **Root Cause:** Parameter mismatch with BaseService initializer

**Current Broken Code:**
```swift
override init(serviceName: String = "real-time-logging", logger: ServiceLoggerProtocol)
```

**Expected BaseService Signature:**
```swift
init(serviceName: String, logger: ServiceLoggerProtocol, eventBus: ServiceEventBusProtocol? = nil)
```

**Fix Required:**
- [ ] Add missing `eventBus` parameter to RealTimeLoggingService init
- [ ] Call super.init with all required parameters
- [ ] Ensure proper override syntax

---

### **ERROR 4: TaskProgress Constructor Call Issues**
- **File:** Services/RealTimeLoggingService.swift:70
- **Issue:** Extra arguments at positions #1, #2, #3, #4 in call
- **Issue:** Missing argument for parameter 'from' in call
- **Issue:** Cannot infer contextual base in reference to member 'preparing'

**Analysis Needed:**
- [ ] Check TaskProgress initializer parameters in Models.swift
- [ ] Verify what parameters are being passed at line 70
- [ ] Check if `.preparing` case exists in TaskProgressStatus enum
- [ ] Fix parameter mismatch and enum case issues

---

### **ERROR 5: Optional Unwrapping Issues**
- **File:** Services/RealTimeLoggingService.swift (Multiple lines)
- **Issues:**
  - Line 97: Value of optional type 'String?' must be unwrapped to a value of type 'String'
  - Line 98: String interpolation produces a debug description for an optional value
  - Line 111: Value of optional type 'String?' must be unwrapped

**Root Cause:** TaskStep.taskId is defined as optional but used as required

**Investigation Required:**
- [ ] Check TaskStep definition in Models.swift - is taskId optional?
- [ ] Determine if taskId should be optional or required
- [ ] Either unwrap optionals properly or make taskId non-optional
- [ ] Fix all string interpolation warnings

---

### **ERROR 6: Missing Properties in TaskStep**
- **File:** Services/RealTimeLoggingService.swift (Multiple references)
- **Issue:** Code expects properties that don't exist in TaskStep

**Missing Properties:**
- [ ] `step.type` - RealTimeLoggingService expects TaskStep to have `type` property
- [ ] `step.type.rawValue` - Expected enum with rawValue
- [ ] Various other properties expected but not defined

**Fix Required:**
- [ ] Check all TaskStep property usage in RealTimeLoggingService
- [ ] Either add missing properties to TaskStep or update code to use existing properties
- [ ] Ensure consistency between model definition and usage

---

### **ERROR 7: TaskProgressStatus Enum Case Missing**
- **File:** Services/RealTimeLoggingService.swift:70
- **Issue:** `.preparing` case doesn't exist in TaskProgressStatus enum

**Current TaskProgressStatus cases:** `running`, `paused`, `waiting`, `error`
**Expected cases:** Includes `.preparing`

**Fix Required:**
- [ ] Add `.preparing` case to TaskProgressStatus enum in Models.swift
- [ ] OR change code to use existing enum case
- [ ] Verify all enum cases match their usage across the codebase

---

### **ERROR 8: WebSocketMessage.MessageType Issues**
- **File:** Services/RealTimeLoggingService.swift
- **Issue:** Type 'WebSocketMessage.MessageType' has no member 'realTimeUpdate'

**Fix Required:**
- [ ] Check WebSocketMessage.MessageType enum definition
- [ ] Add missing `realTimeUpdate` case or use existing case
- [ ] Ensure all MessageType cases are properly defined

---

## 📋 SYSTEMATIC FIX PLAN

### **PHASE 1: Model Consistency (CRITICAL)**
- [ ] **Step 1.1:** Remove TaskAction duplicate from PredictiveTaskPlanningService.swift
- [ ] **Step 1.2:** Audit all TaskStep property usage vs definition
- [ ] **Step 1.3:** Fix TaskProgressStatus enum cases
- [ ] **Step 1.4:** Resolve optional vs required type mismatches
- [ ] **Step 1.5:** Test Models.swift compilation independently

### **PHASE 2: Service Initializer Fixes (HIGH)**
- [ ] **Step 2.1:** Fix RealTimeLoggingService initializer override
- [ ] **Step 2.2:** Check all other service initializers for similar issues
- [ ] **Step 2.3:** Ensure all services properly inherit from BaseService
- [ ] **Step 2.4:** Test service compilation with Models.swift

### **PHASE 3: Protocol & Message Fixes (HIGH)**
- [ ] **Step 3.1:** Fix WebSocketMessage Codable conformance
- [ ] **Step 3.2:** Add missing MessageType enum cases
- [ ] **Step 3.3:** Verify all MessageData implementations
- [ ] **Step 3.4:** Test ProtocolModels.swift compilation

### **PHASE 4: Cross-File Dependency Verification (CRITICAL)**
- [ ] **Step 4.1:** Compile all model files together
- [ ] **Step 4.2:** Compile models + services together
- [ ] **Step 4.3:** Run full Xcode build test
- [ ] **Step 4.4:** Address any remaining cross-file conflicts

---

## 🔍 VERIFICATION CHECKLIST

### **Before Starting Fixes:**
- [ ] Read current TaskAction definitions in both files
- [ ] Read current TaskStep definition and all its usages
- [ ] Read TaskProgressStatus enum definition
- [ ] Read WebSocketMessage and MessageData definitions
- [ ] Map all property expectations vs actual definitions

### **After Each Fix:**
- [ ] Test individual file compilation
- [ ] Test cross-file compilation
- [ ] Verify no new errors introduced
- [ ] Check error count reduction

### **Final Verification:**
- [ ] Full Xcode build without errors
- [ ] All type lookups resolve correctly
- [ ] No ambiguous type references
- [ ] All service initializers work properly
- [ ] All optional unwrapping handled correctly

---

## 📊 ERROR TRACKING

| Error Type | Files Affected | Status | Priority |
|------------|----------------|--------|----------|
| TaskAction Ambiguous | Models.swift, PredictiveTaskPlanningService.swift | ❌ Open | CRITICAL |
| WebSocketMessage Codable | ProtocolModels.swift | ❌ Open | HIGH |
| RealTimeLoggingService Init | RealTimeLoggingService.swift | ❌ Open | CRITICAL |
| TaskProgress Constructor | RealTimeLoggingService.swift | ❌ Open | HIGH |
| Optional Unwrapping | RealTimeLoggingService.swift | ❌ Open | MEDIUM |
| Missing Properties | Multiple files | ❌ Open | HIGH |
| Enum Cases Missing | Multiple files | ❌ Open | MEDIUM |
| MessageType Issues | RealTimeLoggingService.swift | ❌ Open | MEDIUM |

**Total Errors:** 40+  
**Critical:** 3  
**High:** 4  
**Medium:** 3  

---

## 🎯 SUCCESS CRITERIA

- [ ] **Zero compilation errors in Xcode build**
- [ ] **All type lookups resolve without ambiguity**
- [ ] **All service initializers properly override BaseService**
- [ ] **All optional values properly handled**
- [ ] **All enum cases match their usage**
- [ ] **All protocol conformances work correctly**
- [ ] **Cross-file dependencies resolve properly**

---

## 📝 NOTES

- **Previous "fixes" were incomplete** - used individual file parsing instead of full build
- **Must test with actual Xcode build** - not just swiftc -parse on individual files
- **Cascade effects** - fixing one type issue may reveal others
- **Dependencies matter** - model changes affect all services that use them

---

**END OF TODO - Use this as reference for all fixes**