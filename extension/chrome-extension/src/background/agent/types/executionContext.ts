import { z } from 'zod';

// Execution mode for the navigator
export enum ExecutionMode {
  BATCH = 'batch',
  SINGLE_STEP = 'single-step',
  ADAPTIVE = 'adaptive'
}

// DOM change types
export enum DOMChangeType {
  NONE = 'none',
  MINOR = 'minor', // tooltips, hover states
  INTERACTIVE = 'interactive', // dropdowns, autocomplete
  BLOCKING = 'blocking', // modals, alerts
  NAVIGATION = 'navigation' // page changes
}

// Execution history for context
export interface ExecutionStep {
  action: Record<string, unknown>;
  result: {
    success: boolean;
    error?: string;
    extractedContent?: string;
  };
  domChanges?: {
    type: DOMChangeType;
    description: string;
    newElements?: string[];
  };
  timestamp: number;
}

export interface ExecutionContext {
  originalGoal: string;
  originalPlan: string[];
  executionMode: ExecutionMode;
  completedSteps: ExecutionStep[];
  remainingActions: Record<string, unknown>[];
  currentState: {
    url: string;
    title: string;
    hasPopup: boolean;
    hasAlert: boolean;
    hasAutocomplete: boolean;
  };
  domChangeHistory: Array<{
    afterAction: string;
    changeType: DOMChangeType;
    handled: boolean;
  }>;
}

// Schema for LLM re-planning response
export const replanningResponseSchema = z.object({
  analysis: z.string().describe('Brief analysis of what changed and why re-planning is needed'),
  executionMode: z.enum(['batch', 'single-step', 'adaptive']).describe('Execution mode for remaining actions'),
  updatedPlan: z.array(z.record(z.unknown())).describe('Updated action plan'),
  reasoning: z.string().describe('Reasoning for the chosen approach')
});

export type ReplanningResponse = z.infer<typeof replanningResponseSchema>;