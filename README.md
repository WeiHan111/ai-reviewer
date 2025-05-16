<div align="center">
  <h1>
    Presubmit - AI Code Reviewer
  </h1>
  
  <p><em>Context-aware, intelligent and instant PR reviews</em></p>

[![GitHub Stars](https://img.shields.io/github/stars/presubmit/ai-reviewer?style=social)](https://github.com/presubmit/ai-reviewer/stargazers) &nbsp;
[![GitHub last commit](https://img.shields.io/github/last-commit/presubmit/ai-reviewer)](https://github.com/presubmit/ai-reviewer/commits) &nbsp;
[![GitHub License](https://img.shields.io/github/license/presubmit/ai-reviewer?color=yellow)](https://github.com/presubmit/ai-reviewer/blob/main/LICENSE) &nbsp;
[![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/presubmitai?style=social)](https://x.com/intent/follow?screen_name=presubmitai)

</div>

<br/>

Optimize your code review process with Presubmit's AI Code Reviewer that catches bugs, suggests improvements, and provides meaningful summary - all before human reviewers take their first look.

- 🔍 **Instant, In-depth PR Analysis**: Catches bugs, security issues, and optimization opportunities in real-time
- 🎯 **Focus on What Matters**: Let AI handle the basics while humans focus on architecture and complex logic
- ✨ **Title and description generation**: Save time by having the AI generate meaningful title and description for your PR
- 💬 **Interactive & Smart**: Responds to questions and generates code suggestions right in your PR
- ⚡ **Lightning-Fast Setup**: Up and running in 2 minutes with GitHub Actions

<br/>

> 🤝 **Note**: Presubmit is designed to complement human reviewers, not replace them. It helps catch security issues and bugs early on while also providing context about the overall change, making the human review process more efficient.

<br/>

## See it in Action

> 💡 [View full example PR review](https://github.com/presubmit/ebank-backend/pull/13)

Automated analysis detects potential issues and provides actionable insights:

<div align="left">
  <a href="https://github.com/presubmit/ebank-backend/pull/13">
    <img src="https://github.com/presubmit/ai-reviewer/blob/main/assets/review_example_3.png?raw=true" alt="AI Code Review example" width="650"/>
  </a>
</div>

<br/>

Interactive discussions help clarify implementation details:

<div align="left">
  <a href="https://github.com/presubmit/ebank-backend/pull/13">
    <img src="https://github.com/presubmit/ai-reviewer/blob/main/assets/comment_example.png?raw=true" alt="AI comment thread example" width="650"/>
  </a>
</div>

<br/>

## Usage

### Step 1: Add LLM_API_KEY secret

1. Go to your repository's Settings > Secrets and Variables > Actions
2. Click "New repository secret"
3. Add a new secret with:
   - Name: `LLM_API_KEY`
   - Value: Your API key from one of these providers:
     - [Anthropic Console](https://console.anthropic.com/) (Claude)
     - [OpenAI API](https://platform.openai.com/api-keys) (GPT-4)
     - [Google AI Studio](https://aistudio.google.com/app/apikeys) (Gemini)

### Step 2: Create GitHub Workflow

Add this GitHub Action to your repository by creating `.github/workflows/presubmit.yml`:

```yaml
name: Presubmit.ai

permissions:
  contents: read
  pull-requests: write
  issues: write

on:
  pull_request_target:
    types: [opened, synchronize]
  pull_request_review_comment:
    types: [created]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Check required secrets
        run: |
          if [ -z "${{ secrets.LLM_API_KEY }}" ]; then
            echo "Error: LLM_API_KEY secret is not configured"
            exit 1
          fi
      - uses: presubmit/ai-reviewer@latest
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
          LLM_MODEL: "claude-3-5-sonnet-20241022"
```

The action requires:

- `GITHUB_TOKEN`: Automatically provided by GitHub Actions
- `LLM_API_KEY`: Your API key (added in step 1)
- `LLM_MODEL`: Which LLM model to use. Make sure the model is [supported](https://github.com/presubmit/ai-reviewer/blob/main/src/ai.ts) and matches the `LLM_API_KEY`.

<br/>

## Features

### 🤖 Smart Reviews

- **In-depth Analysis**: Line-by-line review with context-aware suggestions
- **Auto PR Summary**: Concise, meaningful summaries of changes
- **Code Quality**: Catches bugs, anti-patterns, and style issues
- **Interactive**: Responds to questions and clarifications in comments

### 🛡️ Security & Quality

- **Vulnerability Detection**: Catches security issues and leaked
  secrets
- **Best Practices**: Enforces coding standards and security
  guidelines
- **Performance**: Identifies potential bottlenecks and optimizations
- **Documentation**: Ensures proper code documentation and clarity

### ⚙️ Configurable

- Mention `@presubmit` in PR title for auto-generation
- Disable reviews with `@presubmit ignore` comment
- Configurable review depth and focus areas
- Customizable rules and preferences

### ⚡ Seamless Integration

- 2-minute setup with GitHub Actions
- Works with all major LLM providers (Claude, GPT-4, Gemini)
- Instant feedback on every PR
- Zero maintenance required

<br/>

## Show Your Support! ⭐

If you find Presubmit helpful in improving the review process:

- **Star this repository** to show your support and help others discover it
- Share your experience by creating a [GitHub Issue](https://github.com/presubmit/ai-reviewer/issues)
- Follow me on [X/Twitter](https://x.com/bdstanga) for updates
- Consider [contributing](CONTRIBUTING.md) to make it even better

## Using Open-Source Models

This project now supports open-source models like Llama 3, in addition to the closed-source models from OpenAI, Anthropic, and Google.

### Using Llama 3.1 with Fireworks AI

To use Llama 3.1 models via Fireworks AI:

1. Get an API key from [Fireworks AI](https://fireworks.ai/)
2. Set the following environment variables:
   ```
   LLM_PROVIDER=fireworks-ai
   HF_API_KEY=your_fireworks_api_key
   LLM_MODEL=meta-llama/Llama-3.1-8B-Instruct
   ```
   Note: You can use the human-readable model name shown above, and the system will automatically map it to the correct Fireworks API model identifier.

3. Or, configure it in your GitHub Actions workflow:
   ```yaml
   - name: Run AI Reviewer
     uses: presubmit/ai-reviewer@v1
     with:
       llm_provider: fireworks-ai
       llm_model: meta-llama/Llama-3.1-8B-Instruct
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
       HF_API_KEY: ${{ secrets.FIREWORKS_API_KEY }}
   ```

### Supported Open-Source Models

The following open-source models are currently supported:

- `meta-llama/Llama-3.1-8B-Instruct` - Llama 3.1 8B Instruct model (recommended)
- `meta-llama/Llama-3.1-70B-Instruct` - Llama 3.1 70B Instruct model
- `mistralai/Mistral-7B-Instruct-v0.2` - Mistral 7B Instruct model

These models are accessed through Fireworks AI and use the following API identifiers internally:

- `accounts/fireworks/models/llama-v3p1-8b-instruct` (for Llama 3.1 8B)
- `accounts/fireworks/models/llama-v3p1-70b-instruct` (for Llama 3.1 70B)
- `accounts/fireworks/models/mistral-7b-instruct-v0.2` (for Mistral 7B)

<!-- Dummy change for test-pr-2 -->
