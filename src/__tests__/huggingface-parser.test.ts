import { createHuggingFace } from '../huggingface';
import { z } from 'zod';

// Mock the fetch function
global.fetch = jest.fn();

describe('HuggingFace Parser', () => {
  const mockOptions = {
    apiKey: 'test-key',
    provider: 'fireworks-ai'
  };

  const sampleSchema = z.object({
    review: z.object({
      score: z.number(),
      has_relevant_tests: z.boolean(),
      estimated_effort_to_review: z.number(),
      security_concerns: z.string()
    }),
    comments: z.array(
      z.object({
        file: z.string(),
        start_line: z.number(),
        end_line: z.number(),
        highlighted_code: z.string(),
        header: z.string(),
        content: z.string(),
        label: z.string(),
        critical: z.boolean()
      })
    )
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  const setupMockResponse = (responseContent: string) => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: responseContent
            }
          }
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 100,
          total_tokens: 200
        }
      })
    });
  };

  test('should parse clean JSON response', async () => {
    const jsonResponse = JSON.stringify({
      review: {
        score: 60,
        has_relevant_tests: false,
        estimated_effort_to_review: 3,
        security_concerns: "No"
      },
      comments: [
        {
          file: "test.py",
          start_line: 1,
          end_line: 2,
          highlighted_code: "code here",
          header: "Test header",
          content: "Test content",
          label: "bug",
          critical: true
        }
      ]
    });
    
    setupMockResponse(jsonResponse);
    
    const hfClient = createHuggingFace(mockOptions);
    const result = await hfClient('test-model')({
      prompt: 'test prompt',
      schema: sampleSchema
    });
    
    expect(result.object).toHaveProperty('review');
    expect(result.object).toHaveProperty('comments');
    expect(result.object.review.score).toBe(60);
    expect(result.object.comments[0].file).toBe('test.py');
  });

  test('should parse JSON in markdown code blocks', async () => {
    const markdownResponse = '```json\n' + JSON.stringify({
      review: {
        score: 70,
        has_relevant_tests: true,
        estimated_effort_to_review: 2,
        security_concerns: "No"
      },
      comments: [
        {
          file: "test.js",
          start_line: 3,
          end_line: 4,
          highlighted_code: "code here",
          header: "Markdown header",
          content: "Markdown content",
          label: "enhancement",
          critical: false
        }
      ]
    }, null, 2) + '\n```';
    
    setupMockResponse(markdownResponse);
    
    const hfClient = createHuggingFace(mockOptions);
    const result = await hfClient('test-model')({
      prompt: 'test prompt',
      schema: sampleSchema
    });
    
    expect(result.object).toHaveProperty('review');
    expect(result.object).toHaveProperty('comments');
    expect(result.object.review.score).toBe(70);
    expect(result.object.comments[0].file).toBe('test.js');
  });

  test('should handle complex nested JSON in markdown code blocks', async () => {
    // A more complex JSON response with nested structures and special characters
    const complexJson = {
      review: {
        score: 85,
        has_relevant_tests: true,
        estimated_effort_to_review: 4,
        security_concerns: "No concerns with {special} characters"
      },
      comments: [
        {
          file: "complex.ts",
          start_line: 10,
          end_line: 20,
          highlighted_code: "function test() {\n  return { nested: true };\n}",
          header: "Complex nested structure",
          content: "This is a test with nested braces {} and [brackets]",
          label: "complex",
          critical: true
        },
        {
          file: "another.ts",
          start_line: 5,
          end_line: 8,
          highlighted_code: "const obj = { a: { b: { c: 1 } } };",
          header: "Multiple levels",
          content: "Multiple levels of nesting",
          label: "structure",
          critical: false
        }
      ]
    };
    
    const markdownResponse = '```json\n' + JSON.stringify(complexJson, null, 2) + '\n```';
    
    setupMockResponse(markdownResponse);
    
    const hfClient = createHuggingFace(mockOptions);
    const result = await hfClient('test-model')({
      prompt: 'test prompt',
      schema: sampleSchema
    });
    
    expect(result.object).toHaveProperty('review');
    expect(result.object.review.score).toBe(85);
    expect(result.object.comments).toHaveLength(2);
    expect(result.object.comments[0].file).toBe('complex.ts');
    expect(result.object.comments[1].file).toBe('another.ts');
  });
}); 