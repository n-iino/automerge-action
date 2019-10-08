const { ClientError, NeutralExitError, logger } = require("./common");
const { merge } = require("./merge");

const URL_REGEXP = /^https:\/\/github.com\/([^/]+)\/([^/]+)\/(pull|tree)\/([^ ]+)$/;

async function executeLocally(context, url) {
  const { octokit } = context;

  const m = url.match(URL_REGEXP);
  if (m && m[3] === "pull") {
    logger.debug("Getting PR data...");
    const { data: pull_request } = await octokit.pulls.get({
      owner: m[1],
      repo: m[2],
      pull_number: m[4]
    });

    const event = {
      action: "opened",
      pull_request
    };

    await executeGitHubAction(context, "pull_request", event);
  } else if (m && m[3] === "tree") {
    const event = {
      ref: `refs/heads/${m[4]}`,
      repository: {
        name: m[2],
        owner: {
          name: m[1]
        }
      }
    };

    await executeGitHubAction(context, "push", event);
  } else {
    throw new ClientError(`invalid URL: ${url}`);
  }
}

async function executeGitHubAction(context, eventName, eventData) {
  logger.info("Event name:", eventName);
  logger.info("Event data:", eventData);

  if(!eventData.pull_request && eventData.check_suite){
    logger.info("Event is not called by PullRequest");
    throw new NeutralExitError();
  }

  const { octokit } = context;

  let pullRequest = eventData.pull_request;

  if (eventData.check_suite) {
    if (eventData.check_suite.status !== "completed") {
      logger.info("A status check is not yet complete");
      throw new NeutralExitError();
    }

    const data = await octokit.pulls.get({
      owner: eventData.repository.owner.login,
      repo: eventData.repository.name,
      pull_number: eventData.check_suite.pull_requests[0].number
    })

    logger.info("Pull Request data:", data);

    pullRequest = data.data;

  }

  await updateAndMergePullRequest(context, pullRequest);
}

async function updateAndMergePullRequest(context, pullRequest) {
  await merge(context, pullRequest);
}

module.exports = { executeLocally, executeGitHubAction };