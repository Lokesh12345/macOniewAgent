import { HumanMessage, type SystemMessage } from '@langchain/core/messages';
import type { AgentContext } from '@src/background/agent/types';
import { wrapUntrustedContent } from '../messages/utils';
import { createLogger } from '@src/background/log';

const logger = createLogger('BasePrompt');
/**
 * Abstract base class for all prompt types
 */
abstract class BasePrompt {
  /**
   * Returns the system message that defines the AI's role and behavior
   * @returns SystemMessage from LangChain
   */
  abstract getSystemMessage(): SystemMessage;

  /**
   * Returns the user message for the specific prompt type
   * @param context - Optional context data needed for generating the user message
   * @returns HumanMessage from LangChain
   */
  abstract getUserMessage(context: AgentContext): Promise<HumanMessage>;

  /**
   * Builds the user message containing the browser state
   * @param context - The agent context
   * @returns HumanMessage from LangChain
   */
  async buildBrowserStateUserMessage(context: AgentContext): Promise<HumanMessage> {
    const browserState = await context.browserContext.getState(context.options.useVision);
    const rawElementsText = browserState.elementTree.clickableElementsToString(context.options.includeAttributes);

    // Enhanced logging to debug CC/BCC field issues
    const lines = rawElementsText.split('\n');
    const elementLines = lines.filter(line => line.trim().startsWith('[') && line.includes(']<'));
    console.log(`\n🎯 DOM ANALYZER RESULTS:`);
    console.log(`📄 Page: ${browserState.url}`);
    console.log(`🔢 Interactive elements found: ${elementLines.length}`);
    console.log(`📝 Total DOM text length: ${rawElementsText.length} chars`);
    
    // Search for CC/BCC related elements
    const ccBccElements = elementLines.filter(line => {
      const lowerLine = line.toLowerCase();
      return lowerLine.includes('cc') || lowerLine.includes('bcc') || 
             lowerLine.includes('recipients') || lowerLine.includes('add');
    });
    
    console.log(`\n🔍 CC/BCC RELATED ELEMENTS (${ccBccElements.length} found):`);
    if (ccBccElements.length > 0) {
      ccBccElements.forEach((line, i) => {
        console.log(`  CC${i + 1}. ${line.trim()}`);
      });
    } else {
      console.log(`  ⚠️ NO CC/BCC ELEMENTS FOUND`);
    }
    
    // Show first 10 and last 10 elements
    console.log(`\n📋 First 10 elements:`);
    elementLines.slice(0, 10).forEach((line, i) => {
      console.log(`  ${i + 1}. ${line.trim()}`);
    });
    
    if (elementLines.length > 20) {
      console.log(`\n📋 Last 10 elements:`);
      elementLines.slice(-10).forEach((line, i) => {
        const actualIndex = elementLines.length - 10 + i + 1;
        console.log(`  ${actualIndex}. ${line.trim()}`);
      });
    }
    
    // Show ALL element data for debugging - expose it globally
    (window as any).DEBUG_DOM_DATA = {
      url: browserState.url,
      elementCount: elementLines.length,
      allElements: elementLines,
      ccBccElements: ccBccElements,
      fullDomText: rawElementsText
    };
    
    console.log(`\n💾 Full DOM data saved to window.DEBUG_DOM_DATA for manual inspection`);
    console.log(`===== END DOM ANALYZER RESULTS =====\n`);

    let formattedElementsText = '';
    if (rawElementsText !== '') {
      const scrollInfo = `[Scroll info of current page] window.scrollY: ${browserState.scrollY}, document.body.scrollHeight: ${browserState.scrollHeight}, window.visualViewport.height: ${browserState.visualViewportHeight}, visual viewport height as percentage of scrollable distance: ${Math.round((browserState.visualViewportHeight / (browserState.scrollHeight - browserState.visualViewportHeight)) * 100)}%\n`;
      logger.info(scrollInfo);
      const elementsText = wrapUntrustedContent(rawElementsText);
      formattedElementsText = `${scrollInfo}[Start of page]\n${elementsText}\n[End of page]\n`;
    } else {
      formattedElementsText = 'empty page';
    }

    let stepInfoDescription = '';
    if (context.stepInfo) {
      stepInfoDescription = `Current step: ${context.stepInfo.stepNumber + 1}/${context.stepInfo.maxSteps}`;
    }

    const timeStr = new Date().toISOString().slice(0, 16).replace('T', ' '); // Format: YYYY-MM-DD HH:mm
    stepInfoDescription += `Current date and time: ${timeStr}`;

    let actionResultsDescription = '';
    if (context.actionResults.length > 0) {
      for (let i = 0; i < context.actionResults.length; i++) {
        const result = context.actionResults[i];
        if (result.extractedContent) {
          actionResultsDescription += `\nAction result ${i + 1}/${context.actionResults.length}: ${result.extractedContent}`;
        }
        if (result.error) {
          // only use last line of error
          const error = result.error.split('\n').pop();
          actionResultsDescription += `\nAction error ${i + 1}/${context.actionResults.length}: ...${error}`;
        }
      }
    }

    const currentTab = `{id: ${browserState.tabId}, url: ${browserState.url}, title: ${browserState.title}}`;
    const otherTabs = browserState.tabs
      .filter(tab => tab.id !== browserState.tabId)
      .map(tab => `- {id: ${tab.id}, url: ${tab.url}, title: ${tab.title}}`);
    const stateDescription = `
[Task history memory ends]
[Current state starts here]
The following is one-time information - if you need to remember it write it to memory:
Current tab: ${currentTab}
Other available tabs:
  ${otherTabs.join('\n')}
Interactive elements from top layer of the current page inside the viewport:
${formattedElementsText}
${stepInfoDescription}
${actionResultsDescription}
`;

    if (browserState.screenshot && context.options.useVision) {
      return new HumanMessage({
        content: [
          { type: 'text', text: stateDescription },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${browserState.screenshot}` },
          },
        ],
      });
    }

    return new HumanMessage(stateDescription);
  }
}

export { BasePrompt };
