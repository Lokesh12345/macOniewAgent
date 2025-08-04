import { performanceMonitoring } from './index';

/**
 * Demo script to showcase Performance Monitoring capabilities
 * This can be used to test and demonstrate the monitoring system
 */
export class MonitoringDemo {
  private demoInterval?: NodeJS.Timeout;

  /**
   * Start the monitoring demo
   */
  start(): void {
    console.log('🚀 Performance Monitoring Demo Started');
    
    // Simulate some metrics
    this.simulateMetrics();
    
    // Set up demo dashboard
    this.setupDemoDashboard();
    
    // Set up demo alerts
    this.setupDemoAlerts();
    
    // Show initial stats
    this.showStats();
    
    // Start periodic demo updates
    this.demoInterval = setInterval(() => {
      this.simulateActivity();
    }, 5000);
  }

  /**
   * Stop the demo
   */
  stop(): void {
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = undefined;
    }
    console.log('🛑 Performance Monitoring Demo Stopped');
  }

  /**
   * Simulate some initial metrics
   */
  private simulateMetrics(): void {
    console.log('📊 Simulating initial metrics...');
    
    // Browser metrics
    performanceMonitoring.recordMetric('browser.tabs.opened', 3, 'counter');
    performanceMonitoring.recordMetric('browser.active.tabs', 3, 'gauge');
    performanceMonitoring.recordMetric('browser.page.load', 1200, 'timer');
    
    // Agent metrics
    performanceMonitoring.recordMetric('agent.actions.executed', 15, 'counter');
    performanceMonitoring.recordMetric('agent.actions.succeeded', 14, 'counter');
    performanceMonitoring.recordMetric('agent.actions.failed', 1, 'counter');
    
    // Performance metrics
    performanceMonitoring.recordMetric('performance.dom.cache.hits', 8, 'counter');
    performanceMonitoring.recordMetric('performance.dom.cache.misses', 2, 'counter');
    performanceMonitoring.recordMetric('performance.connections.created', 2, 'counter');
    performanceMonitoring.recordMetric('performance.connections.reused', 6, 'counter');
    
    // System metrics (simulated)
    performanceMonitoring.recordMetric('system.memory.percentage', 65, 'gauge');
    performanceMonitoring.recordMetric('system.cpu.usage', 25, 'gauge');
  }

  /**
   * Set up demo dashboard
   */
  private setupDemoDashboard(): void {
    console.log('📋 Setting up demo dashboard...');
    
    const dashboardId = performanceMonitoring.createDashboard(
      'Demo Dashboard',
      'Demonstration of performance monitoring capabilities',
      [
        {
          id: 'demo_metrics',
          title: 'Demo Metrics Overview',
          type: 'table',
          config: {
            category: 'demo',
            refreshRate: 2000
          }
        }
      ]
    );
    
    console.log(`📋 Demo dashboard created with ID: ${dashboardId}`);
  }

  /**
   * Set up demo alerts
   */
  private setupDemoAlerts(): void {
    console.log('🚨 Setting up demo alerts...');
    
    // High memory usage alert
    const alertId = performanceMonitoring.addAlertRule({
      name: 'Demo High Memory Alert',
      description: 'Demonstrates memory usage alerting',
      metricName: 'system.memory.percentage',
      condition: 'greater_than',
      threshold: 80,
      severity: 'warning',
      enabled: true,
      cooldownPeriod: 60000, // 1 minute
      actions: [
        {
          type: 'console',
          config: { message: 'Demo: High memory usage detected!' },
          enabled: true
        }
      ]
    });
    
    console.log(`🚨 Demo alert rule created with ID: ${alertId}`);
  }

  /**
   * Show current monitoring stats
   */
  showStats(): void {
    const stats = performanceMonitoring.getStats();
    const health = performanceMonitoring.getHealth();
    
    console.log('📈 Current Monitoring Stats:');
    console.log('  Uptime:', Math.round(stats.uptime / 1000), 'seconds');
    console.log('  Total Metrics:', stats.metrics.total);
    console.log('  Total Data Points:', stats.metrics.dataPoints);
    console.log('  Active Alerts:', stats.alerts.active);
    console.log('  System Health:', health.healthy ? '✅ Healthy' : '⚠️ Issues detected');
    
    if (health.issues.length > 0) {
      console.log('  Issues:', health.issues);
    }
    
    if (health.recommendations.length > 0) {
      console.log('  Recommendations:', health.recommendations);
    }
  }

  /**
   * Show sample metrics
   */
  showMetrics(): void {
    const metrics = performanceMonitoring.getAllMetrics();
    
    console.log('📊 Sample Metrics:');
    console.table(
      metrics.slice(0, 10).map(m => ({
        Name: m.name,
        Type: m.type,
        Current: m.current,
        Average: Math.round(m.average * 100) / 100,
        Count: m.count,
        Unit: m.unit
      }))
    );
  }

  /**
   * Show dashboard data
   */
  showDashboard(): void {
    const dashboardData = performanceMonitoring.getDashboardData('overview');
    
    if (dashboardData) {
      console.log('📋 Dashboard Data:');
      console.log('  Layout:', dashboardData.layout.name);
      console.log('  Widgets:', dashboardData.widgets.length);
      console.log('  System Status:', dashboardData.systemStatus.overall);
      console.log('  Active Alerts:', dashboardData.alerts.length);
    }
  }

  /**
   * Show active alerts
   */
  showAlerts(): void {
    const alerts = performanceMonitoring.getActiveAlerts();
    
    console.log('🚨 Active Alerts:');
    if (alerts.length === 0) {
      console.log('  No active alerts');
    } else {
      alerts.forEach(alert => {
        console.log(`  [${alert.level.toUpperCase()}] ${alert.message}`);
      });
    }
  }

  /**
   * Generate and show monitoring report
   */
  showReport(): void {
    const report = performanceMonitoring.generateReport({
      timeRange: 60,
      includeMetrics: true,
      includeAlerts: true,
      includeRecommendations: true
    });
    
    console.log('📊 Performance Report:');
    console.log('  Time Range:', report.timeRange, 'minutes');
    console.log('  System Health:', report.summary.health);
    console.log('  Total Metrics:', report.summary.totalMetrics);
    console.log('  Active Alerts:', report.summary.activeAlerts);
    console.log('  Performance:');
    console.log('    - Avg Response Time:', Math.round(report.performance.avgResponseTime), 'ms');
    console.log('    - Error Rate:', report.performance.errorRate, '%');
    console.log('    - Cache Hit Rate:', report.performance.cacheHitRate, '%');
    console.log('    - Throughput:', report.performance.throughput, 'actions');
    
    if (report.recommendations && report.recommendations.length > 0) {
      console.log('  Recommendations:');
      report.recommendations.forEach(rec => console.log(`    - ${rec}`));
    }
  }

  /**
   * Demonstrate function instrumentation
   */
  demonstrateInstrumentation(): void {
    console.log('🔧 Demonstrating function instrumentation...');
    
    // Create an instrumented function
    const slowFunction = performanceMonitoring.instrument(
      'demo.slow_function',
      async (duration: number) => {
        await new Promise(resolve => setTimeout(resolve, duration));
        return `Completed in ${duration}ms`;
      },
      {
        recordCalls: true,
        recordDuration: true,
        recordErrors: true,
        tags: { type: 'demo' }
      }
    );
    
    // Execute the instrumented function
    slowFunction(100).then(result => {
      console.log('📊 Instrumented function result:', result);
      
      // Show the recorded metrics
      const metric = performanceMonitoring.getMetric('demo.slow_function.duration');
      if (metric) {
        console.log('⏱️ Function timing:', metric.current, 'ms');
      }
    });
  }

  /**
   * Simulate ongoing activity
   */
  private simulateActivity(): void {
    // Simulate random metrics updates
    const actions = Math.floor(Math.random() * 5) + 1;
    const errors = Math.random() > 0.8 ? 1 : 0;
    const memory = 60 + Math.random() * 30; // 60-90%
    
    performanceMonitoring.recordMetric('agent.actions.executed', actions, 'counter');
    if (errors > 0) {
      performanceMonitoring.recordMetric('agent.actions.failed', errors, 'counter');
    }
    performanceMonitoring.recordMetric('system.memory.percentage', memory, 'gauge');
    
    // Occasionally trigger an alert
    if (memory > 85) {
      console.log('⚠️ Demo: High memory usage simulated!');
    }
  }

  /**
   * Run a comprehensive demo
   */
  runComprehensiveDemo(): void {
    console.log('🎯 Running comprehensive monitoring demo...\n');
    
    this.start();
    
    setTimeout(() => {
      this.showStats();
      console.log('\n');
    }, 1000);
    
    setTimeout(() => {
      this.showMetrics();
      console.log('\n');
    }, 2000);
    
    setTimeout(() => {
      this.showDashboard();
      console.log('\n');
    }, 3000);
    
    setTimeout(() => {
      this.showAlerts();
      console.log('\n');
    }, 4000);
    
    setTimeout(() => {
      this.demonstrateInstrumentation();
      console.log('\n');
    }, 5000);
    
    setTimeout(() => {
      this.showReport();
      console.log('\n');
    }, 6000);
    
    setTimeout(() => {
      this.stop();
      console.log('✅ Comprehensive demo completed!');
    }, 10000);
  }
}

// Create demo instance
export const monitoringDemo = new MonitoringDemo();

// Usage examples (can be called from browser console):
// monitoringDemo.runComprehensiveDemo()
// monitoringDemo.showStats()
// monitoringDemo.showMetrics()
// monitoringDemo.showReport()