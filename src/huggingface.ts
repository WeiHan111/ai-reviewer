import { Schema, z } from "zod";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatCompletionResponse {
  object: {
    message: Message;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface HuggingFaceOptions {
  apiKey: string;
  provider?: string;
}

export class InferenceClient {
  private apiKey: string;
  private provider: string;
  private baseUrl: string;

  constructor(options: HuggingFaceOptions) {
    this.apiKey = options.apiKey;
    this.provider = options.provider || "huggingface";
    
    if (this.provider === "fireworks-ai") {
      this.baseUrl = "https://api.fireworks.ai/inference/v1";
    } else {
      this.baseUrl = "https://api-inference.huggingface.co/models";
    }
  }

  async createChatCompletion(
    model: string,
    messages: Message[],
    temperature: number = 0
  ): Promise<ChatCompletionResponse> {
    let url: string;
    let headers: Record<string, string>;
    let body: any;

    if (this.provider === "fireworks-ai") {
      url = `${this.baseUrl}/chat/completions`;
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      };
      body = {
        model: model,
        messages: messages,
        temperature: temperature
      };
    } else {
      url = `${this.baseUrl}/${model}`;
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      };
      body = {
        inputs: {
          messages: messages
        },
        parameters: {
          temperature: temperature
        }
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HuggingFace API error: ${response.status} ${response.statusText}\nDetails: ${errorText}`);
    }

    const data = await response.json();
    
    // Format the response to match our expected format
    if (this.provider === "fireworks-ai") {
      return {
        object: {
          message: data.choices[0].message
        },
        usage: data.usage
      };
    } else {
      return {
        object: {
          message: {
            role: "assistant",
            content: data.generated_text || data[0].generated_text
          }
        }
      };
    }
  }
}

// Factory function to create a HuggingFace InferenceClient compatible with ai package
export function createHuggingFace(options: HuggingFaceOptions) {
  const client = new InferenceClient(options);
  
  // Create a function that returns a model instance
  return (model: string) => {
    // This is the model instance function that will be used by generateObject
    const modelFn = async <T extends z.ZodType>(
      { prompt, schema, temperature, system }: { 
        prompt: string; 
        schema: T; 
        temperature?: number; 
        system?: string 
      }
    ) => {
      const messages: Message[] = [];
      
      if (system) {
        messages.push({ role: "system", content: system });
      }
      
      messages.push({ role: "user", content: prompt });
      
      const response = await client.createChatCompletion(
        model,
        messages,
        temperature || 0
      );
      
      // Parse the response with the provided schema
      const content = response.object.message.content;
      let parsedContent;
      
      try {
        // Try to parse as JSON first
        parsedContent = JSON.parse(content);
      } catch (e) {
        // If not valid JSON, check if the content contains structured data that can be parsed
        if (typeof content === 'string') {
          try {
            // Try to extract JSON from the string (sometimes LLMs include markdown code blocks)
            const jsonMatch = content.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
            if (jsonMatch && jsonMatch[1]) {
              parsedContent = JSON.parse(jsonMatch[1]);
            } else {
              // If no JSON found, use the raw content
              parsedContent = content;
            }
          } catch (jsonError) {
            // If all extraction attempts fail, use raw content
            parsedContent = content;
          }
        } else {
          parsedContent = content;
        }
      }
      
      const result = schema.safeParse(parsedContent);
      
      if (!result.success) {
        throw new Error(`Failed to parse response: ${JSON.stringify(result.error.errors, null, 2)}`);
      }
      
      return {
        object: result.data,
        usage: response.usage
      };
    };

    // Add the objectGenerationMode property to make compatible with generateObject
    Object.defineProperty(modelFn, 'objectGenerationMode', {
      value: 'tool', // This tells the ai package this model knows how to generate objects
      enumerable: true
    });
    
    return modelFn;
  };
} 