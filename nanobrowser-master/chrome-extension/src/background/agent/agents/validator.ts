import { BaseAgent, type BaseAgentOptions, type ExtraAgentOptions } from './base';
import { createLogger } from '@src/background/log';
import { z } from 'zod';
import { ActionResult, type AgentOutput } from '../types';
import { Actors, ExecutionState } from '../event/types';
import { HumanMessage } from '@langchain/core/messages';
import {
  ChatModelAuthError,
  ChatModelForbiddenError,
  isAbortedError,
  isAuthenticationError,
  isForbiddenError,
  LLM_FORBIDDEN_ERROR_MESSAGE,
  RequestCancelledError,
} from './errors';
const logger = createLogger('ValidatorAgent');

// Define Zod schema for validator output
export const validatorOutputSchema = z.object({
  is_valid: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
      throw new Error('Invalid boolean string');
    }),
  ]), // indicates if the output is correct
  reason: z.string(), // explains why it is valid or not
  answer: z.string(), // the final answer to the task if it is valid
});

export type ValidatorOutput = z.infer<typeof validatorOutputSchema>;

export class ValidatorAgent extends BaseAgent<typeof validatorOutputSchema, ValidatorOutput> {
  // sometimes we need to validate the output against both the current browser state and the plan
  private plan: string | null = null;
  constructor(options: BaseAgentOptions, extraOptions?: Partial<ExtraAgentOptions>) {
    super(validatorOutputSchema, options, { ...extraOptions, id: 'validator' });
  }

  /**
   * Set the plan for the validator agent
   * @param plan - The plan to set
   */
  setPlan(plan: string | null): void {
    this.plan = plan;
  }

  /**
   * Executes the validator agent
   * @returns AgentOutput<ValidatorOutput>
   */
  async execute(): Promise<AgentOutput<ValidatorOutput>> {
    logger.info('🕵️ VALIDATOR EXECUTE START');
    logger.info(`🔍 Validator ID: ${this.id}`);
    
    try {
      logger.info('📡 Emitting VALIDATOR STEP_START event...');
      this.context.emitEvent(Actors.VALIDATOR, ExecutionState.STEP_START, 'Validating...');

      logger.info('🌍 Getting current state message...');
      let stateMessage = await this.prompt.getUserMessage(this.context);
      
      if (this.plan) {
        logger.info('📋 Adding plan to validation context...');
        logger.info(`📅 Plan: ${this.plan}`);
        // merge the plan and the state message
        const mergedMessage = new HumanMessage(`${stateMessage.content}\n\nThe current plan is: \n${this.plan}`);
        stateMessage = mergedMessage;
      } else {
        logger.info('📝 No plan provided - validating without plan context');
      }

      logger.info('📄 Building validator input messages...');
      const systemMessage = this.prompt.getSystemMessage();
      const inputMessages = [systemMessage, stateMessage];
      logger.info(`📝 Validator input messages: ${inputMessages.length} messages`);

      logger.info('🤖 CALLING VALIDATOR LLM MODEL...');
      const validatorStartTime = Date.now();
      const modelOutput = await this.invoke(inputMessages);
      const validatorDuration = Date.now() - validatorStartTime;
      logger.info(`🤖 VALIDATOR LLM RESPONSE RECEIVED in ${validatorDuration}ms`);
      
      if (!modelOutput) {
        logger.error('❌ Failed to validate task result');
        throw new Error('Failed to validate task result');
      }

      logger.info('📄 Validator output:', JSON.stringify(modelOutput, null, 2));
      logger.info(`✅ Validation result: ${modelOutput.is_valid ? 'VALID' : 'INVALID'}`);
      if (modelOutput.reason) {
        logger.info(`📝 Validation reason: ${modelOutput.reason}`);
      }
      if (modelOutput.answer) {
        logger.info(`💬 Validation answer: ${modelOutput.answer}`);
      }

      if (!modelOutput.is_valid) {
        // need to update the action results so that other agents can see the error
        const msg = `The answer is not yet correct. ${modelOutput.reason}.`;
        logger.warning(`❌ Validation failed: ${msg}`);
        logger.info('📡 Emitting VALIDATOR STEP_FAIL event...');
        this.context.emitEvent(Actors.VALIDATOR, ExecutionState.STEP_FAIL, msg);
        logger.info('💾 Adding validation failure to action results...');
        this.context.actionResults = [new ActionResult({ extractedContent: msg, includeInMemory: true })];
      } else {
        logger.info('✅ Validation successful!');
        logger.info('📡 Emitting VALIDATOR STEP_OK event...');
        this.context.emitEvent(Actors.VALIDATOR, ExecutionState.STEP_OK, modelOutput.answer);
      }

      logger.info('🕵️ VALIDATOR EXECUTE END - SUCCESS');
      return {
        id: this.id,
        result: modelOutput,
      };
    } catch (error) {
      // Check if this is an authentication error
      if (isAuthenticationError(error)) {
        throw new ChatModelAuthError('Validator API Authentication failed. Please verify your API key', error);
      }
      if (isForbiddenError(error)) {
        throw new ChatModelForbiddenError(LLM_FORBIDDEN_ERROR_MESSAGE, error);
      }
      if (isAbortedError(error)) {
        throw new RequestCancelledError((error as Error).message);
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Validation failed: ${errorMessage}`);
      this.context.emitEvent(Actors.VALIDATOR, ExecutionState.STEP_FAIL, `Validation failed: ${errorMessage}`);
      return {
        id: this.id,
        error: `Validation failed: ${errorMessage}`,
      };
    }
  }
}
