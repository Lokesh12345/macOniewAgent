import { createLogger } from '../../log';

const logger = createLogger('PerformanceMetrics');

export interface MetricValue {
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface MetricSeries {
  name: string;
  unit: string;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  values: MetricValue[];
  maxValues: number;
}

export interface MetricSnapshot {
  name: string;
  current: number;
  average: number;
  min: number;
  max: number;
  count: number;
  rate?: number; // per second
  percentiles?: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  unit: string;
  type: string;
  tags?: Record<string, string>;
}

export interface SystemMetrics {
  memory: {
    used: number;
    available: number;
    percentage: number;
  };
  cpu: {
    usage: number;
    processes: number;
  };
  network: {
    requests: number;
    errors: number;
    latency: number;
  };
  storage: {
    cacheSize: number;
    itemCount: number;
  };
}

/**
 * High-performance metrics collection system
 * Tracks performance metrics with minimal overhead
 */
export class PerformanceMetrics {
  private metrics = new Map<string, MetricSeries>();
  private startTime = Date.now();
  private collectInterval: NodeJS.Timeout;
  private systemMetrics: SystemMetrics = this.getInitialSystemMetrics();

  constructor(
    private options: {
      maxValuesPerMetric?: number;
      collectInterval?: number;
      enableSystemMetrics?: boolean;
    } = {}
  ) {
    const {
      maxValuesPerMetric = 1000,
      collectInterval = 5000,
      enableSystemMetrics = true
    } = options;

    // Initialize default metrics
    this.initializeDefaultMetrics();

    // Start system metrics collection
    if (enableSystemMetrics) {
      this.collectInterval = setInterval(() => {
        this.collectSystemMetrics();
      }, collectInterval);
    }

    logger.debug('Performance metrics initialized', options);
  }

  /**
   * Record a counter metric (monotonically increasing)
   */
  counter(name: string, value = 1, tags?: Record<string, string>): void {
    this.recordMetric(name, 'counter', 'count', value, tags);
  }

  /**
   * Record a gauge metric (point-in-time value)
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric(name, 'gauge', 'value', value, tags);
  }

  /**
   * Record a timer metric (duration measurement)
   */
  timer(name: string, duration: number, tags?: Record<string, string>): void {
    this.recordMetric(name, 'timer', 'ms', duration, tags);
  }

  /**
   * Record a histogram metric (distribution of values)
   */
  histogram(name: string, value: number, unit = 'value', tags?: Record<string, string>): void {
    this.recordMetric(name, 'histogram', unit, value, tags);
  }

  /**
   * Time a function execution
   */
  time<T>(name: string, fn: () => T, tags?: Record<string, string>): T;
  time<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T>;
  time<T>(name: string, fn: () => T | Promise<T>, tags?: Record<string, string>): T | Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result
          .then(value => {
            this.timer(name, Date.now() - startTime, tags);
            return value;
          })
          .catch(error => {
            this.timer(name, Date.now() - startTime, { ...tags, error: 'true' });
            throw error;
          });
      } else {
        this.timer(name, Date.now() - startTime, tags);
        return result;
      }
    } catch (error) {
      this.timer(name, Date.now() - startTime, { ...tags, error: 'true' });
      throw error;
    }
  }

  /**
   * Create a timer instance for manual timing
   */
  createTimer(name: string, tags?: Record<string, string>) {
    const startTime = Date.now();
    return {
      stop: () => {
        this.timer(name, Date.now() - startTime, tags);
      },
      elapsed: () => Date.now() - startTime
    };
  }

  /**
   * Record a custom metric
   */
  private recordMetric(
    name: string,
    type: MetricSeries['type'],
    unit: string,
    value: number,
    tags?: Record<string, string>
  ): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        name,
        unit,
        type,
        values: [],
        maxValues: this.options.maxValuesPerMetric || 1000
      });
    }

    const metric = this.metrics.get(name)!;
    const metricValue: MetricValue = {
      value,
      timestamp: Date.now(),
      tags
    };

    metric.values.push(metricValue);

    // Keep only the most recent values
    if (metric.values.length > metric.maxValues) {
      metric.values.shift();
    }
  }

  /**
   * Get metric snapshot with calculated statistics
   */
  getMetric(name: string): MetricSnapshot | null {
    const metric = this.metrics.get(name);
    if (!metric || metric.values.length === 0) {
      return null;
    }

    const values = metric.values.map(v => v.value);
    const latest = metric.values[metric.values.length - 1];
    const sortedValues = [...values].sort((a, b) => a - b);

    const snapshot: MetricSnapshot = {
      name: metric.name,
      current: latest.value,
      average: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
      unit: metric.unit,
      type: metric.type,
      tags: latest.tags
    };

    // Calculate rate for counters
    if (metric.type === 'counter' && metric.values.length > 1) {
      const firstValue = metric.values[0];
      const timeDiff = (latest.timestamp - firstValue.timestamp) / 1000; // seconds
      snapshot.rate = timeDiff > 0 ? (latest.value - firstValue.value) / timeDiff : 0;
    }

    // Calculate percentiles for histograms and timers
    if ((metric.type === 'histogram' || metric.type === 'timer') && sortedValues.length > 0) {
      snapshot.percentiles = {
        p50: this.percentile(sortedValues, 0.5),
        p90: this.percentile(sortedValues, 0.9),
        p95: this.percentile(sortedValues, 0.95),
        p99: this.percentile(sortedValues, 0.99)
      };
    }

    return snapshot;
  }

  /**
   * Get all metrics snapshots
   */
  getAllMetrics(): MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];
    
    for (const metricName of this.metrics.keys()) {
      const snapshot = this.getMetric(metricName);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get metrics by category
   */
  getMetricsByCategory(category: string): MetricSnapshot[] {
    return this.getAllMetrics().filter(metric => 
      metric.name.startsWith(category + '.')
    );
  }

  /**
   * Get system metrics
   */
  getSystemMetrics(): SystemMetrics {
    return { ...this.systemMetrics };
  }

  /**
   * Reset a specific metric
   */
  resetMetric(name: string): void {
    const metric = this.metrics.get(name);
    if (metric) {
      metric.values = [];
      logger.debug(`Reset metric: ${name}`);
    }
  }

  /**
   * Reset all metrics
   */
  resetAllMetrics(): void {
    for (const metric of this.metrics.values()) {
      metric.values = [];
    }
    this.startTime = Date.now();
    logger.debug('Reset all metrics');
  }

  /**
   * Get metrics summary
   */
  getSummary(): {
    totalMetrics: number;
    totalDataPoints: number;
    uptime: number;
    memoryUsage: number;
    topMetrics: Array<{ name: string; value: number; unit: string }>;
  } {
    const metrics = this.getAllMetrics();
    const totalDataPoints = Array.from(this.metrics.values())
      .reduce((sum, metric) => sum + metric.values.length, 0);

    // Find top metrics by current value
    const topMetrics = metrics
      .filter(m => typeof m.current === 'number')
      .sort((a, b) => Math.abs(b.current) - Math.abs(a.current))
      .slice(0, 5)
      .map(m => ({ name: m.name, value: m.current, unit: m.unit }));

    return {
      totalMetrics: metrics.length,
      totalDataPoints,
      uptime: Date.now() - this.startTime,
      memoryUsage: this.systemMetrics.memory.used,
      topMetrics
    };
  }

  /**
   * Export metrics data
   */
  exportMetrics(format: 'json' | 'csv' = 'json'): string {
    const metrics = this.getAllMetrics();
    
    if (format === 'csv') {
      const headers = ['name', 'type', 'current', 'average', 'min', 'max', 'count', 'unit'];
      const rows = metrics.map(m => [
        m.name, m.type, m.current, m.average, m.min, m.max, m.count, m.unit
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify({
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      metrics,
      system: this.systemMetrics
    }, null, 2);
  }

  /**
   * Initialize default metrics
   */
  private initializeDefaultMetrics(): void {
    // System metrics
    this.gauge('system.memory.used', 0);
    this.gauge('system.memory.percentage', 0);
    this.gauge('system.cpu.usage', 0);
    this.counter('system.network.requests', 0);
    this.counter('system.network.errors', 0);
    
    // Performance metrics
    this.counter('performance.dom.cache.hits', 0);
    this.counter('performance.dom.cache.misses', 0);
    this.counter('performance.connections.created', 0);
    this.counter('performance.connections.reused', 0);
    this.counter('performance.batch.operations', 0);
    this.counter('performance.lazy.loads', 0);
    
    // Agent metrics
    this.counter('agent.actions.executed', 0);
    this.counter('agent.actions.failed', 0);
    this.timer('agent.action.duration', 0);
    this.timer('agent.navigation.duration', 0);
    this.counter('agent.errors.recovered', 0);
    
    // Browser metrics
    this.counter('browser.tabs.opened', 0);
    this.counter('browser.tabs.closed', 0);
    this.timer('browser.page.load', 0);
    this.gauge('browser.active.connections', 0);
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    try {
      // Memory metrics (Chrome extension context)
      if (typeof performance !== 'undefined' && (performance as any).memory) {
        const memory = (performance as any).memory;
        this.systemMetrics.memory.used = memory.usedJSHeapSize;
        this.systemMetrics.memory.available = memory.jsHeapSizeLimit;
        this.systemMetrics.memory.percentage = 
          (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
        
        this.gauge('system.memory.used', memory.usedJSHeapSize);
        this.gauge('system.memory.percentage', this.systemMetrics.memory.percentage);
      }

      // Network metrics (approximate)
      this.systemMetrics.network.requests = this.getMetric('system.network.requests')?.current || 0;
      this.systemMetrics.network.errors = this.getMetric('system.network.errors')?.current || 0;

      // Storage metrics
      const domCacheMetric = this.getMetric('performance.dom.cache.hits');
      const connectionMetric = this.getMetric('performance.connections.created');
      
      this.systemMetrics.storage.itemCount = 
        (domCacheMetric?.count || 0) + (connectionMetric?.count || 0);

    } catch (error) {
      logger.warning('Failed to collect system metrics:', error);
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    if (sortedArray.length === 1) return sortedArray[0];
    
    const index = (sortedArray.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedArray[lower];
    }
    
    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Get initial system metrics
   */
  private getInitialSystemMetrics(): SystemMetrics {
    return {
      memory: { used: 0, available: 0, percentage: 0 },
      cpu: { usage: 0, processes: 1 },
      network: { requests: 0, errors: 0, latency: 0 },
      storage: { cacheSize: 0, itemCount: 0 }
    };
  }

  /**
   * Destroy metrics collector
   */
  destroy(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
    }
    
    this.metrics.clear();
    logger.debug('Performance metrics destroyed');
  }
}

// Global metrics instance
export const performanceMetrics = new PerformanceMetrics({
  maxValuesPerMetric: 1000,
  collectInterval: 5000,
  enableSystemMetrics: true
});