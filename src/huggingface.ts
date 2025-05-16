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
      
      // Add extensive debug logging
      if (process.env.DEBUG) {
        console.log("=================== DEBUG RESPONSE CONTENT ===================");
        console.log("Raw response content:");
        console.log(content);
        console.log("Content type:", typeof content);
        console.log("Content length:", content?.length);
        console.log("=============================================================");
      }
      
      try {
        // Try to parse as JSON first
        if (process.env.DEBUG) console.log("Attempting direct JSON parse...");
        parsedContent = JSON.parse(content);
        if (process.env.DEBUG) console.log("Direct JSON parse succeeded!");
      } catch (e) {
        if (process.env.DEBUG) {
          console.log("Direct JSON parse failed with error:", e instanceof Error ? e.message : String(e));
        }
        
        // If not valid JSON, check if the content contains structured data that can be parsed
        if (typeof content === 'string') {
          try {
            // First, try to clean the content if it's wrapped in a code block
            if (process.env.DEBUG) console.log("Attempting to clean content from code blocks...");
            const cleanedContent = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '');
            
            if (process.env.DEBUG) {
              console.log("Cleaned content:");
              console.log(cleanedContent);
            }
            
            try {
              parsedContent = JSON.parse(cleanedContent);
              if (process.env.DEBUG) console.log("JSON parse with cleaned content succeeded!");
            } catch (cleanError) {
              if (process.env.DEBUG) {
                console.log("Clean content JSON parse failed with error:", 
                  cleanError instanceof Error ? cleanError.message : String(cleanError));
              }
              
              // If cleaning didn't work, try more aggressive regex matching
              if (process.env.DEBUG) console.log("Attempting regex extraction...");
              // This regex can handle multi-line nested JSON better than the previous one
              const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
              
              if (process.env.DEBUG) {
                console.log("Regex match result:", jsonMatch ? "Found a match" : "No match");
                if (jsonMatch) {
                  console.log("Extracted content:");
                  console.log(jsonMatch[1]);
                }
              }
              
              if (jsonMatch && jsonMatch[1]) {
                try {
                  parsedContent = JSON.parse(jsonMatch[1]);
                  if (process.env.DEBUG) console.log("JSON parse with regex extraction succeeded!");
                } catch (matchError) {
                  if (process.env.DEBUG) {
                    console.log("Regex extraction JSON parse failed with error:", 
                      matchError instanceof Error ? matchError.message : String(matchError));
                  }
                  // If all extraction attempts fail, use raw content
                  if (process.env.DEBUG) console.log("All parsing attempts failed, using raw content");
                  parsedContent = content;
                }
              } else {
                // If no JSON found, use the raw content
                if (process.env.DEBUG) console.log("No regex match found, using raw content");
                parsedContent = content;
              }
            }
          } catch (jsonError) {
            // If all extraction attempts fail, use raw content
            if (process.env.DEBUG) {
              console.log("Overall JSON parsing failed with error:", 
                jsonError instanceof Error ? jsonError.message : String(jsonError));
              console.log("Using raw content");
            }
            parsedContent = content;
          }
        } else {
          if (process.env.DEBUG) console.log("Content is not a string, using as is");
          parsedContent = content;
        }
      }
      
      if (process.env.DEBUG) {
        console.log("=================== PARSED CONTENT ===================");
        console.log("Type:", typeof parsedContent);
        console.log("Value:", 
          typeof parsedContent === 'object' ? JSON.stringify(parsedContent, null, 2) : parsedContent);
        console.log("=======================================================");
      }
      
      const result = schema.safeParse(parsedContent);
      
      if (!result.success) {
        if (process.env.DEBUG) {
          console.log("=================== SCHEMA VALIDATION ERROR ===================");
          console.log("Schema validation failed:");
          console.log(JSON.stringify(result.error.errors, null, 2));
          
          // Print schema details
          console.log("Expected schema:");
          try {
            console.log("Schema type:", schema.constructor.name);
          } catch (e) {
            console.log("Could not describe schema:", e);
          }
          console.log("==============================================================");
        }
        throw new Error(`Failed to parse response: ${JSON.stringify(result.error.errors, null, 2)}`);
      }
      
      if (process.env.DEBUG) {
        console.log("Schema validation succeeded!");
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