import config from "./config";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createHuggingFace } from "./huggingface";
import { generateObject } from "ai";
import { info } from "@actions/core";
import { z } from "zod";

const LLM_MODELS = [
  // Anthropic
  {
    name: "claude-3-5-sonnet-20240620",
    createAi: createAnthropic,
  },
  {
    name: "claude-3-5-sonnet-20241022",
    createAi: createAnthropic,
  },
  {
    name: "claude-3-7-sonnet-20250219",
    createAi: createAnthropic,
  },
  // OpenAI
  {
    name: "gpt-4.1-mini",
    createAi: createOpenAI,
  },
  {
    name: "gpt-4o-mini",
    createAi: createOpenAI,
  },
  {
    name: "o1",
    createAi: createOpenAI,
  },
  {
    name: "o1-mini",
    createAi: createOpenAI,
  },
  {
    name: "o3-mini",
    createAi: createOpenAI,
    temperature: 1,
  },
  {
    name: "o4-mini",
    createAi: createOpenAI,
    temperature: 1,
  },
  // Google stable models https://ai.google.dev/gemini-api/docs/models/gemini
  {
    name: "gemini-2.0-flash-001",
    createAi: createGoogleGenerativeAI,
  },
  {
    name: "gemini-2.0-flash-lite-preview-02-05",
    createAi: createGoogleGenerativeAI,
  },
  {
    name: "gemini-1.5-flash",
    createAi: createGoogleGenerativeAI,
  },
  {
    name: "gemini-1.5-flash-latest",
    createAi: createGoogleGenerativeAI,
  },
  {
    name: "gemini-1.5-flash-8b",
    createAi: createGoogleGenerativeAI,
  },
  {
    name: "gemini-1.5-pro",
    createAi: createGoogleGenerativeAI,
  },
  // Google experimental models https://ai.google.dev/gemini-api/docs/models/experimental-models
  {
    name: "gemini-2.5-pro-preview-05-06",
    createAi: createGoogleGenerativeAI,
  },
  {
    name: "gemini-2.5-flash-preview-04-17",
    createAi: createGoogleGenerativeAI,
  },
  {
    name: "gemini-2.0-pro-exp-02-05",
    createAi: createGoogleGenerativeAI,
  },
  {
    name: "gemini-2.0-flash-thinking-exp-01-21",
    createAi: createGoogleGenerativeAI,
  },
  // HuggingFace/Open-source models via Fireworks AI
  {
    name: "accounts/fireworks/models/llama-v3p1-8b-instruct",
    displayName: "meta-llama/Llama-3.1-8B-Instruct", // For display purposes
    createAi: createHuggingFace,
    provider: "fireworks-ai"
  },
  {
    name: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    displayName: "meta-llama/Llama-3.1-70B-Instruct", // For display purposes
    createAi: createHuggingFace,
    provider: "fireworks-ai"
  },
  {
    name: "accounts/fireworks/models/mistral-7b-instruct-v0.2",
    displayName: "mistralai/Mistral-7B-Instruct-v0.2", // For display purposes
    createAi: createHuggingFace,
    provider: "fireworks-ai"
  }
];

// Helper function to find model by display name
function findModelByDisplayName(displayName: string) {
  return LLM_MODELS.find(model => model.displayName === displayName);
}

export async function runPrompt({
  prompt,
  systemPrompt,
  schema,
}: {
  prompt: string;
  systemPrompt?: string;
  schema: z.ZodObject<any, any>;
}) {
  // Ensure we have a model specified
  if (!config.llmModel) {
    throw new Error("LLM model is not set");
  }
  
  let modelName = config.llmModel;
  
  // If model is a display name, find the actual model name
  const modelByDisplayName = findModelByDisplayName(modelName);
  if (modelByDisplayName) {
    modelName = modelByDisplayName.name;
  }
  
  const model = LLM_MODELS.find((m) => m.name === modelName || m.displayName === modelName);
  if (!model) {
    throw new Error(`Unknown LLM model: ${config.llmModel}`);
  }

  // Ensure we have an API key
  if (!config.llmApiKey) {
    throw new Error("LLM API key is not set");
  }

  // Special handling for HuggingFace models
  if (model.provider === "fireworks-ai" || model.provider === "huggingface") {
    // Create HuggingFace client
    const hfClient = createHuggingFace({
      apiKey: config.llmApiKey,
      provider: model.provider
    });
    
    try {
      // Use our custom HuggingFace client implementation directly
      const result = await hfClient(model.name)({
        prompt,
        schema,
        temperature: model.temperature || 0,
        system: systemPrompt,
      });
      
      if (process.env.DEBUG && result.usage) {
        info(`usage: \n${JSON.stringify(result.usage, null, 2)}`);
      }
      
      return result.object;
    } catch (error) {
      throw new Error(`Error calling HuggingFace model: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Standard handling for other models (OpenAI, Anthropic, Google)
  try {
    const aiOptions = { apiKey: config.llmApiKey };
    const llm = model.createAi(aiOptions);
    
    const { object, usage } = await generateObject({
      // @ts-ignore - Type issues between our implementation and the ai package
      model: llm(model.name),
      prompt,
      temperature: model.temperature || 0,
      system: systemPrompt,
      schema,
    });

    if (process.env.DEBUG && usage) {
      info(`usage: \n${JSON.stringify(usage, null, 2)}`);
    }

    return object;
  } catch (error) {
    throw new Error(`Error calling LLM model: ${error instanceof Error ? error.message : String(error)}`);
  }
}
