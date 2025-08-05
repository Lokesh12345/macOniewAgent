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
        logger.warn(`Unknown navigator mode: ${mode}, defaulting to legacy`);
        return new NavigatorAgent(actionRegistry, options, extraOptions);
    }
  }

  /**
   * Determine the best navigator mode based on the task and environment
   */
  static determineMode(task: string, url?: string): NavigatorMode {
    // For now, always use legacy until adaptive is fully tested
    logger.info('Using legacy navigator for stability');
    return NavigatorMode.LEGACY;
  }
}