import { createLogger } from '../../log';
import type { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import type { CompressionResult } from './types';

const logger = createLogger('ContextCompressor');

/**
 * Context Compression for Long Sessions
 * Reduces token usage by summarizing and compressing message history
 */
export class ContextCompressor {
  private compressionRules: CompressionRule[] = [];

  constructor() {
    this.initializeCompressionRules();
  }

  /**
   * Initialize compression rules
   */
  private initializeCompressionRules(): void {
    // Rule 1: Combine consecutive similar actions
    this.compressionRules.push({
      name: 'combine_similar_actions',
      pattern: /Action result: (Clicked|Typed|Scrolled)/,
      compress: (messages) => this.combineSimilarActions(messages),
    });

    // Rule 2: Summarize navigation sequences
    this.compressionRules.push({
      name: 'summarize_navigation',
      pattern: /Navigated to|Page loaded/,
      compress: (messages) => this.summarizeNavigation(messages),
    });

    // Rule 3: Compress error sequences
    this.compressionRules.push({
      name: 'compress_errors',
      pattern: /Action error:|Failed to/,
      compress: (messages) => this.compressErrors(messages),
    });

    // Rule 4: Remove redundant state updates
    this.compressionRules.push({
      name: 'remove_redundant_states',
      pattern: /Current page:|Browser state:/,
      compress: (messages) => this.removeRedundantStates(messages),
    });
  }

  /**
   * Compress message history
   */
  async compressMessages(
    messages: BaseMessage[],
    targetTokens: number,
    preserveRecent: number = 5
  ): Promise<{ messages: BaseMessage[]; result: CompressionResult }> {
    const originalSize = this.estimateTokenCount(messages);
    
    logger.info(`Compression input: ${messages.length} messages, ~${originalSize} tokens, target: ${targetTokens} tokens, preserve: ${preserveRecent}`);
    
    if (originalSize <= targetTokens) {
      logger.info(`No compression needed: ${originalSize} <= ${targetTokens}`);
      return {
        messages,
        result: {
          originalSize,
          compressedSize: originalSize,
          ratio: 1,
          lossLevel: 'none',
        },
      };
    }

    logger.info(`Compressing ${messages.length} messages from ~${originalSize} to ~${targetTokens} tokens`);

    // Separate recent messages to preserve
    const recentMessages = messages.slice(-preserveRecent);
    const olderMessages = messages.slice(0, -preserveRecent);

    // Apply compression rules
    let compressedMessages = this.applyCompressionRules(olderMessages);

    // Further compression if needed
    if (this.estimateTokenCount([...compressedMessages, ...recentMessages]) > targetTokens) {
      compressedMessages = await this.aggressiveCompression(compressedMessages, targetTokens - this.estimateTokenCount(recentMessages));
    }

    // Combine compressed and recent messages
    const finalMessages = [...compressedMessages, ...recentMessages];
    const compressedSize = this.estimateTokenCount(finalMessages);

    return {
      messages: finalMessages,
      result: {
        originalSize,
        compressedSize,
        ratio: compressedSize / originalSize,
        lossLevel: this.determineLossLevel(originalSize, compressedSize),
      },
    };
  }

  /**
   * Apply compression rules to messages
   */
  private applyCompressionRules(messages: BaseMessage[]): BaseMessage[] {
    let compressed = [...messages];

    for (const rule of this.compressionRules) {
      const groups = this.groupMessagesByPattern(compressed, rule.pattern);
      compressed = groups.flatMap(group => {
        if (group.length > 1 && group.some(msg => rule.pattern.test(msg.content.toString()))) {
          return rule.compress(group);
        }
        return group;
      });
    }

    return compressed;
  }

  /**
   * Group messages by pattern
   */
  private groupMessagesByPattern(messages: BaseMessage[], pattern: RegExp): BaseMessage[][] {
    const groups: BaseMessage[][] = [];
    let currentGroup: BaseMessage[] = [];

    messages.forEach(message => {
      if (pattern.test(message.content.toString())) {
        currentGroup.push(message);
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
        groups.push([message]);
      }
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Combine similar consecutive actions
   */
  private combineSimilarActions(messages: BaseMessage[]): BaseMessage[] {
    const actionCounts: Record<string, number> = {};
    const firstMessage = messages[0];

    messages.forEach(msg => {
      const match = msg.content.toString().match(/Action result: (\w+)/);
      if (match) {
        const action = match[1];
        actionCounts[action] = (actionCounts[action] || 0) + 1;
      }
    });

    const summary = Object.entries(actionCounts)
      .map(([action, count]) => `${action} ${count} times`)
      .join(', ');

    return [
      new HumanMessage(`Action summary: Performed ${summary} (${messages.length} total actions)`),
    ];
  }

  /**
   * Summarize navigation sequences
   */
  private summarizeNavigation(messages: BaseMessage[]): BaseMessage[] {
    const urls: string[] = [];
    
    messages.forEach(msg => {
      const content = msg.content.toString();
      const urlMatch = content.match(/Navigated to: (.+)|URL: (.+)/);
      if (urlMatch) {
        urls.push(urlMatch[1] || urlMatch[2]);
      }
    });

    if (urls.length === 0) return messages;

    const summary = urls.length > 3
      ? `Navigation sequence: ${urls[0]} → ... → ${urls[urls.length - 1]} (${urls.length} pages)`
      : `Navigation sequence: ${urls.join(' → ')}`;

    return [new HumanMessage(summary)];
  }

  /**
   * Compress error sequences
   */
  private compressErrors(messages: BaseMessage[]): BaseMessage[] {
    const errors: Record<string, number> = {};
    
    messages.forEach(msg => {
      const content = msg.content.toString();
      const errorMatch = content.match(/Action error: (.+)|Failed to (.+)/);
      if (errorMatch) {
        const error = (errorMatch[1] || errorMatch[2]).split('\n')[0]; // First line only
        errors[error] = (errors[error] || 0) + 1;
      }
    });

    const errorSummary = Object.entries(errors)
      .map(([error, count]) => count > 1 ? `${error} (${count}x)` : error)
      .slice(0, 3) // Keep top 3 errors
      .join('; ');

    return [
      new HumanMessage(`Error summary: ${errorSummary} (${messages.length} total errors)`),
    ];
  }

  /**
   * Remove redundant state updates
   */
  private removeRedundantStates(messages: BaseMessage[]): BaseMessage[] {
    // Keep only the most recent state update
    const lastStateIndex = messages.findLastIndex(msg => 
      /Current page:|Browser state:/.test(msg.content.toString())
    );

    if (lastStateIndex === -1) return messages;

    return [messages[lastStateIndex]];
  }

  /**
   * Aggressive compression for when gentle compression isn't enough
   */
  private async aggressiveCompression(
    messages: BaseMessage[],
    targetTokens: number
  ): Promise<BaseMessage[]> {
    // Strategy 1: Summarize by chunks
    const chunkSize = Math.max(5, Math.floor(messages.length / 10));
    const chunks: BaseMessage[][] = [];
    
    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize));
    }

    const summaries = chunks.map((chunk, index) => {
      const summary = this.summarizeChunk(chunk);
      return new HumanMessage(`[Summary of steps ${index * chunkSize + 1}-${(index + 1) * chunkSize}]: ${summary}`);
    });

    // Strategy 2: If still too large, keep only key messages
    if (this.estimateTokenCount(summaries) > targetTokens) {
      const keyMessages = this.extractKeyMessages(summaries, targetTokens);
      return keyMessages;
    }

    return summaries;
  }

  /**
   * Summarize a chunk of messages
   */
  private summarizeChunk(messages: BaseMessage[]): string {
    const actions: string[] = [];
    const outcomes: string[] = [];
    let hasErrors = false;

    messages.forEach(msg => {
      const content = msg.content.toString();
      
      if (content.includes('Action result:')) {
        actions.push(content.split(':')[1].trim().substring(0, 50));
      } else if (content.includes('error') || content.includes('failed')) {
        hasErrors = true;
      } else if (content.includes('Success') || content.includes('completed')) {
        outcomes.push('completed successfully');
      }
    });

    const summary = [
      actions.length > 0 ? `Actions: ${actions.slice(0, 3).join(', ')}` : '',
      hasErrors ? 'Encountered errors' : '',
      outcomes.length > 0 ? outcomes[0] : '',
    ].filter(Boolean).join('. ');

    return summary || 'Multiple steps performed';
  }

  /**
   * Extract only the most important messages
   */
  private extractKeyMessages(messages: BaseMessage[], targetTokens: number): BaseMessage[] {
    // Prioritize messages by importance
    const prioritized = messages.map(msg => ({
      message: msg,
      priority: this.calculateMessagePriority(msg),
    }));

    // Sort by priority
    prioritized.sort((a, b) => b.priority - a.priority);

    // Take messages until we reach target tokens
    const result: BaseMessage[] = [];
    let currentTokens = 0;

    for (const { message } of prioritized) {
      const messageTokens = this.estimateTokenCount([message]);
      if (currentTokens + messageTokens <= targetTokens) {
        result.push(message);
        currentTokens += messageTokens;
      }
    }

    // Sort by original order
    return result.sort((a, b) => 
      messages.indexOf(a) - messages.indexOf(b)
    );
  }

  /**
   * Calculate message priority for extraction
   */
  private calculateMessagePriority(message: BaseMessage): number {
    const content = message.content.toString().toLowerCase();
    let priority = 1;

    // High priority patterns
    if (content.includes('error') || content.includes('failed')) priority += 5;
    if (content.includes('success') || content.includes('completed')) priority += 4;
    if (content.includes('goal') || content.includes('objective')) priority += 3;
    if (content.includes('summary')) priority += 3;

    // Medium priority patterns  
    if (content.includes('navigate') || content.includes('click')) priority += 2;
    if (content.includes('result')) priority += 2;

    // Low priority patterns
    if (content.includes('waiting') || content.includes('loading')) priority -= 1;
    if (content.length < 50) priority -= 1;

    return priority;
  }

  /**
   * Estimate token count for messages
   */
  private estimateTokenCount(messages: BaseMessage[]): number {
    // Rough estimation: 1 token ≈ 3 characters
    const totalChars = messages.reduce((sum, msg) => 
      sum + msg.content.toString().length, 0
    );
    return Math.ceil(totalChars / 3);
  }

  /**
   * Determine compression loss level
   */
  private determineLossLevel(original: number, compressed: number): CompressionResult['lossLevel'] {
    const ratio = compressed / original;
    
    if (ratio > 0.9) return 'none';
    if (ratio > 0.7) return 'minimal';
    if (ratio > 0.5) return 'moderate';
    return 'significant';
  }

  /**
   * Create a compression summary message
   */
  createCompressionSummary(result: CompressionResult): string {
    return `[Context compressed: ${result.originalSize} → ${result.compressedSize} tokens (${Math.round(result.ratio * 100)}%), loss level: ${result.lossLevel}]`;
  }
}

interface CompressionRule {
  name: string;
  pattern: RegExp;
  compress: (messages: BaseMessage[]) => BaseMessage[];
}