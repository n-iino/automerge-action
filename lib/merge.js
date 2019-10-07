const { NeutralExitError, logger, retry } = require("./common");

const RETRY_SLEEP = 10000;

async function merge(context, pullRequest) {
  const {
    octokit,
    config: { mergeMethod }
  } = context;

  await tryMerge(octokit, pullRequest, mergeMethod);

  logger.info("PR successfully merged!");

  const { data: branch } = await octokit.repos.getBranch({
    owner: pullRequest.head.repo.owner.login,
    repo: pullRequest.head.repo.name,
    branch: pullRequest.head.ref
  });

  logger.trace("Branch:", branch);

  if (branch.protected) {
    logger.info("Branch is protected and cannot be deleted:", branch.name);
  } else {
    logger.debug("Deleting branch", branch.name, "...");
    await octokit.git.deleteRef({
      owner: pullRequest.head.repo.owner.login,
      repo: pullRequest.head.repo.name,
      ref: `heads/${branch.name}`
    });

    logger.info("Merged branch has been deleted:", branch.name);
  }
}

async function tryMerge(octokit, pullRequest, mergeMethod) {
  const retries = 3;
  await retry(
    retries,
    RETRY_SLEEP,
    () => mergePullRequest(octokit, pullRequest, mergeMethod),
    () => mergePullRequest(octokit, pullRequest, mergeMethod),
    () => {
      logger.info("PR could not be merged after", retries, "tries");
      throw new NeutralExitError();
    }
  );
}

async function mergePullRequest(octokit, pullRequest, mergeMethod) {
  try {
    await octokit.pulls.merge({
      owner: pullRequest.head.repo.owner.login,
      repo: pullRequest.head.repo.name,
      pull_number: pullRequest.number,
      sha: pullRequest.head.sha,
      merge_method: mergeMethod
    });
    return true;
  } catch (e) {
    logger.info("Failed to merge PR:", e.message);
    return false;
  }
}

module.exports = { merge };
