import { NavigatorAgent, NavigatorActionRegistry } from './navigator';
import { AdaptiveNavigatorAgent } from './adaptiveNavigator';
import { LearningNavigator } from './learningNavigator';
import { BaseAgentOptions, ExtraAgentOptions } from './base';
import { createLogger } from '@src/background/log';

const logger = createLogger('NavigatorFactory');

export enum NavigatorMode {
  LEGACY = 'legacy',
  ADAPTIVE = 'adaptive',
  LEARNING = 'learning'
}

export class NavigatorFactory {
  /**
   * Create a navigator agent based on the specified mode
   */
  static create(
    actionRegistry: NavigatorActionRegistry,
    options: BaseAgentOptions,
    extraOptions?: Partial<ExtraAgentOptions>,
    mode: NavigatorMode = NavigatorMode.ADAPTIVE
  ): NavigatorAgent {
    logger.info(`Creating navigator with mode: ${mode}`);

    switch (mode) {
      case NavigatorMode.LEGACY:
        logger.info('Using legacy Navigator (batch processing)');
        return new NavigatorAgent(actionRegistry, options, extraOptions);
      
      case NavigatorMode.ADAPTIVE:
        logger.info('Using Adaptive Navigator (dynamic content handling)');
        return new AdaptiveNavigatorAgent(actionRegistry, options, extraOptions);
        
      case NavigatorMode.LEARNING:
        logger.info('Using Learning Navigator (AI-powered pattern learning)');
        return new LearningNavigator(actionRegistry, options, extraOptions);
      
      default:
        logger.warning(`Unknown navigator mode: ${mode}, defaulting to legacy`);
        return new NavigatorAgent(actionRegistry, options, extraOptions);
    }
  }

  /**
   * Determine the best navigator mode based on the task and environment
   */
  static determineMode(task: string, url?: string): NavigatorMode {
    logger.info('Determining navigator mode for intelligent obstruction handling');
    
    // Use adaptive mode for dynamic sites that commonly have obstructions
    if (url) {
      const urlLower = url.toLowerCase();
      const dynamicSites = [
        'gmail.com', 'outlook.com', 'calendar.google.com',
        'facebook.com', 'twitter.com', 'linkedin.com',
        'forms.google.com', 'checkout', 'cart', 'payment'
      ];
      
      if (dynamicSites.some(site => urlLower.includes(site))) {
        logger.info(`Using ADAPTIVE navigator for dynamic site: ${url}`);
        return NavigatorMode.ADAPTIVE;
      }
    }
    
    // Check task complexity
    const taskLower = task.toLowerCase();
    const complexTasks = [
      'compose', 'send', 'fill', 'form', 'submit', 'checkout', 
      'login', 'signup', 'search', 'select', 'choose'
    ];
    
    if (complexTasks.some(keyword => taskLower.includes(keyword))) {
      logger.info(`Using ADAPTIVE navigator for complex task: ${task}`);
      return NavigatorMode.ADAPTIVE;
    }
    
    // Default to adaptive mode - our system is now production ready
    logger.info('Using ADAPTIVE navigator (default for intelligent obstruction handling)');
    return NavigatorMode.ADAPTIVE;
  }
}