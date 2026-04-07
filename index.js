const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const core = require("@actions/core");
const axios = require("axios");

async function validateSubscription() {
  let repoPrivate;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = payload?.repository?.private;
  }
  
  const upstream = 'vimtor/action-zip';
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl = 'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';
  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false) core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');
  if (repoPrivate === false) return;
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const body = { action: action || '' };
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body, { timeout: 3000 }
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      core.error(`\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`);
      core.error(`\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`);
      process.exit(1);
    }
    core.info('Timeout or API not reachable. Continuing to next step.');
  }
}

async function run() {
  await validateSubscription();

  if (!process.env.GITHUB_WORKSPACE) {
    core.setFailed("GITHUB_WORKSPACE environment variable is not set");
    return;
  }

  const files = core.getInput("files");
  const dest = core.getInput("dest");
  const recursive = core.getInput("recursive") === "true";
  const workspace = path.resolve(process.env.GITHUB_WORKSPACE);

  console.log(`Ready to zip "${files}" into ${dest}`);

  const zip = new AdmZip();

  files.split(" ").forEach(fileName => {
    const filePath = path.resolve(workspace, fileName);

    if (!filePath.startsWith(workspace + path.sep) && filePath !== workspace) {
      core.warning(`Skipping '${fileName}': path traversal outside workspace is not allowed`);
      return;
    }

    if (!fs.existsSync(filePath)) {
      console.log(`  - ${fileName} (Not Found)`);
      return;
    }

    const dir = path.dirname(fileName);
    const stats = fs.lstatSync(filePath);

    if (stats.isDirectory()) {
      const zipDir = dir === "." ? fileName : dir;
      zip.addLocalFolder(filePath, !recursive && zipDir);
    } else {
      const zipDir = dir === "." ? "" : dir;
      zip.addLocalFile(filePath, !recursive && zipDir);
    }

    console.log(`  - ${fileName}`);
  });

  const destPath = path.resolve(workspace, dest);

  if (!destPath.startsWith(workspace + path.sep) && destPath !== workspace) {
    core.setFailed(`Destination '${dest}': path traversal outside workspace is not allowed`);
    return;
  }

  zip.writeZip(destPath);

  console.log(`\nZipped file ${dest} successfully`);
}

run();
