import { createLogger } from '../../log';
import type { ActionResult } from '../../agent/types';

const logger = createLogger('BatchOperations');

export interface BatchItem<T = any> {
  id: string;
  operation: 'click' | 'input' | 'scroll' | 'navigate' | 'wait' | 'custom';
  data: T;
  priority: number;
  createdAt: number;
  timeout?: number;
}

export interface BatchResult<T = any> {
  id: string;
  success: boolean;
  result?: ActionResult;
  error?: string;
  executionTime: number;
  data: T;
}

export interface BatchStats {
  totalBatches: number;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageExecutionTime: number;
  averageBatchSize: number;
}

/**
 * Batch Operations System
 * Groups similar actions for efficient execution
 */
export class BatchOperations {
  private batches = new Map<string, BatchItem[]>();
  private processing = new Set<string>();
  private stats: BatchStats = {
    totalBatches: 0,
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    averageExecutionTime: 0,
    averageBatchSize: 0
  };

  private readonly batchTimeout: number;
  private readonly maxBatchSize: number;
  private readonly flushInterval: number;
  private flushTimer: NodeJS.Timeout;

  constructor(options: {
    batchTimeout?: number;
    maxBatchSize?: number;
    flushInterval?: number;
  } = {}) {
    this.batchTimeout = options.batchTimeout ?? 50; // 50ms
    this.maxBatchSize = options.maxBatchSize ?? 10;
    this.flushInterval = options.flushInterval ?? 100; // 100ms

    // Auto-flush batches periodically
    this.flushTimer = setInterval(() => {
      this.flushReadyBatches();
    }, this.flushInterval);
  }

  /**
   * Add operation to batch queue
   */
  addToBatch<T>(
    batchKey: string,
    item: Omit<BatchItem<T>, 'createdAt'>
  ): Promise<BatchResult<T>> {
    const batchItem: BatchItem<T> = {
      ...item,
      createdAt: Date.now()
    };

    // Initialize batch if doesn't exist
    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, []);
    }

    const batch = this.batches.get(batchKey)!;
    batch.push(batchItem as BatchItem);

    // Sort by priority (higher priority first)
    batch.sort((a, b) => b.priority - a.priority);

    logger.debug(`Added ${item.operation} to batch ${batchKey} (size: ${batch.length})`);

    // Auto-flush if batch is full
    if (batch.length >= this.maxBatchSize) {
      setTimeout(() => this.flushBatch(batchKey), 0);
    }

    // Return promise that resolves when batch is processed
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Batch operation timeout for ${item.id}`));
      }, item.timeout || 10000);

      // Store resolve/reject functions on the item
      (batchItem as any).resolve = (result: BatchResult<T>) => {
        clearTimeout(timeoutId);
        resolve(result);
      };
      (batchItem as any).reject = (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      };
    });
  }

  /**
   * Flush specific batch
   */
  async flushBatch(batchKey: string): Promise<BatchResult[]> {
    const batch = this.batches.get(batchKey);
    if (!batch || batch.length === 0 || this.processing.has(batchKey)) {
      return [];
    }

    this.processing.add(batchKey);
    this.batches.delete(batchKey);

    logger.debug(`Flushing batch ${batchKey} with ${batch.length} operations`);

    const startTime = Date.now();
    const results: BatchResult[] = [];

    try {
      // Group operations by type for optimal execution
      const grouped = this.groupOperationsByType(batch);
      
      // Execute each group
      for (const [operationType, operations] of grouped) {
        const groupResults = await this.executeOperationGroup(operationType, operations);
        results.push(...groupResults);
      }

      // Update statistics
      this.updateStats(results, Date.now() - startTime, batch.length);

      // Resolve promises
      for (const result of results) {
        const item = batch.find(b => b.id === result.id);
        if (item && (item as any).resolve) {
          (item as any).resolve(result);
        }
      }

    } catch (error) {
      logger.error(`Batch ${batchKey} execution failed:`, error);
      
      // Reject all promises
      for (const item of batch) {
        if ((item as any).reject) {
          (item as any).reject(error);
        }
      }
    } finally {
      this.processing.delete(batchKey);
    }

    return results;
  }

  /**
   * Flush all ready batches
   */
  async flushReadyBatches(): Promise<void> {
    const now = Date.now();
    const batchesToFlush: string[] = [];

    for (const [batchKey, batch] of this.batches) {
      if (batch.length === 0) continue;

      // Check if batch is ready (timeout or full)
      const oldestItem = Math.min(...batch.map(item => item.createdAt));
      const age = now - oldestItem;

      if (age >= this.batchTimeout || batch.length >= this.maxBatchSize) {
        batchesToFlush.push(batchKey);
      }
    }

    // Flush ready batches
    const flushPromises = batchesToFlush.map(batchKey => this.flushBatch(batchKey));
    await Promise.allSettled(flushPromises);

    if (batchesToFlush.length > 0) {
      logger.debug(`Flushed ${batchesToFlush.length} ready batches`);
    }
  }

  /**
   * Group operations by type for optimal execution
   */
  private groupOperationsByType(batch: BatchItem[]): Map<string, BatchItem[]> {
    const grouped = new Map<string, BatchItem[]>();

    for (const item of batch) {
      const key = item.operation;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    }

    return grouped;
  }

  /**
   * Execute a group of similar operations
   */
  private async executeOperationGroup(
    operationType: string,
    operations: BatchItem[]
  ): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    logger.debug(`Executing ${operations.length} ${operationType} operations`);

    switch (operationType) {
      case 'click':
        return await this.executeBatchClicks(operations);
      
      case 'input':
        return await this.executeBatchInputs(operations);
      
      case 'scroll':
        return await this.executeBatchScrolls(operations);
      
      case 'wait':
        return await this.executeBatchWaits(operations);
      
      case 'navigate':
        return await this.executeBatchNavigations(operations);
      
      default:
        return await this.executeSequentially(operations);
    }
  }

  /**
   * Execute batch click operations
   */
  private async executeBatchClicks(operations: BatchItem[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    
    // Sort by element index to minimize DOM reflows
    operations.sort((a, b) => {
      const indexA = (a.data as any).index || 0;
      const indexB = (b.data as any).index || 0;
      return indexA - indexB;
    });

    for (const operation of operations) {
      const startTime = Date.now();
      try {
        // Simulate click execution (replace with actual implementation)
        const result = await this.executeClick(operation.data);
        
        results.push({
          id: operation.id,
          success: true,
          result,
          executionTime: Date.now() - startTime,
          data: operation.data
        });
      } catch (error) {
        results.push({
          id: operation.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          executionTime: Date.now() - startTime,
          data: operation.data
        });
      }
    }

    return results;
  }

  /**
   * Execute batch input operations
   */
  private async executeBatchInputs(operations: BatchItem[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    
    // Group by target element to minimize focus changes
    const byElement = new Map<number, BatchItem[]>();
    
    for (const operation of operations) {
      const index = (operation.data as any).index || 0;
      if (!byElement.has(index)) {
        byElement.set(index, []);
      }
      byElement.get(index)!.push(operation);
    }

    // Execute each element group
    for (const [elementIndex, elementOps] of byElement) {
      for (const operation of elementOps) {
        const startTime = Date.now();
        try {
          const result = await this.executeInput(operation.data);
          
          results.push({
            id: operation.id,
            success: true,
            result,
            executionTime: Date.now() - startTime,
            data: operation.data
          });
        } catch (error) {
          results.push({
            id: operation.id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            executionTime: Date.now() - startTime,
            data: operation.data
          });
        }
      }
    }

    return results;
  }

  /**
   * Execute batch scroll operations
   */
  private async executeBatchScrolls(operations: BatchItem[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    
    // Combine scroll operations to single optimized scroll
    if (operations.length > 1) {
      logger.debug(`Optimizing ${operations.length} scroll operations`);
      
      // Find final scroll position
      let finalY = 0;
      for (const operation of operations) {
        const data = operation.data as any;
        if (data.yPercent !== undefined) {
          finalY = data.yPercent;
        } else if (data.direction === 'down') {
          finalY += data.amount || 100;
        } else if (data.direction === 'up') {
          finalY -= data.amount || 100;
        }
      }

      // Execute single optimized scroll
      const startTime = Date.now();
      try {
        const result = await this.executeScroll({ yPercent: Math.max(0, Math.min(100, finalY)) });
        const executionTime = Date.now() - startTime;
        
        // Return success for all operations
        for (const operation of operations) {
          results.push({
            id: operation.id,
            success: true,
            result,
            executionTime,
            data: operation.data
          });
        }
      } catch (error) {
        // Return error for all operations
        for (const operation of operations) {
          results.push({
            id: operation.id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            executionTime: Date.now() - startTime,
            data: operation.data
          });
        }
      }
    } else {
      // Single scroll operation
      return await this.executeSequentially(operations);
    }

    return results;
  }

  /**
   * Execute batch wait operations
   */
  private async executeBatchWaits(operations: BatchItem[]): Promise<BatchResult[]> {
    // Find maximum wait time and execute once
    const maxWait = Math.max(...operations.map(op => (op.data as any).duration || 1000));
    
    logger.debug(`Optimizing ${operations.length} wait operations to ${maxWait}ms`);
    
    const startTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, maxWait));
    const executionTime = Date.now() - startTime;

    // Return success for all operations
    return operations.map(operation => ({
      id: operation.id,
      success: true,
      result: new ActionResult({ extractedContent: `Waited ${maxWait}ms` }),
      executionTime,
      data: operation.data
    }));
  }

  /**
   * Execute batch navigation operations
   */
  private async executeBatchNavigations(operations: BatchItem[]): Promise<BatchResult[]> {
    // Navigate to the last URL (most recent navigation wins)
    const lastOperation = operations[operations.length - 1];
    
    logger.debug(`Optimizing ${operations.length} navigation operations to final URL`);
    
    const startTime = Date.now();
    try {
      const result = await this.executeNavigation(lastOperation.data);
      const executionTime = Date.now() - startTime;
      
      // Return success for all operations
      return operations.map(operation => ({
        id: operation.id,
        success: true,
        result,
        executionTime,
        data: operation.data
      }));
    } catch (error) {
      // Return error for all operations
      return operations.map(operation => ({
        id: operation.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
        data: operation.data
      }));
    }
  }

  /**
   * Execute operations sequentially (fallback)
   */
  private async executeSequentially(operations: BatchItem[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    
    for (const operation of operations) {
      const startTime = Date.now();
      try {
        let result: ActionResult;
        
        switch (operation.operation) {
          case 'click':
            result = await this.executeClick(operation.data);
            break;
          case 'input':
            result = await this.executeInput(operation.data);
            break;
          case 'scroll':
            result = await this.executeScroll(operation.data);
            break;
          case 'navigate':
            result = await this.executeNavigation(operation.data);
            break;
          case 'wait':
            await new Promise(resolve => setTimeout(resolve, (operation.data as any).duration || 1000));
            result = new ActionResult({ extractedContent: 'Wait completed' });
            break;
          default:
            result = await this.executeCustom(operation);
            break;
        }
        
        results.push({
          id: operation.id,
          success: true,
          result,
          executionTime: Date.now() - startTime,
          data: operation.data
        });
      } catch (error) {
        results.push({
          id: operation.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          executionTime: Date.now() - startTime,
          data: operation.data
        });
      }
    }

    return results;
  }

  /**
   * Placeholder methods for actual operation execution
   * These should be replaced with actual implementation
   */
  private async executeClick(data: any): Promise<ActionResult> {
    // Placeholder - integrate with actual click implementation
    return new ActionResult({ extractedContent: `Clicked element ${data.index}` });
  }

  private async executeInput(data: any): Promise<ActionResult> {
    // Placeholder - integrate with actual input implementation  
    return new ActionResult({ extractedContent: `Input "${data.text}" to element ${data.index}` });
  }

  private async executeScroll(data: any): Promise<ActionResult> {
    // Placeholder - integrate with actual scroll implementation
    return new ActionResult({ extractedContent: `Scrolled to ${data.yPercent}%` });
  }

  private async executeNavigation(data: any): Promise<ActionResult> {
    // Placeholder - integrate with actual navigation implementation
    return new ActionResult({ extractedContent: `Navigated to ${data.url}` });
  }

  private async executeCustom(operation: BatchItem): Promise<ActionResult> {
    // Placeholder for custom operations
    return new ActionResult({ extractedContent: `Executed custom operation ${operation.id}` });
  }

  /**
   * Update statistics
   */
  private updateStats(results: BatchResult[], executionTime: number, batchSize: number): void {
    this.stats.totalBatches++;
    this.stats.totalOperations += results.length;
    this.stats.successfulOperations += results.filter(r => r.success).length;
    this.stats.failedOperations += results.filter(r => !r.success).length;
    
    // Update averages
    const totalTime = this.stats.averageExecutionTime * (this.stats.totalBatches - 1) + executionTime;
    this.stats.averageExecutionTime = totalTime / this.stats.totalBatches;
    
    const totalSize = this.stats.averageBatchSize * (this.stats.totalBatches - 1) + batchSize;
    this.stats.averageBatchSize = totalSize / this.stats.totalBatches;
  }

  /**
   * Get batch statistics
   */
  getStats(): BatchStats {
    return { ...this.stats };
  }

  /**
   * Get pending batch info
   */
  getPendingBatches(): { batchKey: string; size: number; age: number }[] {
    const now = Date.now();
    const pending: { batchKey: string; size: number; age: number }[] = [];
    
    for (const [batchKey, batch] of this.batches) {
      if (batch.length > 0) {
        const oldestItem = Math.min(...batch.map(item => item.createdAt));
        pending.push({
          batchKey,
          size: batch.length,
          age: now - oldestItem
        });
      }
    }
    
    return pending;
  }

  /**
   * Force flush all batches
   */
  async flushAll(): Promise<void> {
    const batchKeys = Array.from(this.batches.keys());
    const flushPromises = batchKeys.map(key => this.flushBatch(key));
    await Promise.allSettled(flushPromises);
    
    logger.debug(`Force flushed ${batchKeys.length} batches`);
  }

  /**
   * Destroy batch system
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    // Clear all pending batches
    this.batches.clear();
    this.processing.clear();
    
    logger.debug('Batch operations system destroyed');
  }
}

// Global batch operations instance
export const batchOperations = new BatchOperations({
  batchTimeout: 50,
  maxBatchSize: 10,
  flushInterval: 100
});