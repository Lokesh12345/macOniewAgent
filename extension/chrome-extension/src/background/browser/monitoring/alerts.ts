import { createLogger } from '../../log';
import { performanceMetrics, type MetricSnapshot } from './metrics';

const logger = createLogger('PerformanceAlerts');

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metricName: string;
  condition: 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'contains';
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  cooldownPeriod: number; // milliseconds
  actions: AlertAction[];
  tags?: Record<string, string>;
}

export interface AlertAction {
  type: 'log' | 'console' | 'notification' | 'webhook' | 'email';
  config: Record<string, any>;
  enabled: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  metricName: string;
  value: number;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  acknowledged: boolean;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

export interface AlertStats {
  totalRules: number;
  activeRules: number;
  totalAlerts: number;
  alertsByLevel: {
    info: number;
    warning: number;
    critical: number;
  };
  recentAlerts: number;
  acknowledgedAlerts: number;
}

/**
 * Performance Alerting System
 * Monitors metrics and triggers alerts based on configurable rules
 */
export class PerformanceAlerting {
  private rules = new Map<string, AlertRule>();
  private alerts: Alert[] = [];
  private cooldowns = new Map<string, number>();
  private checkInterval: NodeJS.Timeout;
  private subscribers = new Set<(alert: Alert) => void>();

  constructor(
    private options: {
      checkInterval?: number;
      maxAlerts?: number;
      enableDefaultRules?: boolean;
    } = {}
  ) {
    const { checkInterval = 5000, enableDefaultRules = true } = options;

    if (enableDefaultRules) {
      this.setupDefaultRules();
    }

    // Start alert checking
    this.checkInterval = setInterval(() => {
      this.checkAlerts();
    }, checkInterval);

    logger.debug('Performance alerting system initialized');
  }

  /**
   * Add alert rule
   */
  addRule(rule: Omit<AlertRule, 'id'>): string {
    const id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullRule: AlertRule = { ...rule, id };
    
    this.rules.set(id, fullRule);
    logger.debug(`Added alert rule: ${rule.name} (${id})`);
    
    return id;
  }

  /**
   * Update alert rule
   */
  updateRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    Object.assign(rule, updates);
    logger.debug(`Updated alert rule: ${ruleId}`);
    
    return true;
  }

  /**
   * Remove alert rule
   */
  removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      logger.debug(`Removed alert rule: ${ruleId}`);
    }
    return removed;
  }

  /**
   * Get alert rule
   */
  getRule(ruleId: string): AlertRule | null {
    return this.rules.get(ruleId) || null;
  }

  /**
   * Get all alert rules
   */
  getAllRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Enable/disable rule
   */
  toggleRule(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    rule.enabled = enabled;
    logger.debug(`${enabled ? 'Enabled' : 'Disabled'} alert rule: ${ruleId}`);
    
    return true;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts
      .filter(alert => !alert.acknowledged && !alert.resolvedAt)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get acknowledged alerts
   */
  getAcknowledgedAlerts(): Alert[] {
    return this.alerts
      .filter(alert => alert.acknowledged)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get resolved alerts
   */
  getResolvedAlerts(): Alert[] {
    return this.alerts
      .filter(alert => alert.resolvedAt)
      .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0));
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): Alert[] {
    return [...this.alerts].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string, metadata?: Record<string, any>): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    if (metadata) {
      alert.metadata = { ...alert.metadata, ...metadata };
    }

    logger.debug(`Acknowledged alert: ${alertId}`);
    return true;
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string, metadata?: Record<string, any>): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return false;

    alert.resolvedAt = Date.now();
    if (metadata) {
      alert.metadata = { ...alert.metadata, ...metadata };
    }

    logger.debug(`Resolved alert: ${alertId}`);
    return true;
  }

  /**
   * Subscribe to new alerts
   */
  subscribe(callback: (alert: Alert) => void): () => void {
    this.subscribers.add(callback);
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get alert statistics
   */
  getStats(): AlertStats {
    const totalAlerts = this.alerts.length;
    const recentAlerts = this.alerts.filter(
      alert => Date.now() - alert.timestamp < 3600000 // Last hour
    ).length;
    
    const alertsByLevel = this.alerts.reduce(
      (counts, alert) => {
        counts[alert.severity]++;
        return counts;
      },
      { info: 0, warning: 0, critical: 0 }
    );

    return {
      totalRules: this.rules.size,
      activeRules: Array.from(this.rules.values()).filter(r => r.enabled).length,
      totalAlerts,
      alertsByLevel,
      recentAlerts,
      acknowledgedAlerts: this.alerts.filter(a => a.acknowledged).length
    };
  }

  /**
   * Clear old alerts
   */
  clearOldAlerts(olderThanMs: number = 86400000): number { // 24 hours default
    const cutoff = Date.now() - olderThanMs;
    const initialCount = this.alerts.length;
    
    this.alerts = this.alerts.filter(alert => 
      alert.timestamp > cutoff || !alert.acknowledged
    );
    
    const clearedCount = initialCount - this.alerts.length;
    if (clearedCount > 0) {
      logger.debug(`Cleared ${clearedCount} old alerts`);
    }
    
    return clearedCount;
  }

  /**
   * Test alert rule against current metrics
   */
  testRule(ruleId: string): {
    triggered: boolean;
    metric?: MetricSnapshot;
    reason: string;
  } {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return { triggered: false, reason: 'Rule not found' };
    }

    if (!rule.enabled) {
      return { triggered: false, reason: 'Rule is disabled' };
    }

    const metric = performanceMetrics.getMetric(rule.metricName);
    if (!metric) {
      return { triggered: false, reason: 'Metric not found' };
    }

    const triggered = this.evaluateCondition(metric.current, rule.condition, rule.threshold);
    
    return {
      triggered,
      metric,
      reason: triggered 
        ? `Condition met: ${metric.current} ${rule.condition} ${rule.threshold}`
        : `Condition not met: ${metric.current} ${rule.condition} ${rule.threshold}`
    };
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultRules(): void {
    const defaultRules: Array<Omit<AlertRule, 'id'>> = [
      {
        name: 'High Memory Usage',
        description: 'Alert when memory usage exceeds threshold',
        metricName: 'system.memory.percentage',
        condition: 'greater_than',
        threshold: 85,
        severity: 'warning',
        enabled: true,
        cooldownPeriod: 300000, // 5 minutes
        actions: [
          {
            type: 'log',
            config: { level: 'warn' },
            enabled: true
          }
        ]
      },
      {
        name: 'Critical Memory Usage',
        description: 'Alert when memory usage is critically high',
        metricName: 'system.memory.percentage',
        condition: 'greater_than',
        threshold: 95,
        severity: 'critical',
        enabled: true,
        cooldownPeriod: 120000, // 2 minutes
        actions: [
          {
            type: 'log',
            config: { level: 'error' },
            enabled: true
          },
          {
            type: 'console',
            config: { message: 'Critical memory usage detected!' },
            enabled: true
          }
        ]
      },
      {
        name: 'Slow Action Performance',
        description: 'Alert when actions take too long to complete',
        metricName: 'agent.action.duration',
        condition: 'greater_than',
        threshold: 3000,
        severity: 'warning',
        enabled: true,
        cooldownPeriod: 600000, // 10 minutes
        actions: [
          {
            type: 'log',
            config: { level: 'warn' },
            enabled: true
          }
        ]
      },
      {
        name: 'High Error Rate',
        description: 'Alert when agent error rate is high',
        metricName: 'agent.actions.failed',
        condition: 'greater_than',
        threshold: 10,
        severity: 'warning',
        enabled: true,
        cooldownPeriod: 300000, // 5 minutes
        actions: [
          {
            type: 'log',
            config: { level: 'warn' },
            enabled: true
          }
        ]
      },
      {
        name: 'Low Cache Hit Rate',
        description: 'Alert when cache hit rate is too low',
        metricName: 'performance.dom.cache.hits',
        condition: 'less_than',
        threshold: 50,
        severity: 'info',
        enabled: true,
        cooldownPeriod: 900000, // 15 minutes
        actions: [
          {
            type: 'log',
            config: { level: 'info' },
            enabled: true
          }
        ]
      }
    ];

    for (const rule of defaultRules) {
      this.addRule(rule);
    }

    logger.debug(`Setup ${defaultRules.length} default alert rules`);
  }

  /**
   * Check all rules and trigger alerts
   */
  private checkAlerts(): void {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check cooldown
      const lastAlert = this.cooldowns.get(rule.id);
      if (lastAlert && Date.now() - lastAlert < rule.cooldownPeriod) {
        continue;
      }

      const testResult = this.testRule(rule.id);
      if (testResult.triggered && testResult.metric) {
        this.triggerAlert(rule, testResult.metric.current);
        this.cooldowns.set(rule.id, Date.now());
      }
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(rule: AlertRule, value: number): void {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      metricName: rule.metricName,
      value,
      threshold: rule.threshold,
      severity: rule.severity,
      message: this.generateAlertMessage(rule, value),
      timestamp: Date.now(),
      acknowledged: false,
      metadata: {
        description: rule.description,
        condition: rule.condition,
        tags: rule.tags
      }
    };

    this.alerts.push(alert);

    // Trim alerts if necessary
    const maxAlerts = this.options.maxAlerts || 1000;
    if (this.alerts.length > maxAlerts) {
      this.alerts = this.alerts
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, maxAlerts);
    }

    // Execute alert actions
    this.executeActions(rule.actions, alert);

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      try {
        subscriber(alert);
      } catch (error) {
        logger.warning('Alert subscriber error:', error);
      }
    }

    logger.info(`Triggered ${rule.severity} alert: ${rule.name} (${value})`);
  }

  /**
   * Execute alert actions
   */
  private executeActions(actions: AlertAction[], alert: Alert): void {
    for (const action of actions) {
      if (!action.enabled) continue;

      try {
        switch (action.type) {
          case 'log':
            this.executeLogAction(action, alert);
            break;
          case 'console':
            this.executeConsoleAction(action, alert);
            break;
          case 'notification':
            this.executeNotificationAction(action, alert);
            break;
          case 'webhook':
            this.executeWebhookAction(action, alert);
            break;
          case 'email':
            this.executeEmailAction(action, alert);
            break;
        }
      } catch (error) {
        logger.warning(`Failed to execute ${action.type} action:`, error);
      }
    }
  }

  /**
   * Execute log action
   */
  private executeLogAction(action: AlertAction, alert: Alert): void {
    const level = action.config.level || 'info';
    const message = `ALERT [${alert.severity.toUpperCase()}] ${alert.message}`;
    
    switch (level) {
      case 'error':
        logger.error(message);
        break;
      case 'warn':
        logger.warning(message);
        break;
      case 'info':
      default:
        logger.info(message);
        break;
    }
  }

  /**
   * Execute console action
   */
  private executeConsoleAction(action: AlertAction, alert: Alert): void {
    const message = action.config.message || alert.message;
    console.warn(`[Performance Alert] ${message}`);
  }

  /**
   * Execute notification action (placeholder)
   */
  private executeNotificationAction(action: AlertAction, alert: Alert): void {
    // Browser notification implementation would go here
    logger.debug('Notification action triggered:', alert.message);
  }

  /**
   * Execute webhook action (placeholder)
   */
  private executeWebhookAction(action: AlertAction, alert: Alert): void {
    // HTTP webhook implementation would go here
    logger.debug('Webhook action triggered:', alert.message);
  }

  /**
   * Execute email action (placeholder)
   */
  private executeEmailAction(action: AlertAction, alert: Alert): void {
    // Email notification implementation would go here
    logger.debug('Email action triggered:', alert.message);
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(value: number, condition: AlertRule['condition'], threshold: number): boolean {
    switch (condition) {
      case 'greater_than':
        return value > threshold;
      case 'less_than':
        return value < threshold;
      case 'equals':
        return Math.abs(value - threshold) < 0.001; // Floating point comparison
      case 'not_equals':
        return Math.abs(value - threshold) >= 0.001;
      default:
        return false;
    }
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(rule: AlertRule, value: number): string {
    const condition = rule.condition.replace('_', ' ');
    return `${rule.name}: ${rule.metricName} is ${value} (${condition} ${rule.threshold})`;
  }

  /**
   * Destroy alerting system
   */
  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.rules.clear();
    this.alerts = [];
    this.cooldowns.clear();
    this.subscribers.clear();
    
    logger.debug('Performance alerting system destroyed');
  }
}

// Global alerting instance
export const performanceAlerting = new PerformanceAlerting({
  checkInterval: 5000,
  maxAlerts: 1000,
  enableDefaultRules: true
});