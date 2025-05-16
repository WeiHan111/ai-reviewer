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
      // Default to Hugging Face API if provider is not fireworks-ai or is explicitly huggingface
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
        temperature: temperature,
        // Ensure consistent response format if possible, though this might be model/provider specific
        // stream: false // Example: if streaming is an option and we want to disable it
      };
    } else { // Assuming Hugging Face direct API
      url = `${this.baseUrl}/${model}`;
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      };
      body = {
        inputs: {
          messages: messages // Ensure this structure matches Hugging Face API for chat
        },
        parameters: {
          temperature: temperature,
          // return_full_text: false // Common parameter to avoid re-prompting in response
        },
        // options: { wait_for_model: true } // Useful if model might not be immediately available
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
    
    if (this.provider === "fireworks-ai") {
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("Invalid response structure from Fireworks AI");
      }
      return {
        object: {
          message: data.choices[0].message
        },
        usage: data.usage
      };
    } else { // Hugging Face direct API response handling
        // This part needs to be robust. HF API responses vary.
        // Common format for text generation is an array with an object containing 'generated_text'.
        let content = "";
        if (Array.isArray(data) && data[0] && data[0].generated_text) {
            content = data[0].generated_text;
        } else if (data.generated_text) { // Sometimes it's not in an array
            content = data.generated_text;
        } else {
            // If the structure is different, this will need adjustment or more specific error handling.
            // For now, attempt to stringify to see what we got if it's not recognized.
            console.warn("Unexpected response structure from HuggingFace API:", JSON.stringify(data, null, 2));
            throw new Error("Unexpected response structure from HuggingFace API. Check server logs for details.");
        }
      return {
        object: {
          message: {
            role: "assistant",
            content: content
          }
        }
        // Usage data might not be standardly available or in a different format for direct HF API.
      };
    }
  }
}

export function createHuggingFace(options: HuggingFaceOptions) {
  const client = new InferenceClient(options);
  
  return (model: string) => {
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
      
      const content = response.object.message.content;
      let parsedContent: any;
      
      try {
        parsedContent = JSON.parse(content);
      } catch (e) {
        if (typeof content === 'string') {
          const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/m);
          if (codeBlockMatch && codeBlockMatch[1]) {
            try {
              parsedContent = JSON.parse(codeBlockMatch[1]);
            } catch (e2) {
              // If parsing the extracted content fails, it might be a string that looks like JSON but isn't meant to be.
              // Or it's just a plain string response.
              // Fallback to using the raw content if schema expects a string.
              if (schema instanceof z.ZodString) {
                 parsedContent = content;
              } else {
                throw new Error(`Failed to parse content from code block as JSON: ${e2 instanceof Error ? e2.message : String(e2)}. Original content: ${content}`);
              }
            }
          } else {
             // If no code block, and not direct JSON, it might be a plain string response.
             if (schema instanceof z.ZodString) {
                parsedContent = content;
             } else {
               throw new Error(`Content is not valid JSON and not a JSON code block: ${e instanceof Error ? e.message : String(e)}. Original content: ${content}`);
             }
          }
        } else {
          // Content is not a string and not parsable as JSON directly
          parsedContent = content; 
        }
      }
      
      const result = schema.safeParse(parsedContent);
      
      if (!result.success) {
        const issues = result.error.issues.map(issue => `  Path: ${issue.path.join('.')}, Message: ${issue.message}`).join('\n');
        throw new Error(`Failed to validate response against schema: ${result.error.message}\nIssues:\n${issues}\nParsed Content:\n${JSON.stringify(parsedContent, null, 2)}`);
      }
      
      return {
        object: result.data,
        usage: response.usage
      };
    };
    
    return modelFn;
  };
} 