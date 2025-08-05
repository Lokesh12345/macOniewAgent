import { NavigatorPrompt } from './navigator';
import { SystemMessage } from '@langchain/core/messages';
import { adaptiveNavigatorSystemPromptTemplate } from './templates/adaptiveNavigator';

export class AdaptiveNavigatorPrompt extends NavigatorPrompt {
  private adaptiveSystemMessage: SystemMessage;

  constructor(maxActionsPerStep = 10) {
    super(maxActionsPerStep);
    
    const promptTemplate = adaptiveNavigatorSystemPromptTemplate;
    // Format the template with the maxActionsPerStep
    const formattedPrompt = promptTemplate.replace('{{max_actions}}', maxActionsPerStep.toString()).trim();
    this.adaptiveSystemMessage = new SystemMessage(formattedPrompt);
  }

  getSystemMessage(): SystemMessage {
    /**
     * Get the adaptive system prompt for the agent.
     *
     * @returns SystemMessage containing the formatted system prompt
     */
    return this.adaptiveSystemMessage;
  }
}