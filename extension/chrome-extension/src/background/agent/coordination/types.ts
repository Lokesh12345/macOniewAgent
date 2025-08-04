/**
 * Enhanced Agent Coordination Types
 * Defines structures for efficient token usage across agents
 */

export interface AgentCoordinationConfig {
  enableSharedContext: boolean;
  enableSmartSelection: boolean;
  enableContextCompression: boolean;
  compressionThreshold: number; // Number of steps before compression kicks in
  maxContextLength: number; // Maximum context size in tokens
  cacheTimeout: number; // Context cache timeout in ms
}

export const DEFAULT_COORDINATION_CONFIG: AgentCoordinationConfig = {
  enableSharedContext: true,
  enableSmartSelection: false,
  enableContextCompression: true,
  compressionThreshold: 5, // Compress after 5 steps (reduced from 10)
  maxContextLength: 8000, // Max 8k tokens (reduced from 50k for demo)
  cacheTimeout: 300000, // 5 minutes
};

export interface SharedContext {
  id: string;
  taskId: string;
  browserState: CompressedBrowserState;
  actionHistory: CompressedActionHistory;
  plannerContext?: PlannerContext;
  navigatorContext?: NavigatorContext;
  metadata: ContextMetadata;
  compressed: boolean;
  lastAccessed: number;
}

export interface CompressedBrowserState {
  url: string;
  title: string;
  keyElements: KeyElement[];
  formFields?: FormFieldSummary;
  navigationLinks?: string[];
  timestamp: number;
}

export interface KeyElement {
  index: number;
  type: string;
  text?: string;
  attributes?: Record<string, string>;
  importance: number; // 0-1 score
}

export interface FormFieldSummary {
  totalFields: number;
  filledFields: number;
  fieldTypes: Record<string, number>;
  requiredFields: string[];
}

export interface CompressedActionHistory {
  recentActions: ActionSummary[];
  successfulPatterns: ActionPattern[];
  failedActions: FailedActionSummary[];
  totalActions: number;
}

export interface ActionSummary {
  type: string;
  target?: string;
  result: 'success' | 'failure';
  timestamp: number;
}

export interface ActionPattern {
  pattern: string;
  frequency: number;
  successRate: number;
}

export interface FailedActionSummary {
  action: string;
  error: string;
  retryCount: number;
}

export interface PlannerContext {
  currentGoal: string;
  completedGoals: string[];
  remainingSteps?: string[];
  strategy?: string;
}

export interface NavigatorContext {
  focusArea: string;
  interactionMode: 'precise' | 'exploratory';
  elementFilters?: ElementFilter[];
}

export interface ElementFilter {
  type: 'visible' | 'interactive' | 'form' | 'navigation';
  priority: number;
}

export interface ContextMetadata {
  created: number;
  updated: number;
  accessCount: number;
  compressionRatio?: number;
  tokenCount?: number;
}

export interface AgentCapability {
  agentType: 'navigator' | 'planner' | 'validator';
  capabilities: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  tokenCost: 'low' | 'medium' | 'high';
}

export interface TaskComplexity {
  type: 'navigation' | 'form_filling' | 'data_extraction' | 'multi_step' | 'unknown';
  estimatedSteps: number;
  requiresPlanning: boolean;
  requiresValidation: boolean;
}

export interface ModelSelection {
  navigatorModel: string;
  plannerModel: string;
  validatorModel: string;
  extractorModel: string;
  reason: string;
}

export interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  ratio: number;
  lossLevel: 'none' | 'minimal' | 'moderate' | 'significant';
}