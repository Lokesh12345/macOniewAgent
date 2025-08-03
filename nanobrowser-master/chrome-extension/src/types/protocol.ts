// Enhanced WebSocket Protocol Types for Chrome Extension
// Version 1.0 - Foundation for intelligent Mac app coordination
// Matches ProtocolModels.swift structure

// Base Protocol Structure
export interface WebSocketMessage<T extends MessageData = MessageData> {
  type: MessageType;
  version: string;
  messageId: string;
  timestamp: string; // ISO 8601 date string
  data: T;
}

export type MessageType =
  // Existing message types (backward compatibility)
  | 'ping'
  | 'pong'
  | 'execute_task'
  | 'abort_task'
  | 'settings_update'
  | 'general_settings_update'
  | 'firewall_settings_update'
  | 'settings_request'
  | 'general_settings_request'
  | 'firewall_settings_request'
  | 'executor_event'
  | 'task_analysis'
  | 'llm_thinking'
  | 'step_progress'
  | 'user_input_needed'
  | 'task_completion'
  // New message types for Mac app coordination
  | 'llm_request'
  | 'llm_response'
  | 'context_optimization'
  | 'dom_strategy'
  | 'dom_strategy_response'
  | 'action_coordination'
  | 'action_coordination_response'
  | 'task_planning_request'
  | 'task_planning_response'
  | 'tab_analysis_request'
  | 'tab_analysis_response'
  | 'page_analysis_request'
  | 'page_analysis_response'
  | 'agent_progress'
  | 'task_roadmap_update'
  | 'resource_optimization'
  | 'error_recovery'
  | 'performance_metrics';

// Message Data Base Interface
export interface MessageData {
  source: string;
}

// LLM Coordination Messages
export interface LLMRequestData extends MessageData {
  source: 'mac_app';
  requestId: string;
  provider: string;
  modelName: string;
  messages: LLMMessage[];
  parameters?: LLMParameters;
  context?: TaskContext;
  priority: RequestPriority;
}

export interface LLMResponseData extends MessageData {
  source: 'extension';
  requestId: string;
  success: boolean;
  response?: string;
  error?: string;
  tokensUsed?: number;
  responseTime?: number;
  providerUsed?: string;
}

export interface LLMMessage {
  role: string;
  content: string;
  metadata?: Record<string, string>;
}

export interface LLMParameters {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: string;
}

export type RequestPriority = 'low' | 'medium' | 'high' | 'urgent';

// Task Planning Messages
export interface TaskPlanningRequestData extends MessageData {
  source: 'extension';
  requestId: string;
  userRequest: string;
  currentUrl?: string;
  availableTabs: BrowserTabInfo[];
  browserContext: BrowserContextInfo;
  preferences?: UserPreferences;
}

export interface TaskPlanningResponseData extends MessageData {
  source: 'mac_app';
  requestId: string;
  success: boolean;
  roadmap?: TaskRoadmap;
  error?: string;
  estimatedDuration?: number;
  complexity: TaskComplexity;
  requiredPermissions?: string[];
}

// DOM Strategy Messages
export interface DOMStrategyRequestData extends MessageData {
  source: 'extension';
  requestId: string;
  pageUrl: string;
  pageTitle: string;
  pageComplexity?: PageComplexity;
  previousFailures?: DOMFailure[];
  targetActions: string[];
}

export interface DOMStrategyResponseData extends MessageData {
  source: 'mac_app';
  requestId: string;
  strategy: DOMStrategy;
  fallbackStrategies: DOMStrategy[];
  cacheElements: string[];
  timeoutSettings: TimeoutConfiguration;
  reasoning: string;
}

// Action Coordination Messages
export interface ActionCoordinationRequestData extends MessageData {
  source: 'extension';
  requestId: string;
  actionType: string;
  targetElement?: ElementInfo;
  actionData: Record<string, any>;
  pageContext: PageContext;
}

export interface ActionCoordinationResponseData extends MessageData {
  source: 'mac_app';
  requestId: string;
  macAppActions: MacAppAction[];
  extensionActions: ExtensionAction[];
  coordination: ActionCoordination;
  optimizations: ActionOptimization[];
}

// Tab Analysis Messages
export interface TabAnalysisRequestData extends MessageData {
  source: 'extension';
  requestId: string;
  taskContext: TaskContext;
  availableTabs: BrowserTabInfo[];
}

export interface TabAnalysisResponseData extends MessageData {
  source: 'mac_app';
  requestId: string;
  analysis: TabAnalysisResult;
  recommendations: TabRecommendation[];
  estimatedTimeSaved: number;
}

// Progress and Status Messages
export interface AgentProgressData extends MessageData {
  source: 'extension';
  stepId: string;
  agent: AgentType;
  phase: AgentPhase;
  progress: ProgressDetails;
  context: TaskContext;
}

export interface TaskRoadmapUpdateData extends MessageData {
  source: 'mac_app';
  taskId: string;
  roadmap: TaskRoadmap;
  updatedSteps: TaskStep[];
  overallProgress: number;
}

// Supporting Data Structures
export interface TaskContext {
  taskId: string;
  description: string;
  currentStep: number;
  totalSteps?: number;
  currentUrl: string;
  sessionId: string;
  userPreferences?: UserPreferences;
}

export interface TaskRoadmap {
  id: string;
  title: string;
  description: string;
  estimatedDuration: number;
  complexity: TaskComplexity;
  dependencies: string[];
  steps: TaskStep[];
  status: TaskStatus;
  startTime?: string; // ISO 8601 date string
  completionTime?: string; // ISO 8601 date string
  tabStrategy?: TabAnalysisResult;
}

export interface TaskStep {
  id: string;
  title: string;
  description: string;
  agent: AgentType;
  estimatedDuration: number;
  status: TaskStatus;
  actions: ActionStep[];
  dependencies: string[];
}

export interface ActionStep {
  id: string;
  action: string;
  target?: string;
  reasoning: string;
  status: TaskStatus;
  duration?: number;
}

export interface BrowserTabInfo {
  id: number;
  url: string;
  title: string;
  active: boolean;
  windowId: number;
  pinned: boolean;
  lastAccessed?: string; // ISO 8601 date string
  loginStatus?: LoginStatus;
  pageType?: PageType;
  sessionData?: SessionData;
}

export interface TabAnalysisResult {
  relevantTabs: BrowserTabInfo[];
  bestMatch?: BrowserTabInfo;
  recommendation: TabRecommendation;
  reasoning: string;
  estimatedTimeSaved: number;
}

export interface ProgressDetails {
  action?: string;
  reasoning?: string;
  progressPercent?: number;
  estimatedRemaining?: number;
  elementFound?: boolean;
  domAnalysisStatus?: string;
  errorDetails?: string;
}

export interface DOMStrategy {
  type: DOMStrategyType;
  selectors: string[];
  timeouts: TimeoutConfiguration;
  retryConfig: RetryConfiguration;
  cacheStrategy: CacheStrategy;
}

export interface MacAppAction {
  type: MacActionType;
  parameters: Record<string, string>;
  sequence: number;
  estimatedDuration: number;
}

export interface ExtensionAction {
  type: string;
  parameters: Record<string, string>;
  sequence: number;
  dependsOn: string[];
}

export interface ActionCoordination {
  handoffPoints: HandoffPoint[];
  synchronizationEvents: string[];
  errorRecovery: ErrorRecoveryStrategy;
}

export interface ActionOptimization {
  type: OptimizationType;
  description: string;
  estimatedImprovement: number;
}

// Enums as union types
export type TaskComplexity = 'low' | 'medium' | 'high' | 'extreme';
export type TaskStatus = 'pending' | 'inProgress' | 'completed' | 'failed' | 'cancelled';
export type AgentType = 'planner' | 'navigator' | 'validator';
export type AgentPhase = 'starting' | 'thinking' | 'acting' | 'completed' | 'failed';
export type LoginStatus = 'loggedIn' | 'loggedOut' | 'unknown';
export type PageType = 'email' | 'shopping' | 'social' | 'banking' | 'docs' | 'dev' | 'other';
export type TabRecommendation = 'reuse' | 'newTab' | 'switchAndRefresh';
export type DOMStrategyType = 'full' | 'incremental' | 'simple' | 'visual' | 'coordinate';
export type MacActionType = 'fileOperation' | 'systemControl' | 'appManagement' | 'dataProcessing';
export type OptimizationType = 'tabReuse' | 'formAutoFill' | 'shortcutUse' | 'cacheHit';

// Configuration Structures
export interface TimeoutConfiguration {
  domBuild: number;
  networkWait: number;
  elementFind: number;
  actionExecute: number;
}

export interface RetryConfiguration {
  maxAttempts: number;
  backoffMultiplier: number;
  initialDelay: number;
}

export interface CacheStrategy {
  enabled: boolean;
  ttl: number;
  maxEntries: number;
}

export interface SessionData {
  cookies: boolean;
  localStorage: boolean;
  forms: string[];
}

export interface ElementInfo {
  selector: string;
  xpath?: string;
  text?: string;
  attributes: Record<string, string>;
}

export interface PageContext {
  url: string;
  title: string;
  complexity: PageComplexity;
  loadTime: number;
  errors: string[];
}

export interface PageComplexity {
  score: number;
  factors: string[];
  estimatedDOMSize: number;
  hasReactiveElements: boolean;
}

export interface BrowserContextInfo {
  activeTabId: number;
  windowCount: number;
  totalTabs: number;
  memoryUsage?: number;
}

export interface UserPreferences {
  preferredEmailClient?: string;
  preferredSearchEngine?: string;
  fastMode: boolean;
  confirmActions: boolean;
}

export interface DOMFailure {
  timestamp: string; // ISO 8601 date string
  error: string;
  strategy: DOMStrategyType;
  pageUrl: string;
}

export interface HandoffPoint {
  stage: string;
  fromComponent: string;
  toComponent: string;
  data: Record<string, string>;
}

export interface ErrorRecoveryStrategy {
  retryCount: number;
  fallbackActions: string[];
  escalationPath: string[];
}

// Message Creation Helpers
export class ProtocolMessageBuilder {
  static createLLMRequest(
    requestId: string,
    provider: string,
    modelName: string,
    messages: LLMMessage[],
    parameters?: LLMParameters,
    context?: TaskContext,
    priority: RequestPriority = 'medium'
  ): WebSocketMessage<LLMRequestData> {
    return {
      type: 'llm_request',
      version: '1.0',
      messageId: generateMessageId(),
      timestamp: new Date().toISOString(),
      data: {
        source: 'mac_app',
        requestId,
        provider,
        modelName,
        messages,
        parameters,
        context,
        priority
      }
    };
  }

  static createTaskPlanningRequest(
    requestId: string,
    userRequest: string,
    currentUrl: string | undefined,
    availableTabs: BrowserTabInfo[],
    browserContext: BrowserContextInfo,
    preferences?: UserPreferences
  ): WebSocketMessage<TaskPlanningRequestData> {
    return {
      type: 'task_planning_request',
      version: '1.0',
      messageId: generateMessageId(),
      timestamp: new Date().toISOString(),
      data: {
        source: 'extension',
        requestId,
        userRequest,
        currentUrl,
        availableTabs,
        browserContext,
        preferences
      }
    };
  }

  static createAgentProgress(
    stepId: string,
    agent: AgentType,
    phase: AgentPhase,
    progress: ProgressDetails,
    context: TaskContext
  ): WebSocketMessage<AgentProgressData> {
    return {
      type: 'agent_progress',
      version: '1.0',
      messageId: generateMessageId(),
      timestamp: new Date().toISOString(),
      data: {
        source: 'extension',
        stepId,
        agent,
        phase,
        progress,
        context
      }
    };
  }

  static createDOMStrategyRequest(
    requestId: string,
    pageUrl: string,
    pageTitle: string,
    pageComplexity: PageComplexity | undefined,
    previousFailures: DOMFailure[] | undefined,
    targetActions: string[]
  ): WebSocketMessage<DOMStrategyRequestData> {
    return {
      type: 'dom_strategy',
      version: '1.0',
      messageId: generateMessageId(),
      timestamp: new Date().toISOString(),
      data: {
        source: 'extension',
        requestId,
        pageUrl,
        pageTitle,
        pageComplexity,
        previousFailures,
        targetActions
      }
    };
  }

  static createTabAnalysisRequest(
    requestId: string,
    taskContext: TaskContext,
    availableTabs: BrowserTabInfo[]
  ): WebSocketMessage<TabAnalysisRequestData> {
    return {
      type: 'tab_analysis_request',
      version: '1.0',
      messageId: generateMessageId(),
      timestamp: new Date().toISOString(),
      data: {
        source: 'extension',
        requestId,
        taskContext,
        availableTabs
      }
    };
  }
}

// Utility Functions
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Type Guards for Message Validation
export function isLLMRequestData(data: MessageData): data is LLMRequestData {
  return data.source === 'mac_app' && 'requestId' in data && 'provider' in data;
}

export function isTaskPlanningRequestData(data: MessageData): data is TaskPlanningRequestData {
  return data.source === 'extension' && 'userRequest' in data && 'browserContext' in data;
}

export function isAgentProgressData(data: MessageData): data is AgentProgressData {
  return data.source === 'extension' && 'stepId' in data && 'agent' in data;
}

export function isDOMStrategyRequestData(data: MessageData): data is DOMStrategyRequestData {
  return data.source === 'extension' && 'pageUrl' in data && 'targetActions' in data;
}

export function isTabAnalysisRequestData(data: MessageData): data is TabAnalysisRequestData {
  return data.source === 'extension' && 'taskContext' in data && 'availableTabs' in data;
}

// Legacy Message Types (for backward compatibility)
export interface LegacyExecutorEvent {
  type: 'executor_event';
  data: {
    event: any;
  };
  timestamp: string;
}

export interface LegacyTaskAnalysis {
  type: 'task_analysis';
  data: {
    task: string;
    phase: string;
    details: any;
    timestamp: string;
  };
}

export interface LegacyStepProgress {
  type: 'step_progress';
  data: {
    step: number;
    action: string;
    status: 'starting' | 'in_progress' | 'completed' | 'failed';
    details: any;
    timestamp: string;
  };
}