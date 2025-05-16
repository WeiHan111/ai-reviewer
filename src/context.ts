import { context, getOctokit } from "@actions/github";
import { Context } from "@actions/github/lib/context";

export async function loadContext(): Promise<Context> {
  if (process.env.DEBUG) {
    return await loadDebugContext();
  }
  return context;
}

async function loadDebugContext(): Promise<Context> {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is not set");
  }
  const octokit = getOctokit(process.env.GITHUB_TOKEN);

  const [owner, repo] = process.env.GITHUB_REPOSITORY?.split("/") || [];
  
  // Determine the PR number more intelligently
  let pullNumber: number;
  
  // First try to get PR number from the context
  if (context.payload.pull_request?.number) {
    pullNumber = context.payload.pull_request.number;
    if (process.env.DEBUG) {
      console.log(`DEBUG: Got PR number ${pullNumber} from context payload`);
    }
  } 
  // Then try to get it from the environment variable
  else if (process.env.GITHUB_PULL_REQUEST) {
    pullNumber = parseInt(process.env.GITHUB_PULL_REQUEST);
    if (process.env.DEBUG) {
      console.log(`DEBUG: Got PR number ${pullNumber} from GITHUB_PULL_REQUEST env var`);
    }
  } 
  // If context doesn't have it and no env var, try to extract from ref (for PR events)
  else if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/pull/')) {
    // The format is 'refs/pull/13/merge' or 'refs/pull/13/head'
    const match = process.env.GITHUB_REF.match(/refs\/pull\/(\d+)/);
    if (match && match[1]) {
      pullNumber = parseInt(match[1]);
      if (process.env.DEBUG) {
        console.log(`DEBUG: Extracted PR number ${pullNumber} from GITHUB_REF: ${process.env.GITHUB_REF}`);
      }
    } else {
      pullNumber = 1; // Default fallback
      console.warn(`WARNING: Could not extract PR number from GITHUB_REF: ${process.env.GITHUB_REF}, using default`);
    }
  }
  // As a last resort, default to 1 (but warn about it)
  else {
    pullNumber = 1;
    console.warn("WARNING: Could not determine PR number, defaulting to PR #1");
  }

  const { data: pull_request } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });

  const commentId = process.env.GITHUB_COMMENT_ID;
  let comment: any;
  if (commentId) {
    const { data } = await octokit.rest.pulls.getReviewComment({
      owner,
      repo,
      comment_id: parseInt(commentId),
    });
    comment = data;
  }

  return {
    ...context,
    eventName: process.env.GITHUB_EVENT_NAME || "",
    repo: {
      owner,
      repo,
    },
    payload: {
      action: process.env.GITHUB_EVENT_ACTION || "",
      pull_request: {
        ...pull_request,
        number: pull_request.number,
        html_url: pull_request.html_url,
        body: pull_request.body || undefined,
      },
      comment,
    },
    issue: context.issue,
  };
}
