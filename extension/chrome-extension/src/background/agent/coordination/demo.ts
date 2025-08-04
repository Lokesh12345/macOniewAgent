import { agentCoordination } from './index';
import type { AgentContext } from '../types';
import { createLogger } from '../../log';

const logger = createLogger('CoordinationDemo');

/**
 * Enhanced Agent Coordination Demo
 * Demonstrates efficient token usage through coordination
 */
export class CoordinationDemo {
  /**
   * Run comprehensive coordination demo
   */
  async runDemo(): Promise<void> {
    console.log('🚀 Enhanced Agent Coordination Demo\n');

    // Demo 1: Task Analysis
    this.demoTaskAnalysis();

    // Demo 2: Model Selection
    this.demoModelSelection();

    // Demo 3: Shared Context
    await this.demoSharedContext();

    // Demo 4: Context Compression
    await this.demoContextCompression();

    // Demo 5: Token Usage Estimation
    this.demoTokenEstimation();

    console.log('\n✅ Coordination Demo Complete!');
  }

  /**
   * Demo task analysis and complexity detection
   */
  private demoTaskAnalysis(): void {
    console.log('📊 Task Analysis Demo\n');

    const tasks = [
      'Click on the login button',
      'Fill out the registration form with my details',
      'Extract all product prices from the search results',
      'Navigate to settings, update profile, and then logout',
    ];

    tasks.forEach(task => {
      const analysis = agentCoordination.analyzeTask(task);
      console.log(`Task: "${task}"`);
      console.log(`  Type: ${analysis.complexity.type}`);
      console.log(`  Estimated Steps: ${analysis.complexity.estimatedSteps}`);
      console.log(`  Requires Planning: ${analysis.complexity.requiresPlanning}`);
      console.log(`  Requires Validation: ${analysis.complexity.requiresValidation}`);
      console.log('');
    });
  }

  /**
   * Demo smart model selection
   */
  private demoModelSelection(): void {
    console.log('🤖 Model Selection Demo\n');

    const task = 'Search for iPhone prices and compare them across different retailers';
    const availableModels = [
      'gpt-4-turbo',
      'gpt-3.5-turbo',
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-instant'
    ];

    const recommendations = agentCoordination.getModelRecommendations(task, availableModels);
    console.log(recommendations);
  }

  /**
   * Demo shared context management
   */
  private async demoSharedContext(): Promise<void> {
    console.log('📋 Shared Context Demo\n');

    // Create mock agent context
    const mockContext = this.createMockAgentContext();

    // Create shared context
    const sharedContext = await agentCoordination.getSharedContext(mockContext);
    
    console.log('Shared Context Created:');
    console.log(`  ID: ${sharedContext.id}`);
    console.log(`  Task ID: ${sharedContext.taskId}`);
    console.log(`  Compressed: ${sharedContext.compressed}`);
    console.log(`  Browser State Elements: ${sharedContext.browserState.keyElements.length}`);
    console.log(`  Recent Actions: ${sharedContext.actionHistory.recentActions.length}`);
    console.log('');

    // Update context from different agents
    await agentCoordination.updateSharedContext(mockContext, 'planner', {
      currentGoal: 'Find iPhone prices',
      completedGoals: ['Navigate to shopping site'],
      remainingSteps: ['Search for iPhone', 'Extract prices', 'Compare results']
    });

    await agentCoordination.updateSharedContext(mockContext, 'navigator', {
      focusArea: 'search results',
      interactionMode: 'precise',
      elementFilters: [{ type: 'interactive', priority: 1 }]
    });

    console.log('Context updated by multiple agents');
  }

  /**
   * Demo context compression
   */
  private async demoContextCompression(): Promise<void> {
    console.log('🗜️ Context Compression Demo\n');

    // Create sample messages
    const messages = this.createSampleMessages(20);
    
    console.log(`Original messages: ${messages.length}`);
    console.log(`Estimated tokens: ~${messages.reduce((sum, m) => sum + m.content.toString().length / 3, 0)}`);

    // Compress messages
    const compressed = await agentCoordination.compressMessageHistory(
      messages,
      5000, // Target 5000 tokens
      3 // Preserve last 3 messages
    );

    console.log(`Compressed messages: ${compressed.length}`);
    console.log(`Estimated tokens after compression: ~${compressed.reduce((sum, m) => sum + m.content.toString().length / 3, 0)}`);
    console.log('');

    // Show sample compressed content
    console.log('Sample compressed messages:');
    compressed.slice(0, 3).forEach((msg, i) => {
      console.log(`  ${i + 1}. ${msg.content.toString().substring(0, 80)}...`);
    });
  }

  /**
   * Demo token usage estimation
   */
  private demoTokenEstimation(): void {
    console.log('\n💰 Token Usage Estimation\n');

    const scenarios = [
      { task: 'Click the submit button', sessions: 1 },
      { task: 'Fill out a complex multi-step form', sessions: 10 },
      { task: 'Extract data from 50 product pages', sessions: 5 }
    ];

    scenarios.forEach(scenario => {
      const analysis = agentCoordination.analyzeTask(scenario.task);
      const singleSessionTokens = this.estimateTokensForComplexity(analysis.complexity);
      const totalTokens = singleSessionTokens * scenario.sessions;

      console.log(`Task: "${scenario.task}"`);
      console.log(`  Sessions: ${scenario.sessions}`);
      console.log(`  Tokens per session: ~${singleSessionTokens.toLocaleString()}`);
      console.log(`  Total tokens: ~${totalTokens.toLocaleString()}`);
      
      // Show savings with coordination
      const savingsPercent = 30; // Estimated 30% savings with coordination
      const savedTokens = Math.round(totalTokens * savingsPercent / 100);
      console.log(`  With coordination: ~${(totalTokens - savedTokens).toLocaleString()} (${savingsPercent}% savings)`);
      console.log('');
    });
  }

  /**
   * Create mock agent context
   */
  private createMockAgentContext(): AgentContext {
    // This is a simplified mock - in real usage, this would be a full AgentContext
    return {
      taskId: 'demo_task_123',
      nSteps: 15,
      actionResults: [
        { success: true, extractedContent: 'Clicked on search button', error: null, isDone: false, includeInMemory: true, interactedElement: null },
        { success: true, extractedContent: 'Typed "iPhone" in search box', error: null, isDone: false, includeInMemory: true, interactedElement: null },
        { success: false, extractedContent: null, error: 'Element not found', isDone: false, includeInMemory: true, interactedElement: null },
      ],
      browserContext: {
        getState: async () => ({
          url: 'https://example.com/search',
          title: 'Search Results',
          selectorMap: new Map([
            [1, { tagName: 'BUTTON', text: 'Search', attributes: { id: 'search-btn' } }],
            [2, { tagName: 'INPUT', text: '', attributes: { name: 'query', value: 'iPhone' } }],
            [3, { tagName: 'A', text: 'iPhone 15 Pro', attributes: { href: '/products/iphone-15-pro' } }],
          ])
        })
      }
    } as any;
  }

  /**
   * Create sample messages for compression demo
   */
  private createSampleMessages(count: number): any[] {
    const messages = [];
    const messageTypes = [
      { role: 'human', content: 'Action result: Clicked on element at index 42' },
      { role: 'human', content: 'Action result: Typed "search query" in input field' },
      { role: 'human', content: 'Action error: Failed to find element with selector .submit-btn' },
      { role: 'human', content: 'Current page: https://example.com/page' },
      { role: 'assistant', content: 'I will now click on the search button to proceed' },
      { role: 'human', content: 'Browser state: Page loaded successfully' },
    ];

    for (let i = 0; i < count; i++) {
      const msg = messageTypes[i % messageTypes.length];
      messages.push({
        content: `${msg.content} (${i + 1})`,
        _getType: () => msg.role
      });
    }

    return messages;
  }

  /**
   * Estimate tokens for complexity
   */
  private estimateTokensForComplexity(complexity: any): number {
    const base = {
      navigation: 2000,
      form_filling: 8000,
      data_extraction: 15000,
      multi_step: 30000,
      unknown: 10000
    };

    return base[complexity.type] || 10000;
  }

  /**
   * Show coordination statistics
   */
  showStats(): void {
    console.log('\n📈 Coordination Statistics\n');
    
    const stats = agentCoordination.getStats();
    console.log('Configuration:');
    console.log(`  Shared Context: ${stats.config.enableSharedContext ? '✓' : '✗'}`);
    console.log(`  Smart Selection: ${stats.config.enableSmartSelection ? '✓' : '✗'}`);
    console.log(`  Context Compression: ${stats.config.enableContextCompression ? '✓' : '✗'}`);
    console.log('');
    console.log('Shared Context Stats:');
    console.log(`  Active Contexts: ${stats.sharedContext.totalContexts}`);
    console.log(`  Compressed Contexts: ${stats.sharedContext.compressedContexts}`);
    console.log(`  Avg Compression Ratio: ${(stats.sharedContext.averageCompressionRatio * 100).toFixed(1)}%`);
  }
}

/**
 * Quick demo runner for console
 */
export async function runCoordinationDemo(): Promise<void> {
  const demo = new CoordinationDemo();
  await demo.runDemo();
  demo.showStats();
}

// Make available in console
(globalThis as any).runCoordinationDemo = runCoordinationDemo;
(globalThis as any).CoordinationDemo = CoordinationDemo;