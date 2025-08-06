import { llmProviderStore } from './llmProviders';
import { agentModelStore } from './agentModels';
import { ProviderTypeEnum, AgentNameEnum } from './types';

/**
 * Simple default configuration setup
 * Sets up GPT-OSS-20B on Ollama for all agents if no providers exist
 */
export async function initializeDefaults(): Promise<void> {
  try {
    // Check if Ollama provider exists, if not create it
    const providers = await llmProviderStore.getAllProviders();
    const hasOllama = providers[ProviderTypeEnum.Ollama];
    
    if (!hasOllama) {
      // Set up Ollama provider for GPT-OSS-20B
      await llmProviderStore.setProvider(ProviderTypeEnum.Ollama, {
        apiKey: 'EMPTY',
        name: 'Ollama GPT-OSS',
        type: ProviderTypeEnum.Ollama,
        baseUrl: 'http://localhost:11434/v1',
        modelNames: ['gpt-oss:20b'],
        createdAt: Date.now(),
      });
      console.log('✅ Ollama GPT-OSS provider configured');
    }

    // Check and configure each agent individually
    const navigatorModel = await agentModelStore.getAgentModel(AgentNameEnum.Navigator);
    if (!navigatorModel) {
      await agentModelStore.setAgentModel(AgentNameEnum.Navigator, {
        provider: ProviderTypeEnum.Ollama,
        modelName: 'Qwen3:14B',
        parameters: { temperature: 0.1, topP: 0.85 },
      });
      console.log('✅ Navigator model configured with GPT-OSS-20B');
    }

    const plannerModel = await agentModelStore.getAgentModel(AgentNameEnum.Planner);
    if (!plannerModel) {
      await agentModelStore.setAgentModel(AgentNameEnum.Planner, {
        provider: ProviderTypeEnum.Ollama,
        modelName: 'Qwen3:14B',
        parameters: { temperature: 0.3, topP: 0.9 },
      });
      console.log('✅ Planner model configured with GPT-OSS-20B');
    }

    const validatorModel = await agentModelStore.getAgentModel(AgentNameEnum.Validator);
    if (!validatorModel) {
      await agentModelStore.setAgentModel(AgentNameEnum.Validator, {
        provider: ProviderTypeEnum.Ollama,
        modelName: 'Qwen3:14B',
        parameters: { temperature: 0.1, topP: 0.8 },
      });
      console.log('✅ Validator model configured with GPT-OSS-20B');
    }

    console.log('✅ Default configuration check complete');
  } catch (error) {
    console.error('❌ Failed to initialize defaults:', error);
  }
}