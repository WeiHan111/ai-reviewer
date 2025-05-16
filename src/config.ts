import { getInput, getMultilineInput } from "@actions/core";

export class Config {
  public llmApiKey: string | undefined;
  public llmModel: string | undefined;
  public githubToken: string | undefined;
  public styleGuideRules: string | undefined;
  public llmProvider: string | undefined;

  constructor() {
    this.githubToken = process.env.GITHUB_TOKEN;
    if (!this.githubToken) {
      throw new Error("GITHUB_TOKEN is not set");
    }

    // Support for different API keys based on provider
    if (process.env.LLM_PROVIDER) {
      this.llmProvider = process.env.LLM_PROVIDER;
      
      if (this.llmProvider === "fireworks-ai" || this.llmProvider === "huggingface") {
        this.llmApiKey = process.env.HF_API_KEY || process.env.LLM_API_KEY;
      } else {
        this.llmApiKey = process.env.LLM_API_KEY;
      }
    } else {
      this.llmApiKey = process.env.LLM_API_KEY;
    }
    
    if (!this.llmApiKey) {
      throw new Error("LLM API key is not set. Set LLM_API_KEY or HF_API_KEY for Hugging Face models.");
    }

    this.llmModel = process.env.LLM_MODEL || getInput("llm_model");
    if (!this.llmModel?.length) {
      throw new Error("LLM_MODEL is not set");
    }

    if (!process.env.DEBUG) {
      return;
    }
    console.log("[debug] loading extra inputs from .env");

    this.styleGuideRules = process.env.STYLE_GUIDE_RULES;
  }

  public loadInputs() {
    if (process.env.DEBUG) {
      console.log("[debug] skip loading inputs");
      return;
    }

    // Custom style guide rules
    try {
      const styleGuideRules = getMultilineInput('style_guide_rules') || [];
      if (Array.isArray(styleGuideRules) && styleGuideRules.length && styleGuideRules[0].trim().length) {
        this.styleGuideRules = styleGuideRules.join("\n");
      }
    } catch (e) {
      console.error("Error loading style guide rules:", e);
    }
    
    // Allow setting provider through GitHub Actions input
    try {
      const provider = getInput('llm_provider');
      if (provider) {
        this.llmProvider = provider;
      }
    } catch (e) {
      console.error("Error loading LLM provider:", e);
    }
  }
}

// For testing, we'll modify how the config instance is created
// This prevents the automatic loading when the module is imported
let configInstance: Config | null = null;

// If not in test environment, create and configure the instance
if (process.env.NODE_ENV !== 'test') {
  configInstance = new Config();
  configInstance.loadInputs();
}

// Export the instance or a function to create one for tests
export default process.env.NODE_ENV === 'test' 
  ? { 
      // Default values for tests
      githubToken: 'mock-token',
      llmApiKey: 'mock-api-key',
      llmModel: 'mock-model',
      styleGuideRules: '',
      llmProvider: undefined,
      loadInputs: jest.fn()
    } 
  : configInstance!;
