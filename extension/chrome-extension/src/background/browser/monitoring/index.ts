import { createLogger } from '../../log';
import { performanceMetrics, type MetricSnapshot, type SystemMetrics } from './metrics';
import { performanceDashboard, type DashboardLayout, type PerformanceAlert } from './dashboard';
import { performanceAlerting, type AlertRule, type Alert } from './alerts';

const logger = createLogger('PerformanceMonitoring');

export interface MonitoringConfig {
  enableMetrics: boolean;
  enableDashboard: boolean;
  enableAlerting: boolean;
  metricsConfig: {
    maxValuesPerMetric: number;
    collectInterval: number;
    enableSystemMetrics: boolean;
  };
  dashboardConfig: {
    updateInterval: number;
    maxAlerts: number;
  };
  alertingConfig: {
    checkInterval: number;
    maxAlerts: number;
    enableDefaultRules: boolean;
  };
}

export interface MonitoringStats {
  uptime: number;
  metrics: {
    total: number;
    dataPoints: number;
    categories: string[];
  };
  alerts: {
    total: number;
    active: number;
    acknowledged: number;
    byLevel: { info: number; warning: number; critical: number };
  };
  dashboard: {
    layouts: number;
    subscribers: number;
    lastUpdate: number;
  };
  system: SystemMetrics;
}

/**
 * Central Performance Monitoring System
 * Coordinates metrics collection, dashboard, and alerting
 */
export class PerformanceMonitoring {
  private config: MonitoringConfig;
  private startTime = Date.now();
  private instrumentedFunctions = new Map<string, Function>();

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      enableMetrics: true,
      enableDashboard: true,
      enableAlerting: true,
      metricsConfig: {
        maxValuesPerMetric: 1000,
        collectInterval: 5000,
        enableSystemMetrics: true
      },
      dashboardConfig: {
        updateInterval: 2000,
        maxAlerts: 100
      },
      alertingConfig: {
        checkInterval: 5000,
        maxAlerts: 1000,
        enableDefaultRules: true
      },
      ...config
    };

    logger.info('Performance monitoring system initialized', this.config);
  }

  /**
   * Get comprehensive monitoring statistics
   */
  getStats(): MonitoringStats {
    const metricsStats = performanceMetrics.getSummary();
    const alertStats = performanceAlerting.getStats();
    const systemMetrics = performanceMetrics.getSystemMetrics();

    return {
      uptime: Date.now() - this.startTime,
      metrics: {
        total: metricsStats.totalMetrics,
        dataPoints: metricsStats.totalDataPoints,
        categories: this.getMetricCategories()
      },
      alerts: {
        total: alertStats.totalAlerts,
        active: alertStats.totalAlerts - alertStats.acknowledgedAlerts,
        acknowledged: alertStats.acknowledgedAlerts,
        byLevel: alertStats.alertsByLevel
      },
      dashboard: {
        layouts: performanceDashboard.getAllLayouts().length,
        subscribers: 0, // This would need to be exposed from dashboard
        lastUpdate: Date.now()
      },
      system: systemMetrics
    };
  }

  /**
   * Get health status of monitoring system
   */
  getHealth(): {
    healthy: boolean;
    issues: string[];
    recommendations: string[];
    components: {
      metrics: 'healthy' | 'degraded' | 'failed';
      dashboard: 'healthy' | 'degraded' | 'failed';
      alerting: 'healthy' | 'degraded' | 'failed';
    };
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    const systemMetrics = performanceMetrics.getSystemMetrics();
    const alertStats = performanceAlerting.getStats();

    // Check system health
    if (systemMetrics.memory.percentage > 90) {
      issues.push('High memory usage detected');
      recommendations.push('Consider reducing metric retention or cache sizes');
    }

    // Check alert health
    const criticalAlerts = alertStats.alertsByLevel.critical;
    if (criticalAlerts > 0) {
      issues.push(`${criticalAlerts} critical alerts active`);
      recommendations.push('Review and resolve critical alerts');
    }

    // Check component health
    const components = {
      metrics: this.config.enableMetrics ? 'healthy' as const : 'degraded' as const,
      dashboard: this.config.enableDashboard ? 'healthy' as const : 'degraded' as const,
      alerting: this.config.enableAlerting ? 'healthy' as const : 'degraded' as const
    };

    return {
      healthy: issues.length === 0,
      issues,
      recommendations,
      components
    };
  }

  /**
   * Record a custom metric
   */
  recordMetric(name: string, value: number, type: 'counter' | 'gauge' | 'timer' | 'histogram' = 'gauge', tags?: Record<string, string>): void {
    if (!this.config.enableMetrics) return;

    switch (type) {
      case 'counter':
        performanceMetrics.counter(name, value, tags);
        break;
      case 'gauge':
        performanceMetrics.gauge(name, value, tags);
        break;
      case 'timer':
        performanceMetrics.timer(name, value, tags);
        break;
      case 'histogram':
        performanceMetrics.histogram(name, value, 'value', tags);
        break;
    }
  }

  /**
   * Time a function execution
   */
  timeFunction<T>(name: string, fn: () => T, tags?: Record<string, string>): T;
  timeFunction<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T>;
  timeFunction<T>(name: string, fn: () => T | Promise<T>, tags?: Record<string, string>): T | Promise<T> {
    if (!this.config.enableMetrics) {
      return fn();
    }

    return performanceMetrics.time(name, fn, tags);
  }

  /**
   * Instrument a function with automatic metrics collection
   */
  instrument<T extends Function>(name: string, fn: T, options: {
    recordCalls?: boolean;
    recordDuration?: boolean;
    recordErrors?: boolean;
    tags?: Record<string, string>;
  } = {}): T {
    if (!this.config.enableMetrics) {
      return fn;
    }

    const { recordCalls = true, recordDuration = true, recordErrors = true, tags } = options;

    const instrumented = ((...args: any[]) => {
      if (recordCalls) {
        performanceMetrics.counter(`${name}.calls`, 1, tags);
      }

      const timer = performanceMetrics.createTimer(`${name}.duration`, tags);
      
      try {
        const result = fn.apply(this, args);
        
        if (result instanceof Promise) {
          return result
            .then(value => {
              if (recordDuration) timer.stop();
              return value;
            })
            .catch(error => {
              if (recordDuration) timer.stop();
              if (recordErrors) {
                performanceMetrics.counter(`${name}.errors`, 1, { ...tags, error: error.name });
              }
              throw error;
            });
        } else {
          if (recordDuration) timer.stop();
          return result;
        }
      } catch (error) {
        if (recordDuration) timer.stop();
        if (recordErrors) {
          performanceMetrics.counter(`${name}.errors`, 1, { 
            ...tags, 
            error: error instanceof Error ? error.name : 'Unknown' 
          });
        }
        throw error;
      }
    }) as unknown as T;

    this.instrumentedFunctions.set(name, instrumented);
    return instrumented;
  }

  /**
   * Create a custom dashboard layout
   */
  createDashboard(name: string, description: string, widgets: any[]): string | null {
    if (!this.config.enableDashboard) return null;

    return performanceDashboard.createLayout({
      name,
      description,
      widgets,
      refreshRate: 2000
    });
  }

  /**
   * Subscribe to dashboard updates
   */
  subscribeToDashboard(callback: (data: any) => void): (() => void) | null {
    if (!this.config.enableDashboard) return null;

    return performanceDashboard.subscribe(callback);
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: Omit<AlertRule, 'id'>): string | null {
    if (!this.config.enableAlerting) return null;

    return performanceAlerting.addRule(rule);
  }

  /**
   * Subscribe to alerts
   */
  subscribeToAlerts(callback: (alert: Alert) => void): (() => void) | null {
    if (!this.config.enableAlerting) return null;

    return performanceAlerting.subscribe(callback);
  }

  /**
   * Get current dashboard data
   */
  getDashboardData(layoutId: string = 'overview'): any {
    if (!this.config.enableDashboard) return null;

    return performanceDashboard.getDashboardData(layoutId);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    if (!this.config.enableAlerting) return [];

    return performanceAlerting.getActiveAlerts();
  }

  /**
   * Get metric by name
   */
  getMetric(name: string): MetricSnapshot | null {
    if (!this.config.enableMetrics) return null;

    return performanceMetrics.getMetric(name);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): MetricSnapshot[] {
    if (!this.config.enableMetrics) return [];

    return performanceMetrics.getAllMetrics();
  }

  /**
   * Get metrics by category
   */
  getMetricsByCategory(category: string): MetricSnapshot[] {
    if (!this.config.enableMetrics) return [];

    return performanceMetrics.getMetricsByCategory(category);
  }

  /**
   * Generate monitoring report
   */
  generateReport(options: {
    timeRange?: number; // minutes
    includeMetrics?: boolean;
    includeAlerts?: boolean;
    includeRecommendations?: boolean;
  } = {}): {
    timestamp: number;
    timeRange: number;
    summary: {
      uptime: number;
      health: string;
      totalMetrics: number;
      activeAlerts: number;
    };
    metrics?: MetricSnapshot[];
    alerts?: Alert[];
    recommendations?: string[];
    performance: {
      avgResponseTime: number;
      errorRate: number;
      throughput: number;
      cacheHitRate: number;
    };
  } {
    const {
      timeRange = 60,
      includeMetrics = true,
      includeAlerts = true,
      includeRecommendations = true
    } = options;

    const stats = this.getStats();
    const health = this.getHealth();
    
    // Calculate performance metrics
    const actionDuration = this.getMetric('agent.action.duration');
    const totalActions = this.getMetric('agent.actions.executed')?.current || 0;
    const failedActions = this.getMetric('agent.actions.failed')?.current || 0;
    const cacheHits = this.getMetric('performance.dom.cache.hits')?.current || 0;
    const cacheMisses = this.getMetric('performance.dom.cache.misses')?.current || 0;

    const errorRate = totalActions > 0 ? (failedActions / totalActions) * 100 : 0;
    const cacheHitRate = (cacheHits + cacheMisses) > 0 ? (cacheHits / (cacheHits + cacheMisses)) * 100 : 0;

    const report: any = {
      timestamp: Date.now(),
      timeRange,
      summary: {
        uptime: stats.uptime,
        health: health.healthy ? 'good' : 'degraded',
        totalMetrics: stats.metrics.total,
        activeAlerts: stats.alerts.active
      },
      performance: {
        avgResponseTime: actionDuration?.average || 0,
        errorRate: Math.round(errorRate),
        throughput: totalActions,
        cacheHitRate: Math.round(cacheHitRate)
      }
    };

    if (includeMetrics) {
      report.metrics = this.getAllMetrics();
    }

    if (includeAlerts) {
      report.alerts = this.getActiveAlerts();
    }

    if (includeRecommendations) {
      report.recommendations = health.recommendations;
    }

    return report;
  }

  /**
   * Export monitoring data
   */
  exportData(format: 'json' | 'csv' = 'json'): string {
    const data = {
      timestamp: Date.now(),
      config: this.config,
      stats: this.getStats(),
      health: this.getHealth(),
      metrics: this.getAllMetrics(),
      alerts: this.getActiveAlerts()
    };

    if (format === 'csv') {
      // Simple CSV export of metrics
      const metrics = this.getAllMetrics();
      const headers = ['name', 'type', 'current', 'average', 'min', 'max', 'count', 'unit'];
      const rows = metrics.map(m => [
        m.name, m.type, m.current, m.average, m.min, m.max, m.count, m.unit
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Monitoring configuration updated', this.config);
  }

  /**
   * Cleanup old data
   */
  cleanup(options: {
    clearOldMetrics?: boolean;
    clearOldAlerts?: boolean;
    olderThanMs?: number;
  } = {}): {
    metricsCleared: number;
    alertsCleared: number;
  } {
    const { clearOldMetrics = true, clearOldAlerts = true, olderThanMs = 86400000 } = options;
    
    let metricsCleared = 0;
    let alertsCleared = 0;

    if (clearOldMetrics) {
      performanceMetrics.resetAllMetrics();
      metricsCleared = 1; // Reset all metrics
    }

    if (clearOldAlerts) {
      alertsCleared = performanceAlerting.clearOldAlerts(olderThanMs);
    }

    logger.info(`Cleanup completed: ${metricsCleared} metrics reset, ${alertsCleared} alerts cleared`);

    return { metricsCleared, alertsCleared };
  }

  /**
   * Get metric categories
   */
  private getMetricCategories(): string[] {
    const categories = new Set<string>();
    
    for (const metric of this.getAllMetrics()) {
      const category = metric.name.split('.')[0];
      categories.add(category);
    }

    return Array.from(categories).sort();
  }

  /**
   * Destroy monitoring system
   */
  async destroy(): Promise<void> {
    // Clear instrumented functions
    this.instrumentedFunctions.clear();

    // Destroy components
    performanceMetrics.destroy();
    performanceDashboard.destroy();
    performanceAlerting.destroy();

    logger.info('Performance monitoring system destroyed');
  }
}

// Global monitoring instance
export const performanceMonitoring = new PerformanceMonitoring();

// Export individual components for direct access
export {
  performanceMetrics,
  performanceDashboard,
  performanceAlerting
};

// Export types
export type {
  MetricSnapshot,
  SystemMetrics,
  DashboardLayout,
  PerformanceAlert,
  AlertRule,
  Alert,
  MonitoringConfig,
  MonitoringStats
};