import { createLogger } from '../../log';
import { performanceMetrics, type MetricSnapshot, type SystemMetrics } from './metrics';

const logger = createLogger('PerformanceDashboard');

export interface DashboardWidget {
  id: string;
  title: string;
  type: 'metric' | 'chart' | 'status' | 'table';
  config: {
    metricName?: string;
    category?: string;
    timeRange?: number; // minutes
    refreshRate?: number; // milliseconds
    threshold?: {
      warning: number;
      critical: number;
    };
    format?: 'number' | 'percentage' | 'bytes' | 'duration';
  };
  data?: any;
  status?: 'ok' | 'warning' | 'critical' | 'unknown';
}

export interface DashboardLayout {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  refreshRate: number;
}

export interface PerformanceAlert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  metricName: string;
  value: number;
  threshold: number;
  timestamp: number;
  acknowledged: boolean;
}

/**
 * Performance Dashboard
 * Provides real-time monitoring and visualization of performance metrics
 */
export class PerformanceDashboard {
  private layouts = new Map<string, DashboardLayout>();
  private alerts: PerformanceAlert[] = [];
  private subscribers = new Set<(data: any) => void>();
  private updateInterval: NodeJS.Timeout;
  private lastUpdateTime = 0;

  constructor(
    private options: {
      updateInterval?: number;
      maxAlerts?: number;
      enableAlerts?: boolean;
    } = {}
  ) {
    const { updateInterval = 2000, enableAlerts = true } = options;

    // Initialize default layouts
    this.initializeDefaultLayouts();

    // Start update loop
    this.updateInterval = setInterval(() => {
      this.updateDashboard();
    }, updateInterval);

    if (enableAlerts) {
      this.setupAlertRules();
    }

    logger.debug('Performance dashboard initialized');
  }

  /**
   * Get dashboard layout
   */
  getLayout(layoutId: string): DashboardLayout | null {
    return this.layouts.get(layoutId) || null;
  }

  /**
   * Get all layouts
   */
  getAllLayouts(): DashboardLayout[] {
    return Array.from(this.layouts.values());
  }

  /**
   * Create custom layout
   */
  createLayout(layout: Omit<DashboardLayout, 'id'>): string {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullLayout: DashboardLayout = { ...layout, id };
    
    this.layouts.set(id, fullLayout);
    logger.debug(`Created custom layout: ${id}`);
    
    return id;
  }

  /**
   * Update widget in layout
   */
  updateWidget(layoutId: string, widgetId: string, updates: Partial<DashboardWidget>): boolean {
    const layout = this.layouts.get(layoutId);
    if (!layout) return false;

    const widget = layout.widgets.find(w => w.id === widgetId);
    if (!widget) return false;

    Object.assign(widget, updates);
    logger.debug(`Updated widget ${widgetId} in layout ${layoutId}`);
    
    return true;
  }

  /**
   * Get current dashboard data
   */
  getDashboardData(layoutId: string): {
    layout: DashboardLayout;
    widgets: Array<DashboardWidget & { data: any; status: string }>;
    timestamp: number;
    alerts: PerformanceAlert[];
    systemStatus: {
      overall: 'healthy' | 'warning' | 'critical';
      uptime: number;
      metrics: number;
    };
  } | null {
    const layout = this.layouts.get(layoutId);
    if (!layout) return null;

    const widgets = layout.widgets.map(widget => ({
      ...widget,
      data: this.getWidgetData(widget),
      status: this.getWidgetStatus(widget)
    }));

    const systemMetrics = performanceMetrics.getSystemMetrics();
    const summary = performanceMetrics.getSummary();
    
    // Determine overall system status
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (systemMetrics.memory.percentage > 90 || this.alerts.some(a => a.level === 'critical')) {
      overallStatus = 'critical';
    } else if (systemMetrics.memory.percentage > 75 || this.alerts.some(a => a.level === 'warning')) {
      overallStatus = 'warning';
    }

    return {
      layout,
      widgets,
      timestamp: Date.now(),
      alerts: this.getActiveAlerts(),
      systemStatus: {
        overall: overallStatus,
        uptime: summary.uptime,
        metrics: summary.totalMetrics
      }
    };
  }

  /**
   * Get real-time metrics snapshot
   */
  getMetricsSnapshot(): {
    timestamp: number;
    performance: {
      cacheHitRate: number;
      averageResponseTime: number;
      activeConnections: number;
      errorRate: number;
    };
    system: SystemMetrics;
    agents: {
      totalActions: number;
      successRate: number;
      averageActionTime: number;
    };
    browser: {
      activeTabs: number;
      totalPageLoads: number;
      averageLoadTime: number;
    };
  } {
    const cacheHits = performanceMetrics.getMetric('performance.dom.cache.hits')?.current || 0;
    const cacheMisses = performanceMetrics.getMetric('performance.dom.cache.misses')?.current || 0;
    const cacheHitRate = (cacheHits + cacheMisses) > 0 ? cacheHits / (cacheHits + cacheMisses) : 0;

    const totalActions = performanceMetrics.getMetric('agent.actions.executed')?.current || 0;
    const failedActions = performanceMetrics.getMetric('agent.actions.failed')?.current || 0;
    const successRate = totalActions > 0 ? (totalActions - failedActions) / totalActions : 1;

    const actionDuration = performanceMetrics.getMetric('agent.action.duration');
    const pageLoadDuration = performanceMetrics.getMetric('browser.page.load');

    return {
      timestamp: Date.now(),
      performance: {
        cacheHitRate: Math.round(cacheHitRate * 100),
        averageResponseTime: actionDuration?.average || 0,
        activeConnections: performanceMetrics.getMetric('browser.active.connections')?.current || 0,
        errorRate: Math.round((1 - successRate) * 100)
      },
      system: performanceMetrics.getSystemMetrics(),
      agents: {
        totalActions,
        successRate: Math.round(successRate * 100),
        averageActionTime: actionDuration?.average || 0
      },
      browser: {
        activeTabs: performanceMetrics.getMetric('browser.tabs.opened')?.current || 0,
        totalPageLoads: performanceMetrics.getMetric('browser.page.load')?.count || 0,
        averageLoadTime: pageLoadDuration?.average || 0
      }
    };
  }

  /**
   * Subscribe to dashboard updates
   */
  subscribe(callback: (data: any) => void): () => void {
    this.subscribers.add(callback);
    
    // Send initial data
    callback(this.getDashboardData('overview'));
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts
      .filter(alert => !alert.acknowledged)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      logger.debug(`Acknowledged alert: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Clear acknowledged alerts
   */
  clearAcknowledgedAlerts(): number {
    const initialCount = this.alerts.length;
    this.alerts = this.alerts.filter(alert => !alert.acknowledged);
    const clearedCount = initialCount - this.alerts.length;
    
    if (clearedCount > 0) {
      logger.debug(`Cleared ${clearedCount} acknowledged alerts`);
    }
    
    return clearedCount;
  }

  /**
   * Generate performance report
   */
  generateReport(timeRange: number = 60): {
    summary: {
      timeRange: number;
      totalMetrics: number;
      alertsGenerated: number;
      systemHealth: string;
    };
    metrics: {
      category: string;
      metrics: Array<{
        name: string;
        current: number;
        average: number;
        trend: 'up' | 'down' | 'stable';
        unit: string;
      }>;
    }[];
    recommendations: string[];
  } {
    const summary = performanceMetrics.getSummary();
    const systemMetrics = performanceMetrics.getSystemMetrics();
    const recentAlerts = this.alerts.filter(
      alert => Date.now() - alert.timestamp < timeRange * 60 * 1000
    );

    // Group metrics by category
    const categories = new Map<string, MetricSnapshot[]>();
    const allMetrics = performanceMetrics.getAllMetrics();
    
    for (const metric of allMetrics) {
      const category = metric.name.split('.')[0];
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(metric);
    }

    const metrics = Array.from(categories.entries()).map(([category, categoryMetrics]) => ({
      category,
      metrics: categoryMetrics.map(m => ({
        name: m.name,
        current: m.current,
        average: m.average,
        trend: this.calculateTrend(m) as 'up' | 'down' | 'stable',
        unit: m.unit
      }))
    }));

    const recommendations = this.generateRecommendations(systemMetrics, allMetrics);

    return {
      summary: {
        timeRange,
        totalMetrics: summary.totalMetrics,
        alertsGenerated: recentAlerts.length,
        systemHealth: systemMetrics.memory.percentage < 75 ? 'good' : 
                     systemMetrics.memory.percentage < 90 ? 'fair' : 'poor'
      },
      metrics,
      recommendations
    };
  }

  /**
   * Initialize default dashboard layouts
   */
  private initializeDefaultLayouts(): void {
    // Overview layout
    const overviewLayout: DashboardLayout = {
      id: 'overview',
      name: 'Performance Overview',
      description: 'High-level performance metrics and system status',
      refreshRate: 2000,
      widgets: [
        {
          id: 'system_memory',
          title: 'Memory Usage',
          type: 'metric',
          config: {
            metricName: 'system.memory.percentage',
            format: 'percentage',
            threshold: { warning: 75, critical: 90 }
          }
        },
        {
          id: 'cache_hit_rate',
          title: 'Cache Hit Rate',
          type: 'metric',
          config: {
            metricName: 'performance.dom.cache.hits',
            format: 'percentage'
          }
        },
        {
          id: 'action_success_rate',
          title: 'Action Success Rate',
          type: 'metric',
          config: {
            metricName: 'agent.actions.executed',
            format: 'percentage'
          }
        },
        {
          id: 'response_time',
          title: 'Average Response Time',
          type: 'metric',
          config: {
            metricName: 'agent.action.duration',
            format: 'duration',
            threshold: { warning: 1000, critical: 3000 }
          }
        },
        {
          id: 'active_connections',
          title: 'Active Connections',
          type: 'metric',
          config: {
            metricName: 'browser.active.connections',
            format: 'number'
          }
        },
        {
          id: 'recent_alerts',
          title: 'Recent Alerts',
          type: 'table',
          config: {
            timeRange: 60
          }
        }
      ]
    };

    // Detailed performance layout
    const detailedLayout: DashboardLayout = {
      id: 'detailed',
      name: 'Detailed Performance',
      description: 'Comprehensive performance metrics and analysis',
      refreshRate: 5000,
      widgets: [
        {
          id: 'performance_category',
          title: 'Performance Metrics',
          type: 'table',
          config: {
            category: 'performance'
          }
        },
        {
          id: 'agent_category',
          title: 'Agent Metrics',
          type: 'table',
          config: {
            category: 'agent'
          }
        },
        {
          id: 'browser_category',
          title: 'Browser Metrics',
          type: 'table',
          config: {
            category: 'browser'
          }
        },
        {
          id: 'system_status',
          title: 'System Status',
          type: 'status',
          config: {}
        }
      ]
    };

    this.layouts.set('overview', overviewLayout);
    this.layouts.set('detailed', detailedLayout);
  }

  /**
   * Get widget data
   */
  private getWidgetData(widget: DashboardWidget): any {
    switch (widget.type) {
      case 'metric':
        if (widget.config.metricName) {
          return performanceMetrics.getMetric(widget.config.metricName);
        }
        break;
        
      case 'table':
        if (widget.config.category) {
          return performanceMetrics.getMetricsByCategory(widget.config.category);
        }
        if (widget.id === 'recent_alerts') {
          return this.getActiveAlerts().slice(0, 10);
        }
        break;
        
      case 'status':
        return this.getMetricsSnapshot();
        
      case 'chart':
        // Chart data would be implemented based on specific requirements
        return { message: 'Chart data not implemented' };
    }
    
    return null;
  }

  /**
   * Get widget status
   */
  private getWidgetStatus(widget: DashboardWidget): string {
    if (!widget.config.threshold) return 'ok';
    
    const data = this.getWidgetData(widget);
    if (!data || typeof data.current !== 'number') return 'unknown';
    
    const value = data.current;
    const { warning, critical } = widget.config.threshold;
    
    if (value >= critical) return 'critical';
    if (value >= warning) return 'warning';
    return 'ok';
  }

  /**
   * Update dashboard and notify subscribers
   */
  private updateDashboard(): void {
    const now = Date.now();
    
    // Check for alerts
    this.checkAlerts();
    
    // Notify subscribers
    for (const subscriber of this.subscribers) {
      try {
        subscriber(this.getDashboardData('overview'));
      } catch (error) {
        logger.warning('Dashboard subscriber error:', error);
      }
    }
    
    this.lastUpdateTime = now;
  }

  /**
   * Setup alert rules
   */
  private setupAlertRules(): void {
    // These would be configurable in a real implementation
    const alertRules = [
      {
        metricName: 'system.memory.percentage',
        warning: 75,
        critical: 90,
        title: 'High Memory Usage'
      },
      {
        metricName: 'agent.action.duration',
        warning: 2000,
        critical: 5000,
        title: 'Slow Action Performance'
      }
    ];

    // Check alerts periodically
    setInterval(() => {
      this.checkAlerts(alertRules);
    }, 10000); // Check every 10 seconds
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(rules?: Array<{
    metricName: string;
    warning: number;
    critical: number;
    title: string;
  }>): void {
    if (!rules) return;

    for (const rule of rules) {
      const metric = performanceMetrics.getMetric(rule.metricName);
      if (!metric) continue;

      const value = metric.current;
      let level: 'warning' | 'critical' | null = null;
      let threshold = 0;

      if (value >= rule.critical) {
        level = 'critical';
        threshold = rule.critical;
      } else if (value >= rule.warning) {
        level = 'warning';
        threshold = rule.warning;
      }

      if (level) {
        this.createAlert(level, rule.title, rule.metricName, value, threshold);
      }
    }
  }

  /**
   * Create alert
   */
  private createAlert(
    level: 'warning' | 'critical',
    title: string,
    metricName: string,
    value: number,
    threshold: number
  ): void {
    // Avoid duplicate alerts
    const existingAlert = this.alerts.find(
      alert => alert.metricName === metricName && 
               alert.level === level && 
               !alert.acknowledged &&
               Date.now() - alert.timestamp < 60000 // Within last minute
    );

    if (existingAlert) return;

    const alert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      level,
      title,
      message: `${metricName} is ${value} (threshold: ${threshold})`,
      metricName,
      value,
      threshold,
      timestamp: Date.now(),
      acknowledged: false
    };

    this.alerts.push(alert);

    // Keep only recent alerts
    const maxAlerts = this.options.maxAlerts || 100;
    if (this.alerts.length > maxAlerts) {
      this.alerts = this.alerts
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, maxAlerts);
    }

    logger.info(`Created ${level} alert: ${title}`);
  }

  /**
   * Calculate metric trend
   */
  private calculateTrend(metric: MetricSnapshot): 'up' | 'down' | 'stable' {
    if (metric.count < 2) return 'stable';
    
    const change = Math.abs(metric.current - metric.average);
    const threshold = metric.average * 0.1; // 10% threshold
    
    if (change < threshold) return 'stable';
    return metric.current > metric.average ? 'up' : 'down';
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    systemMetrics: SystemMetrics,
    allMetrics: MetricSnapshot[]
  ): string[] {
    const recommendations: string[] = [];

    // Memory recommendations
    if (systemMetrics.memory.percentage > 85) {
      recommendations.push('Consider reducing cache sizes or increasing memory limits');
    }

    // Performance recommendations
    const cacheHitRate = allMetrics.find(m => m.name === 'performance.dom.cache.hits');
    if (cacheHitRate && cacheHitRate.rate && cacheHitRate.rate < 0.5) {
      recommendations.push('Low cache hit rate detected - review caching strategy');
    }

    // Error rate recommendations
    const errorRate = allMetrics.find(m => m.name === 'agent.actions.failed');
    if (errorRate && errorRate.rate && errorRate.rate > 0.1) {
      recommendations.push('High error rate detected - review error handling and recovery');
    }

    return recommendations;
  }

  /**
   * Destroy dashboard
   */
  destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.subscribers.clear();
    this.layouts.clear();
    this.alerts = [];
    
    logger.debug('Performance dashboard destroyed');
  }
}

// Global dashboard instance
export const performanceDashboard = new PerformanceDashboard({
  updateInterval: 2000,
  maxAlerts: 100,
  enableAlerts: true
});