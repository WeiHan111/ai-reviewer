import { info, warning } from "@actions/core";
import config from "./config";
import { initOctokit } from "./octokit";
import { loadContext } from "./context";
import { runSummaryPrompt, AIComment, runReviewPrompt } from "./prompts";
import {
  buildLoadingMessage,
  buildReviewSummary,
  buildOverviewMessage,
  OVERVIEW_MESSAGE_SIGNATURE,
  PAYLOAD_TAG_CLOSE,
  PAYLOAD_TAG_OPEN,
} from "./messages";
import { FileDiff, parseFileDiff } from "./diff";
import { Octokit } from "@octokit/action";
import { Context } from "@actions/github/lib/context";
import { buildComment, listPullRequestCommentThreads } from "./comments";

export async function handlePullRequest() {
  const context = await loadContext();
  if (
    context.eventName !== "pull_request" &&
    context.eventName !== "pull_request_target"
  ) {
    warning("unsupported github event");
    return;
  }

  const { pull_request } = context.payload;
  if (!pull_request) {
    warning("`pull_request` is missing from payload");
    return;
  }

  const octokit = initOctokit(config.githubToken);

  if (shouldIgnorePullRequest(pull_request)) {
    return;
  }

  // Get commit messages
  const { data: commits } = await octokit.rest.pulls.listCommits({
    ...context.repo,
    pull_number: pull_request.number,
  });
  info(`successfully fetched commit messages`);

  // Find or create overview comment with the summary
  const { data: existingComments } = await octokit.rest.issues.listComments({
    ...context.repo,
    issue_number: pull_request.number,
  });
  let overviewComment = existingComments.find((comment) =>
    comment.body?.includes(OVERVIEW_MESSAGE_SIGNATURE)
  );
  
  let commitsReviewed: string[] = [];
  let lastCommitReviewed: string | null = null;

  // Add support for FORCE_FULL_REVIEW environment variable
  const forceFullReview = process.env.FORCE_FULL_REVIEW === "true";
  if (forceFullReview && overviewComment) {
    info(`FORCE_FULL_REVIEW is set to true, ignoring existing overview comment`);
    overviewComment = undefined;
    // Ensure commitsReviewed is also empty for a true full review
    commitsReviewed = []; 
    lastCommitReviewed = null;
  }
  
  const isIncrementalReview = !!overviewComment;

  // Maybe fetch review comments
  const reviewCommentThreads = isIncrementalReview
    ? await listPullRequestCommentThreads(octokit, {
        ...context.repo,
        pull_number: pull_request.number,
      })
    : [];

  // Get modified files
  const { data: files } = await octokit.rest.pulls.listFiles({
    ...context.repo,
    pull_number: pull_request.number,
  });
  let filesToReview = files.map((file) =>
    parseFileDiff(file, reviewCommentThreads)
  );
  info(`successfully fetched file diffs`);

  // This block should only run if it's an incremental review and forceFullReview is false
  if (isIncrementalReview && !forceFullReview && overviewComment) { 
    info(`running incremental review`);
    try {
      const payload = JSON.parse(
        overviewComment.body
          ?.split(PAYLOAD_TAG_OPEN)[1]
          .split(PAYLOAD_TAG_CLOSE)[0] || "{}"
      );
      commitsReviewed = payload.commits;
    } catch (error) {
      warning(`error parsing overview payload: ${error}`);
    }

    // Check if there are any incremental changes
    lastCommitReviewed =
      commitsReviewed.length > 0
        ? commitsReviewed[commitsReviewed.length - 1]
        : null;
    const incrementalDiff =
      lastCommitReviewed && lastCommitReviewed != pull_request.head.sha
        ? await octokit.rest.repos.compareCommits({
            ...context.repo,
            base: lastCommitReviewed,
            head: pull_request.head.sha,
          })
        : null;
    if (incrementalDiff?.data?.files) {
      // If incremental review, only consider files that were modified within incremental change.
      filesToReview = filesToReview.filter((f) =>
        incrementalDiff.data.files?.some((f2) => f2.filename === f.filename)
      );
    }
  } else {
    info(`running full review`);
  }

  // More debug logging
  if (process.env.DEBUG) {
    console.log("DEBUG: Before commitsToReview calculation:");
    console.log("DEBUG: forceFullReview:", forceFullReview);
    console.log("DEBUG: isIncrementalReview:", isIncrementalReview);
    console.log("DEBUG: overviewComment exists:", !!overviewComment);
    console.log("DEBUG: All commits from PR:", JSON.stringify(commits.map(c => c.sha), null, 2));
    console.log("DEBUG: commitsReviewed:", JSON.stringify(commitsReviewed, null, 2));
  }

  const commitsToReview = commitsReviewed.length
    ? commits.filter((c) => !commitsReviewed.includes(c.sha))
    : commits;
  
  if (process.env.DEBUG) {
    console.log("DEBUG: commitsToReview:", JSON.stringify(commitsToReview.map(c => c.sha), null, 2));
  }

  if (commitsToReview.length === 0) {
    info(`no new commits to review`);
    return;
  }

  if (overviewComment) {
    await octokit.rest.issues.updateComment({
      ...context.repo,
      comment_id: overviewComment.id,
      body: buildLoadingMessage(
        lastCommitReviewed ?? pull_request.base.sha,
        commitsToReview,
        filesToReview
      ),
    });
    info(`updated existing overview comment`);
  } else {
    overviewComment = (
      await octokit.rest.issues.createComment({
        ...context.repo,
        issue_number: pull_request.number,
        body: buildLoadingMessage(
          pull_request.base.sha,
          commitsToReview,
          filesToReview
        ),
      })
    ).data;
    info(`posted new overview loading comment`);
  }

  // Generate PR summary
  const summary = await runSummaryPrompt({
    prTitle: pull_request.title,
    prDescription: pull_request.body || "",
    commitMessages: commits.map((commit) => commit.commit.message),
    files: files,
  });
  info(`generated pull request summary: ${summary.title}`);

  // Update PR title if @presubmitai is mentioned in the title
  if (
    pull_request.title.includes("@presubmitai") ||
    pull_request.title.includes("@presubmit")
  ) {
    info(`title contains mention of presubmit.ai, so generating a new title`);
    await octokit.rest.pulls.update({
      ...context.repo,
      pull_number: pull_request.number,
      title: summary.title,
      // body: summary.description,
    });
  }

  // Update overview comment with the PR overview
  await octokit.rest.issues.updateComment({
    ...context.repo,
    comment_id: overviewComment.id,
    body: buildOverviewMessage(
      summary,
      commits.map((c) => c.sha)
    ),
  });
  info(`updated overview comment with walkthrough`);

  // ======= START REVIEW =======

  const review = await runReviewPrompt({
    files: filesToReview,
    prTitle: pull_request.title,
    prDescription: pull_request.body || "",
    prSummary: summary.description,
  });
  info(`reviewed pull request`);

  // Post review comments
  const comments = review.comments.filter(
    (c) => c.content.trim() !== "" && files.some((f) => f.filename === c.file)
  );
  await submitReview(
    octokit,
    context,
    {
      number: pull_request.number,
      headSha: pull_request.head.sha,
    },
    comments,
    commitsToReview,
    filesToReview
  );
  info(`posted review comments`);
}

async function submitReview(
  octokit: Octokit,
  context: Context,
  pull_request: {
    number: number;
    headSha: string;
  },
  comments: AIComment[],
  commits: {
    sha: string;
    commit: {
      message: string;
    };
  }[],
  files: FileDiff[]
) {
  // DEBUG LOGGING: Add extensive logging
  if (process.env.DEBUG) {
    console.log("DEBUG: ===== REVIEW SUBMISSION =====");
    console.log(`DEBUG: PR Number: ${pull_request.number}`);
    console.log(`DEBUG: HEAD SHA being used for review: ${pull_request.headSha}`);
    console.log(`DEBUG: Latest commits in PR: ${JSON.stringify(commits.map(c => c.sha), null, 2)}`);
    console.log(`DEBUG: Number of comments to post: ${comments.length}`);
    console.log(`DEBUG: Comment details: ${JSON.stringify(comments.slice(0, 2), null, 2)}`); // Just log first 2 to avoid cluttering logs
  }

  const submitInlineComment = async (
    file: string,
    line: number,
    content: string
  ) => {
    if (process.env.DEBUG) {
      console.log(`DEBUG: Submitting inline comment for file: ${file}, line: ${line}`);
      console.log(`DEBUG: Using commit_id: ${pull_request.headSha}`);
    }
    
    try {
      const response = await octokit.pulls.createReviewComment({
        ...context.repo,
        pull_number: pull_request.number,
        commit_id: pull_request.headSha,
        path: file,
        body: buildComment(content),
        line,
      });
      
      if (process.env.DEBUG) {
        console.log(`DEBUG: Comment created successfully, ID: ${response.data.id}`);
      }
      
      return response;
    } catch (error) {
      const errorDetails = error instanceof Error ? error.message : String(error);
      console.error(`ERROR creating inline comment: ${errorDetails}`);
      if (error instanceof Error && 'response' in error) {
        // @ts-ignore
        console.error(`ERROR response status: ${error.response?.status}, message: ${JSON.stringify(error.response?.data)}`);
      }
      throw error;
    }
  };

  // Handle file comments
  const fileComments = comments.filter((c) => !c.end_line);
  if (fileComments.length > 0) {
    if (process.env.DEBUG) {
      console.log(`DEBUG: Processing ${fileComments.length} file-level comments`);
    }
    
    const responses = await Promise.allSettled(
      fileComments.map((c) => submitInlineComment(c.file, -1, c.content))
    );

    for (const response of responses) {
      if (response.status === "rejected") {
        warning(`error creating file comment: ${response.reason}`);
        console.error("ERROR full details:", response.reason);
      }
    }
  }

  // Handle line comments
  let lineComments = [];
  let skippedComments = [];
  for (const comment of comments) {
    if (comment.critical || comment.label === "typo") {
      lineComments.push(comment);
    } else {
      skippedComments.push(comment);
    }
  }

  if (process.env.DEBUG) {
    console.log(`DEBUG: Processing ${lineComments.length} line comments (${skippedComments.length} non-critical comments skipped)`);
  }

  // Try to submit all comments at once
  try {
    let commentsData = lineComments.map((c) => ({
      path: c.file,
      body: buildComment(c.content),
      line: c.end_line,
      side: "RIGHT",
      start_line:
        c.start_line && c.start_line < c.end_line ? c.start_line : undefined,
      start_side:
        c.start_line && c.start_line < c.end_line ? "RIGHT" : undefined,
    }));

    if (process.env.DEBUG) {
      console.log(`DEBUG: Attempting batch review creation with ${commentsData.length} comments`);
      console.log(`DEBUG: First comment data: ${JSON.stringify(commentsData[0], null, 2)}`);
    }

    const review = await octokit.pulls.createReview({
      ...context.repo,
      pull_number: pull_request.number,
      commit_id: pull_request.headSha,
      comments: commentsData,
    });

    if (process.env.DEBUG) {
      console.log(`DEBUG: Review created successfully, ID: ${review.data.id}`);
    }

    const submitResponse = await octokit.pulls.submitReview({
      ...context.repo,
      pull_number: pull_request.number,
      review_id: review.data.id,
      event: "COMMENT",
      body: buildReviewSummary(
        context,
        files,
        commits,
        lineComments,
        skippedComments
      ),
    });

    if (process.env.DEBUG) {
      console.log(`DEBUG: Review submitted successfully, URL: ${submitResponse.data.html_url}`);
    }
  } catch (error) {
    warning(`error submitting review: ${error}`);
    console.error("ERROR full details:", error);

    if (error instanceof Error && 'response' in error) {
      // @ts-ignore
      console.error(`ERROR response status: ${error.response?.status}, message: ${JSON.stringify(error.response?.data)}`);
    }

    // If submitting all comments at once fails, try submitting them one by one
    info("trying to submit comments one by one");
    const individualResponses = await Promise.allSettled(
      lineComments.map((c) =>
        submitInlineComment(c.file, c.end_line, c.content)
      )
    );
    
    if (process.env.DEBUG) {
      const succeeded = individualResponses.filter(r => r.status === "fulfilled").length;
      const failed = individualResponses.filter(r => r.status === "rejected").length;
      console.log(`DEBUG: Individual comment submission results: ${succeeded} succeeded, ${failed} failed`);
      
      // Log failures
      individualResponses.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(`DEBUG: Comment #${index} failed: ${result.reason}`);
        }
      });
    }
  }
  
  if (process.env.DEBUG) {
    console.log("DEBUG: ===== REVIEW SUBMISSION COMPLETE =====");
  }
}

function shouldIgnorePullRequest(pull_request: { body?: string }) {
  const ignorePhrases = [
    "@presubmit ignore",
    "@presubmit: ignore",
    "@presubmit skip",
    "@presubmit: skip",
    "@presubmitai ignore",
    "@presubmitai: ignore",
    "@presubmitai skip",
    "@presubmitai: skip",
  ];
  const bodyLower = (pull_request.body ?? "").toLowerCase();

  for (const phrase of ignorePhrases) {
    if (bodyLower.includes(phrase.toLowerCase())) {
      info(`ignoring pull request because of '${phrase}' in description`);
      return true;
    }
  }
  return false;
}
