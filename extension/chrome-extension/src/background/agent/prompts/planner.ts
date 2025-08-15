/* eslint-disable @typescript-eslint/no-unused-vars */
import { BasePrompt } from './base';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentContext } from '@src/background/agent/types';
import { plannerSystemPromptTemplate } from './templates/planner';

export class PlannerPrompt extends BasePrompt {
  private context?: any;

  constructor(context?: any) {
    super();
    this.context = context;
  }

  getSystemMessage(): SystemMessage {
    let contextualPrompt = plannerSystemPromptTemplate;
    
    // Inject current context information if available
    if (this.context) {
      const contextInfo = this.buildContextInfo(this.context);
      contextualPrompt = `${contextInfo}\n\n${plannerSystemPromptTemplate}`;
    }
    
    return new SystemMessage(contextualPrompt);
  }

  private buildContextInfo(context: any): string {
    const currentDate = context.currentDate || new Date().toISOString().split('T')[0];
    const currentYear = context.year || new Date().getFullYear();
    const country = context.countryName || context.country || 'Unknown';
    const currency = context.currencySymbol || '$';
    const timezone = context.timezone || 'UTC';
    const language = context.language || 'en';

    return `# CURRENT CONTEXT INFORMATION:
- Current Date: ${currentDate}
- Current Year: ${currentYear}
- User Location: ${country}
- User Timezone: ${timezone}
- User Currency: ${currency}
- User Language: ${language}

CRITICAL INSTRUCTIONS:
- When asked about dates, events, or festivals, ALWAYS use the current year ${currentYear}
- When searching for "when is X" queries, search for "${currentYear}" dates, NOT past years
- For location-specific information, consider the user is in ${country}
- For prices, show amounts in ${currency} when relevant
- NEVER use outdated information from previous years unless explicitly asked for historical data`;
  }

  async getUserMessage(context: AgentContext): Promise<HumanMessage> {
    return new HumanMessage('');
  }
}
