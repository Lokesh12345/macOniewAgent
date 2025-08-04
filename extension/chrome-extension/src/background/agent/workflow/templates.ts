import type { SimpleWorkflow, WorkflowTemplate } from './types';

/**
 * Pre-built workflow templates for common automation tasks
 * These require minimal or no tokens since they use predefined logic
 */
export class WorkflowTemplates {
  
  /**
   * Get all available workflow templates
   */
  static getAllTemplates(): WorkflowTemplate[] {
    return [
      this.getLoginTemplate(),
      this.getFormFillingTemplate(),
      this.getDataExtractionTemplate(),
      this.getMonitoringTemplate(),
      this.getTestingTemplate(),
      this.getNavigationTemplate()
    ];
  }

  /**
   * Login workflow template
   */
  static getLoginTemplate(): WorkflowTemplate {
    return {
      id: 'login_template',
      name: 'Website Login',
      description: 'Automated login to websites with username/password',
      category: 'authentication',
      parameters: [
        { name: 'loginUrl', type: 'string', description: 'Login page URL', required: true },
        { name: 'username', type: 'string', description: 'Username or email', required: true },
        { name: 'password', type: 'string', description: 'Password', required: true },
        { name: 'usernameSelector', type: 'string', description: 'Username field selector', required: false, defaultValue: 'input[type="email"], input[name="username"], input[name="email"]' },
        { name: 'passwordSelector', type: 'string', description: 'Password field selector', required: false, defaultValue: 'input[type="password"]' },
        { name: 'submitSelector', type: 'string', description: 'Submit button selector', required: false, defaultValue: 'button[type="submit"], input[type="submit"]' }
      ],
      template: {
        name: 'Website Login',
        description: 'Automated login workflow',
        version: '1.0.0',
        steps: [
          {
            id: 'navigate_to_login',
            type: 'action',
            name: 'Navigate to Login Page',
            description: 'Open the login page',
            config: {
              actionType: 'navigate',
              actionData: { url: '{{loginUrl}}' }
            },
            enabled: true,
            continueOnError: false,
            timeout: 30000
          },
          {
            id: 'wait_for_page_load',
            type: 'wait',
            name: 'Wait for Page Load',
            description: 'Wait for the login page to fully load',
            config: {
              waitType: 'network',
              timeout: 10000
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'enter_username',
            type: 'action',
            name: 'Enter Username',
            description: 'Fill in the username field',
            config: {
              actionType: 'input',
              actionData: {
                selector: '{{usernameSelector}}',
                text: '{{username}}'
              }
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'enter_password',
            type: 'action',
            name: 'Enter Password',
            description: 'Fill in the password field',
            config: {
              actionType: 'input',
              actionData: {
                selector: '{{passwordSelector}}',
                text: '{{password}}'
              }
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'submit_login',
            type: 'action',
            name: 'Submit Login',
            description: 'Click the login button',
            config: {
              actionType: 'click',
              actionData: {
                selector: '{{submitSelector}}'
              }
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'wait_for_login_result',
            type: 'wait',
            name: 'Wait for Login Result',
            description: 'Wait for login to complete',
            config: {
              waitType: 'time',
              duration: 3000
            },
            enabled: true,
            continueOnError: false
          }
        ],
        conditions: [
          {
            id: 'check_login_success',
            if: '{{currentUrl}}.includes("dashboard") || {{currentUrl}}.includes("home")',
            then: 'login_success',
            else: 'login_failed',
            priority: 1
          }
        ],
        retryLogic: {
          maxAttempts: 3,
          delayMs: 2000,
          backoffMultiplier: 1.5,
          maxDelayMs: 10000,
          retryOn: 'error'
        },
        config: {
          parallel: false,
          stopOnError: true,
          timeout: 60000
        }
      }
    };
  }

  /**
   * Form filling template
   */
  static getFormFillingTemplate(): WorkflowTemplate {
    return {
      id: 'form_filling_template',
      name: 'Form Filling',
      description: 'Automated form filling with validation',
      category: 'data_entry',
      parameters: [
        { name: 'formUrl', type: 'string', description: 'Form page URL', required: true },
        { name: 'formData', type: 'object', description: 'Form field data', required: true },
        { name: 'submitAfterFill', type: 'boolean', description: 'Submit form after filling', required: false, defaultValue: true }
      ],
      template: {
        name: 'Form Filling',
        description: 'Automated form filling workflow',
        version: '1.0.0',
        steps: [
          {
            id: 'navigate_to_form',
            type: 'action',
            name: 'Navigate to Form',
            config: {
              actionType: 'navigate',
              actionData: { url: '{{formUrl}}' }
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'wait_for_form',
            type: 'wait',
            name: 'Wait for Form',
            config: {
              waitType: 'element',
              selector: 'form',
              timeout: 10000
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'fill_form_fields',
            type: 'loop',
            name: 'Fill Form Fields',
            config: {
              loopType: 'foreach',
              items: '{{formData}}',
              loopSteps: ['fill_field']
            },
            enabled: true,
            continueOnError: true
          },
          {
            id: 'submit_form',
            type: 'condition',
            name: 'Submit Form',
            config: {
              condition: '{{submitAfterFill}}',
              operator: 'equals',
              value: true,
              thenStep: 'click_submit'
            },
            enabled: true,
            continueOnError: false
          }
        ],
        conditions: [],
        retryLogic: {
          maxAttempts: 2,
          delayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 5000,
          retryOn: 'error'
        },
        config: {
          parallel: false,
          stopOnError: false,
          timeout: 120000
        }
      }
    };
  }

  /**
   * Data extraction template
   */
  static getDataExtractionTemplate(): WorkflowTemplate {
    return {
      id: 'data_extraction_template',
      name: 'Data Extraction',
      description: 'Extract data from web pages with pagination support',
      category: 'data_extraction',
      parameters: [
        { name: 'targetUrl', type: 'string', description: 'URL to extract data from', required: true },
        { name: 'dataSelectors', type: 'object', description: 'CSS selectors for data fields', required: true },
        { name: 'paginationSelector', type: 'string', description: 'Next page button selector', required: false },
        { name: 'maxPages', type: 'number', description: 'Maximum pages to extract', required: false, defaultValue: 10 }
      ],
      template: {
        name: 'Data Extraction',
        description: 'Extract structured data from web pages',
        version: '1.0.0',
        steps: [
          {
            id: 'navigate_to_target',
            type: 'action',
            name: 'Navigate to Target Page',
            config: {
              actionType: 'navigate',
              actionData: { url: '{{targetUrl}}' }
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'init_page_counter',
            type: 'variable',
            name: 'Initialize Page Counter',
            config: {
              operation: 'set',
              variableName: 'currentPage',
              value: 1,
              scope: 'workflow'
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'extract_page_data',
            type: 'loop',
            name: 'Extract Data from Pages',
            config: {
              loopType: 'while',
              condition: '{{currentPage}} <= {{maxPages}}',
              maxIterations: '{{maxPages}}',
              loopSteps: ['extract_current_page', 'check_next_page']
            },
            enabled: true,
            continueOnError: true
          },
          {
            id: 'compile_results',
            type: 'variable',
            name: 'Compile Results',
            config: {
              operation: 'get',
              variableName: 'extractedData',
              scope: 'workflow'
            },
            enabled: true,
            continueOnError: false
          }
        ],
        conditions: [],
        retryLogic: {
          maxAttempts: 3,
          delayMs: 2000,
          backoffMultiplier: 1.5,
          maxDelayMs: 8000,
          retryOn: 'error'
        },
        config: {
          parallel: false,
          stopOnError: false,
          timeout: 300000
        }
      }
    };
  }

  /**
   * Website monitoring template
   */
  static getMonitoringTemplate(): WorkflowTemplate {
    return {
      id: 'monitoring_template',
      name: 'Website Monitoring',
      description: 'Monitor website changes and availability',
      category: 'monitoring',
      parameters: [
        { name: 'monitorUrl', type: 'string', description: 'URL to monitor', required: true },
        { name: 'checkInterval', type: 'number', description: 'Check interval in minutes', required: false, defaultValue: 30 },
        { name: 'alertSelector', type: 'string', description: 'Element to monitor for changes', required: false },
        { name: 'expectedText', type: 'string', description: 'Expected text content', required: false }
      ],
      template: {
        name: 'Website Monitoring',
        description: 'Monitor website for changes and availability',
        version: '1.0.0',
        steps: [
          {
            id: 'check_website',
            type: 'action',
            name: 'Check Website',
            config: {
              actionType: 'navigate',
              actionData: { url: '{{monitorUrl}}' }
            },
            enabled: true,
            continueOnError: true
          },
          {
            id: 'record_timestamp',
            type: 'variable',
            name: 'Record Check Time',
            config: {
              operation: 'set',
              variableName: 'lastCheck',
              expression: 'Date.now()',
              scope: 'global'
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'extract_content',
            type: 'action',
            name: 'Extract Content',
            config: {
              actionType: 'extract',
              actionData: {
                selector: '{{alertSelector}}',
                extractField: 'text'
              }
            },
            enabled: true,
            continueOnError: true
          },
          {
            id: 'compare_content',
            type: 'condition',
            name: 'Compare Content',
            config: {
              condition: '{{extractedText}}',
              operator: 'contains',
              value: '{{expectedText}}',
              thenStep: 'content_ok',
              elseStep: 'content_changed'
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'wait_next_check',
            type: 'wait',
            name: 'Wait for Next Check',
            config: {
              waitType: 'time',
              duration: '{{checkInterval}} * 60 * 1000'
            },
            enabled: true,
            continueOnError: false
          }
        ],
        conditions: [],
        retryLogic: {
          maxAttempts: 3,
          delayMs: 5000,
          backoffMultiplier: 2,
          maxDelayMs: 30000,
          retryOn: 'error'
        },
        config: {
          parallel: false,
          stopOnError: false,
          timeout: 600000
        }
      }
    };
  }

  /**
   * Testing workflow template
   */
  static getTestingTemplate(): WorkflowTemplate {
    return {
      id: 'testing_template',
      name: 'UI Testing',
      description: 'Automated UI testing with assertions',
      category: 'testing',
      parameters: [
        { name: 'testUrl', type: 'string', description: 'URL to test', required: true },
        { name: 'testSteps', type: 'array', description: 'Test steps to execute', required: true },
        { name: 'assertions', type: 'array', description: 'Assertions to validate', required: true }
      ],
      template: {
        name: 'UI Testing',
        description: 'Automated user interface testing',
        version: '1.0.0',
        steps: [
          {
            id: 'setup_test',
            type: 'action',
            name: 'Setup Test Environment',
            config: {
              actionType: 'navigate',
              actionData: { url: '{{testUrl}}' }
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'run_test_steps',
            type: 'loop',
            name: 'Execute Test Steps',
            config: {
              loopType: 'foreach',
              items: '{{testSteps}}',
              loopSteps: ['execute_test_step']
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'validate_results',
            type: 'loop',
            name: 'Validate Results',
            config: {
              loopType: 'foreach',
              items: '{{assertions}}',
              loopSteps: ['check_assertion']
            },
            enabled: true,
            continueOnError: true
          },
          {
            id: 'generate_report',
            type: 'variable',
            name: 'Generate Test Report',
            config: {
              operation: 'set',
              variableName: 'testReport',
              expression: 'JSON.stringify({passed: {{passedTests}}, failed: {{failedTests}}, total: {{totalTests}}})',
              scope: 'workflow'
            },
            enabled: true,
            continueOnError: false
          }
        ],
        conditions: [],
        retryLogic: {
          maxAttempts: 1,
          delayMs: 1000,
          backoffMultiplier: 1,
          maxDelayMs: 1000,
          retryOn: 'error'
        },
        config: {
          parallel: false,
          stopOnError: false,
          timeout: 180000
        }
      }
    };
  }

  /**
   * Navigation workflow template
   */
  static getNavigationTemplate(): WorkflowTemplate {
    return {
      id: 'navigation_template',
      name: 'Multi-Step Navigation',
      description: 'Navigate through multiple pages with data collection',
      category: 'navigation',
      parameters: [
        { name: 'startUrl', type: 'string', description: 'Starting URL', required: true },
        { name: 'navigationSteps', type: 'array', description: 'Navigation steps', required: true },
        { name: 'collectData', type: 'boolean', description: 'Collect data during navigation', required: false, defaultValue: false }
      ],
      template: {
        name: 'Multi-Step Navigation',
        description: 'Navigate through multiple pages systematically',
        version: '1.0.0',
        steps: [
          {
            id: 'start_navigation',
            type: 'action',
            name: 'Start Navigation',
            config: {
              actionType: 'navigate',
              actionData: { url: '{{startUrl}}' }
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'init_navigation_data',
            type: 'variable',
            name: 'Initialize Navigation Data',
            config: {
              operation: 'set',
              variableName: 'navigationData',
              value: [],
              scope: 'workflow'
            },
            enabled: true,
            continueOnError: false
          },
          {
            id: 'execute_navigation',
            type: 'loop',
            name: 'Execute Navigation Steps',
            config: {
              loopType: 'foreach',
              items: '{{navigationSteps}}',
              loopSteps: ['navigate_to_step', 'collect_step_data']
            },
            enabled: true,
            continueOnError: true
          },
          {
            id: 'finalize_navigation',
            type: 'variable',
            name: 'Finalize Navigation',
            config: {
              operation: 'get',
              variableName: 'navigationData',
              scope: 'workflow'
            },
            enabled: true,
            continueOnError: false
          }
        ],
        conditions: [
          {
            id: 'data_collection_check',
            if: '{{collectData}} === true',
            then: 'collect_step_data',
            priority: 1
          }
        ],
        retryLogic: {
          maxAttempts: 2,
          delayMs: 3000,
          backoffMultiplier: 1.5,
          maxDelayMs: 10000,
          retryOn: 'error'
        },
        config: {
          parallel: false,
          stopOnError: false,
          timeout: 240000
        }
      }
    };
  }

  /**
   * Create workflow from template
   */
  static createWorkflowFromTemplate(
    template: WorkflowTemplate, 
    parameters: Record<string, any>
  ): SimpleWorkflow {
    // Validate required parameters
    for (const param of template.parameters) {
      if (param.required && !(param.name in parameters)) {
        throw new Error(`Required parameter '${param.name}' is missing`);
      }
    }

    // Set default values for missing optional parameters
    const fullParameters = { ...parameters };
    for (const param of template.parameters) {
      if (!param.required && !(param.name in fullParameters) && param.defaultValue !== undefined) {
        fullParameters[param.name] = param.defaultValue;
      }
    }

    // Create workflow from template
    const workflow: SimpleWorkflow = {
      ...template.template,
      id: `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        created: Date.now(),
        updated: Date.now(),
        author: 'system',
        tags: [template.category],
        category: template.category
      }
    };

    // Substitute parameters in workflow
    const workflowJson = JSON.stringify(workflow);
    const substitutedJson = workflowJson.replace(/\{\{(\w+)\}\}/g, (match, paramName) => {
      if (paramName in fullParameters) {
        return JSON.stringify(fullParameters[paramName]);
      }
      return match;
    });

    return JSON.parse(substitutedJson);
  }

  /**
   * Get template by ID
   */
  static getTemplate(templateId: string): WorkflowTemplate | null {
    const templates = this.getAllTemplates();
    return templates.find(t => t.id === templateId) || null;
  }

  /**
   * Get templates by category
   */
  static getTemplatesByCategory(category: string): WorkflowTemplate[] {
    return this.getAllTemplates().filter(t => t.category === category);
  }
}