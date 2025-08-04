import { workflowSystem } from './index';
import type { AgentContext } from '../types';
import { createLogger } from '../../log';

const logger = createLogger('WorkflowDemo');

/**
 * Workflow Engine Demo
 * Demonstrates workflow creation, execution, and monitoring capabilities
 */
export class WorkflowDemo {
  private context: AgentContext;
  private demoWorkflows: string[] = [];

  constructor(context: AgentContext) {
    this.context = context;
  }

  /**
   * Initialize and run comprehensive workflow demo
   */
  async runComprehensiveDemo(): Promise<void> {
    console.log('🚀 Workflow Engine Demo Started\n');

    try {
      // Initialize workflow system
      workflowSystem.initialize(this.context);
      console.log('✅ Workflow system initialized');

      // Show available templates
      this.showAvailableTemplates();

      // Demo 1: Login workflow
      await this.demoLoginWorkflow();

      // Demo 2: Data extraction workflow
      await this.demoDataExtractionWorkflow();

      // Demo 3: Form filling workflow
      await this.demoFormFillingWorkflow();

      // Demo 4: Custom workflow creation
      await this.demoCustomWorkflow();

      // Show system statistics
      this.showSystemStats();

      console.log('\n✅ Workflow Engine Demo Completed Successfully!');

    } catch (error) {
      console.error('❌ Demo failed:', error);
    }
  }

  /**
   * Show available workflow templates
   */
  private showAvailableTemplates(): void {
    console.log('\n📋 Available Workflow Templates:');
    
    const templates = workflowSystem.getAvailableTemplates();
    console.table(templates.map(t => ({
      ID: t.id,
      Name: t.name,
      Category: t.category,
      Description: t.description,
      Parameters: t.parameters.length
    })));
  }

  /**
   * Demo login workflow
   */
  private async demoLoginWorkflow(): Promise<void> {
    console.log('\n🔐 Demo: Login Workflow');
    
    try {
      // Create workflow from template
      const workflow = workflowSystem.createWorkflowFromTemplate('login_template', {
        loginUrl: 'https://example.com/login',
        username: 'demo@example.com',
        password: 'demo123',
        usernameSelector: 'input[name="email"]',
        passwordSelector: 'input[name="password"]',
        submitSelector: 'button[type="submit"]'
      });

      this.demoWorkflows.push(workflow.id);
      console.log(`✅ Created login workflow: ${workflow.id}`);
      
      // Show workflow details
      console.log('📝 Workflow Details:');
      console.log(`   Name: ${workflow.name}`);
      console.log(`   Steps: ${workflow.steps.length}`);
      console.log(`   Timeout: ${workflow.config.timeout}ms`);
      
      // Note: In a real demo, we would execute the workflow
      // For demo purposes, we'll simulate execution
      console.log('⚠️  Workflow execution simulated (would run against real website)');
      
    } catch (error) {
      console.error('❌ Failed to create login workflow:', error);
    }
  }

  /**
   * Demo data extraction workflow
   */
  private async demoDataExtractionWorkflow(): Promise<void> {
    console.log('\n📊 Demo: Data Extraction Workflow');
    
    try {
      const workflow = workflowSystem.createWorkflowFromTemplate('data_extraction_template', {
        targetUrl: 'https://example.com/products',
        dataSelectors: {
          title: '.product-title',
          price: '.price',
          rating: '.rating'
        },
        paginationSelector: '.next-page',
        maxPages: 5
      });

      this.demoWorkflows.push(workflow.id);
      console.log(`✅ Created data extraction workflow: ${workflow.id}`);
      
      console.log('📝 Extraction Configuration:');
      console.log('   Target: Product listings');
      console.log('   Max Pages: 5');
      console.log('   Data Fields: title, price, rating');
      
      console.log('⚠️  Workflow execution simulated (would extract real data)');
      
    } catch (error) {
      console.error('❌ Failed to create data extraction workflow:', error);
    }
  }

  /**
   * Demo form filling workflow
   */
  private async demoFormFillingWorkflow(): Promise<void> {
    console.log('\n📝 Demo: Form Filling Workflow');
    
    try {
      const workflow = workflowSystem.createWorkflowFromTemplate('form_filling_template', {
        formUrl: 'https://example.com/contact',
        formData: {
          name: 'John Doe',
          email: 'john@example.com',
          message: 'Hello from workflow demo!'
        },
        submitAfterFill: true
      });

      this.demoWorkflows.push(workflow.id);
      console.log(`✅ Created form filling workflow: ${workflow.id}`);
      
      console.log('📝 Form Data:');
      console.log('   Name: John Doe');
      console.log('   Email: john@example.com');
      console.log('   Message: Hello from workflow demo!');
      
      console.log('⚠️  Workflow execution simulated (would fill real form)');
      
    } catch (error) {
      console.error('❌ Failed to create form filling workflow:', error);
    }
  }

  /**
   * Demo custom workflow creation
   */
  private async demoCustomWorkflow(): Promise<void> {
    console.log('\n🔧 Demo: Custom Workflow Creation');
    
    try {
      const customWorkflow = {
        id: `custom_demo_${Date.now()}`,
        name: 'Demo Custom Workflow',
        description: 'A custom workflow created for demonstration',
        version: '1.0.0',
        steps: [
          {
            id: 'navigate_step',
            type: 'action' as const,
            name: 'Navigate to Demo Site',
            description: 'Open the demo website',
            config: {
              actionType: 'navigate' as const,
              actionData: { url: 'https://example.com' }
            },
            enabled: true,
            continueOnError: false,
            timeout: 10000
          },
          {
            id: 'wait_step',
            type: 'wait' as const,
            name: 'Wait for Page Load',
            description: 'Wait for the page to load completely',
            config: {
              waitType: 'network' as const,
              timeout: 5000
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'extract_step',
            type: 'action' as const,
            name: 'Extract Page Title',
            description: 'Extract the page title',
            config: {
              actionType: 'extract' as const,
              actionData: {
                selector: 'title',
                extractField: 'text'
              }
            },
            enabled: true,
            continueOnError: false
          }
        ],
        conditions: [],
        retryLogic: {
          maxAttempts: 3,
          delayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 5000,
          retryOn: 'error' as const
        },
        config: {
          parallel: false,
          stopOnError: true,
          timeout: 60000
        },
        metadata: {
          created: Date.now(),
          updated: Date.now(),
          author: 'demo',
          tags: ['demo', 'custom'],
          category: 'demo'
        }
      };

      workflowSystem.createCustomWorkflow(customWorkflow);
      this.demoWorkflows.push(customWorkflow.id);
      
      console.log(`✅ Created custom workflow: ${customWorkflow.id}`);
      console.log(`📝 Steps: ${customWorkflow.steps.length}`);
      console.log('   1. Navigate to Demo Site');
      console.log('   2. Wait for Page Load');
      console.log('   3. Extract Page Title');
      
    } catch (error) {
      console.error('❌ Failed to create custom workflow:', error);
    }
  }

  /**
   * Show system statistics
   */
  private showSystemStats(): void {
    console.log('\n📊 Workflow System Statistics:');
    
    const stats = workflowSystem.getStats();
    console.log(`   Total Workflows Created: ${this.demoWorkflows.length}`);
    console.log(`   Total Executions: ${stats.totalExecutions}`);
    console.log(`   Active Executions: ${stats.activeExecutions}`);
    console.log(`   Completed: ${stats.completedExecutions}`);
    console.log(`   Failed: ${stats.failedExecutions}`);
    console.log(`   Average Execution Time: ${Math.round(stats.averageExecutionTime)}ms`);
    
    // Show all created workflows
    console.log('\n📋 Created Demo Workflows:');
    this.demoWorkflows.forEach((workflowId, index) => {
      const workflow = workflowSystem.getWorkflow(workflowId);
      if (workflow) {
        console.log(`   ${index + 1}. ${workflow.name} (${workflowId})`);
      }
    });
  }

  /**
   * Clean up demo workflows
   */
  cleanup(): void {
    console.log('\n🧹 Cleaning up demo workflows...');
    
    let cleaned = 0;
    this.demoWorkflows.forEach(workflowId => {
      if (workflowSystem.deleteWorkflow(workflowId)) {
        cleaned++;
      }
    });
    
    console.log(`✅ Cleaned up ${cleaned} demo workflows`);
    this.demoWorkflows = [];
  }

  /**
   * Demonstrate workflow event handling
   */
  demoEventHandling(): void {
    console.log('\n📡 Demo: Workflow Event Handling');
    
    const removeEventListener = workflowSystem.addEventListener((event) => {
      console.log(`🔔 Workflow Event: ${event.type}`, {
        workflowId: event.workflowId,
        executionId: event.executionId,
        stepId: event.stepId,
        timestamp: new Date(event.timestamp).toISOString()
      });
    });
    
    console.log('✅ Event listener added (will capture all workflow events)');
    
    // Return cleanup function
    setTimeout(() => {
      removeEventListener();
      console.log('🔌 Event listener removed');
    }, 30000); // Remove after 30 seconds
  }

  /**
   * Show workflow templates by category
   */
  showTemplatesByCategory(): void {
    console.log('\n📂 Workflow Templates by Category:');
    
    const categories = ['authentication', 'data_entry', 'data_extraction', 'monitoring', 'testing', 'navigation'];
    
    categories.forEach(category => {
      const templates = workflowSystem.getTemplatesByCategory(category);
      if (templates.length > 0) {
        console.log(`\n   ${category.toUpperCase()}:`);
        templates.forEach(template => {
          console.log(`     - ${template.name}: ${template.description}`);
        });
      }
    });
  }
}

/**
 * Quick demo function for console access
 */
export async function runWorkflowDemo(context: AgentContext): Promise<void> {
  const demo = new WorkflowDemo(context);
  await demo.runComprehensiveDemo();
}

/**
 * Create demo instance (for console access)
 */
export function createWorkflowDemo(context: AgentContext): WorkflowDemo {
  return new WorkflowDemo(context);
}

// Usage examples (can be called from browser console):
// const demo = createWorkflowDemo(context);
// await demo.runComprehensiveDemo();
// demo.showTemplatesByCategory();
// demo.demoEventHandling();
// demo.cleanup();