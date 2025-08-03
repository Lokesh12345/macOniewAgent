import { sessionContext } from './sessionContext';

/**
 * Helper function to inject session context into agent prompts
 */
export function getContextSummaryForPrompt(): string {
  const context = sessionContext.getContext();
  
  if (context.actionHistory.length === 0) {
    return 'This is the start of the session. No previous actions taken.';
  }
  
  const recentActions = context.actionHistory.slice(0, 3);
  const summary = [
    `Current Goal: ${context.currentGoal}`,
    `Current URL: ${context.currentUrl}`,
    `Recent Actions:`,
    ...recentActions.map(action => 
      `- ${action.type}: ${action.elementInfo || action.url || 'N/A'} ${action.success ? '✅' : '❌' + (action.error ? ` (${action.error})` : '')}`
    )
  ];
  
  return summary.join('\n');
}

/**
 * Helper to check if current context suggests we're stuck
 */
export function isContextStuck(): boolean {
  const recentActions = sessionContext.getRecentActions(undefined, 3);
  
  // If last 3 actions failed
  if (recentActions.length >= 3 && recentActions.every(a => !a.success)) {
    return true;
  }
  
  // If repeating the same action type multiple times
  if (recentActions.length >= 3) {
    const actionTypes = recentActions.map(a => a.type);
    if (actionTypes.every(type => type === actionTypes[0])) {
      return true;
    }
  }
  
  return false;
}