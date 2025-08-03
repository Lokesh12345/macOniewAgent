import { BaseAgent, type BaseAgentOptions, type ExtraAgentOptions } from './base';
import { createLogger } from '@src/background/log';
import { z } from 'zod';
import type { AgentOutput } from '../types';
import { HumanMessage } from '@langchain/core/messages';
import { Actors, ExecutionState } from '../event/types';
import {
  ChatModelAuthError,
  ChatModelForbiddenError,
  isAbortedError,
  isAuthenticationError,
  isForbiddenError,
  LLM_FORBIDDEN_ERROR_MESSAGE,
  RequestCancelledError,
} from './errors';
const logger = createLogger('PlannerAgent');

// Define Zod schema for planner output
export const plannerOutputSchema = z.object({
  observation: z.string(),
  challenges: z.string(),
  done: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
      throw new Error('Invalid boolean string');
    }),
  ]),
  next_steps: z.string(),
  reasoning: z.string(),
  web_task: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
      throw new Error('Invalid boolean string');
    }),
  ]),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export class PlannerAgent extends BaseAgent<typeof plannerOutputSchema, PlannerOutput> {
  constructor(options: BaseAgentOptions, extraOptions?: Partial<ExtraAgentOptions>) {
    super(plannerOutputSchema, options, { ...extraOptions, id: 'planner' });
  }

  async execute(): Promise<AgentOutput<PlannerOutput>> {
    logger.info('🧠 PLANNER EXECUTE START');
    logger.info(`🔍 Planner ID: ${this.id}`);
    
    try {
      logger.info('📡 Emitting PLANNER STEP_START event...');
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_START, 'Planning...');
      
      // get all messages from the message manager, state message should be the last one
      logger.info('📝 Getting messages from message manager...');
      const messages = this.context.messageManager.getMessages();
      logger.info(`📊 Total messages: ${messages.length}`);
      
      // Use full message history except the first one
      logger.info('🧠 Building planner message history...');
      const plannerMessages = [this.prompt.getSystemMessage(), ...messages.slice(1)];
      logger.info(`📝 Planner messages count: ${plannerMessages.length}`);

      // Remove images from last message if vision is not enabled for planner but vision is enabled
      const visionSettings = `useVisionForPlanner=${this.context.options.useVisionForPlanner}, useVision=${this.context.options.useVision}`;
      logger.info(`👁️ Vision settings: ${visionSettings}`);
      
      if (!this.context.options.useVisionForPlanner && this.context.options.useVision) {
        logger.info('📷 Removing images from planner messages (vision disabled for planner)...');
        const lastStateMessage = plannerMessages[plannerMessages.length - 1];
        let newMsg = '';

        if (Array.isArray(lastStateMessage.content)) {
          let textParts = 0;
          let imageParts = 0;
          for (const msg of lastStateMessage.content) {
            if (msg.type === 'text') {
              newMsg += msg.text;
              textParts++;
            } else {
              imageParts++;
            }
            // Skip image_url messages
          }
          logger.info(`📝 Message content: ${textParts} text parts, ${imageParts} image parts (removed)`);
        } else {
          newMsg = lastStateMessage.content;
          logger.info('📝 Message is plain text (no images to remove)');
        }

        plannerMessages[plannerMessages.length - 1] = new HumanMessage(newMsg);
      } else {
        logger.info('👁️ Vision enabled for planner - keeping all message content');
      }

      logger.info('🤖 CALLING PLANNER LLM MODEL...');
      const plannerStartTime = Date.now();
      const modelOutput = await this.invoke(plannerMessages);
      const plannerDuration = Date.now() - plannerStartTime;
      logger.info(`🤖 PLANNER LLM RESPONSE RECEIVED in ${plannerDuration}ms`);
      
      if (!modelOutput) {
        logger.error('❌ Failed to validate planner output');
        throw new Error('Failed to validate planner output');
      }
      
      logger.info('✅ Planner execution successful');
      logger.info(`📋 Plan observation: ${modelOutput.observation || 'None'}`);
      logger.info(`🎯 Plan reasoning: ${modelOutput.reasoning || 'None'}`);
      logger.info(`🌐 Web task: ${modelOutput.web_task || 'None'}`);
      logger.info(`✅ Task done: ${modelOutput.done ? 'Yes' : 'No'}`);
      logger.info(`📅 Next steps: ${modelOutput.next_steps || 'None'}`);
      
      logger.info('📡 Emitting PLANNER STEP_OK event...');
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_OK, modelOutput.next_steps);
      logger.info('Planner complete output', JSON.stringify(modelOutput, null, 2));

      logger.info('🧠 PLANNER EXECUTE END - SUCCESS');
      return {
        id: this.id,
        result: modelOutput,
      };
    } catch (error) {
      // Check if this is an authentication error
      if (isAuthenticationError(error)) {
        throw new ChatModelAuthError('Planner API Authentication failed. Please verify your API key', error);
      }
      if (isForbiddenError(error)) {
        throw new ChatModelForbiddenError(LLM_FORBIDDEN_ERROR_MESSAGE, error);
      }
      if (isAbortedError(error)) {
        throw new RequestCancelledError((error as Error).message);
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Planning failed: ${errorMessage}`);
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_FAIL, `Planning failed: ${errorMessage}`);
      return {
        id: this.id,
        error: errorMessage,
      };
    }
  }
}
