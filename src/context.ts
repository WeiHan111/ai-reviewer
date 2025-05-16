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
  
  let pullNumber: number;
  
  if (context.payload.pull_request?.number) {
    pullNumber = context.payload.pull_request.number;
  } 
  else if (process.env.GITHUB_PULL_REQUEST && !isNaN(parseInt(process.env.GITHUB_PULL_REQUEST))) {
    pullNumber = parseInt(process.env.GITHUB_PULL_REQUEST);
  } 
  else if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/pull/')) {
    const match = process.env.GITHUB_REF.match(/refs\/pull\/(\d+)/);
    if (match && match[1]) {
      pullNumber = parseInt(match[1]);
    } else {
      pullNumber = 1; // Default fallback if GITHUB_REF format is unexpected
    }
  }
  else {
    pullNumber = 1; // Default fallback if no other source provides a PR number
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
