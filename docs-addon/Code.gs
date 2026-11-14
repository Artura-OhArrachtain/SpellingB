const APYHUB_API_URL_ =
  "https://api.eu.apyhub.com/sharpapi/proofread-text-grammar-check";
const APYHUB_TOKEN_PROPERTY_ = "APYHUB_API_TOKEN";
const JOB_TIMEOUT_MS_ = 120000;

function onOpen() {
  DocumentApp.getUi()
    .createMenu("Grammar & Style")
    .addItem("Open English Proofreader", "showProofreader")
    .addToUi();
}

function onInstall() {
  onOpen();
}

function showProofreader() {
  const sidebar = HtmlService.createHtmlOutputFromFile("Sidebar")
    .setTitle("English Proofreader");
  DocumentApp.getUi().showSidebar(sidebar);
}

function getSidebarState() {
  return {
    hasToken: Boolean(
      PropertiesService.getUserProperties().getProperty(APYHUB_TOKEN_PROPERTY_)
    )
  };
}

function saveApyHubToken(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Paste an ApyHub API token before saving.");
  }

  PropertiesService.getUserProperties()
    .setProperty(APYHUB_TOKEN_PROPERTY_, token.trim());
  return getSidebarState();
}

function forgetApyHubToken() {
  PropertiesService.getUserProperties()
    .deleteProperty(APYHUB_TOKEN_PROPERTY_);
  return getSidebarState();
}

function proofreadCurrentDocument() {
  const token = PropertiesService.getUserProperties()
    .getProperty(APYHUB_TOKEN_PROPERTY_);
  if (!token) {
    throw new Error("Save your ApyHub API token before proofreading.");
  }

  const document = DocumentApp.getActiveDocument();
  const text = document.getBody().getText();
  if (!text.trim()) {
    throw new Error("The current document has no readable text to proofread.");
  }

  const submit = fetchApyHubJson_(APYHUB_API_URL_, {
    method: "post",
    contentType: "application/json",
    headers: { "apy-token": token },
    payload: JSON.stringify({ content: text })
  });
  if (submit.statusCode === 429) {
    throw new Error("ApyHub rate limit reached. Wait a little and try again.");
  }

  const jobId = submit.data && submit.data.job_id;
  if (typeof jobId !== "string" || !jobId) {
    throw new Error("ApyHub did not return a proofreading job ID.");
  }

  const deadline = Date.now() + JOB_TIMEOUT_MS_;
  let waitMs = 1000;

  while (Date.now() < deadline) {
    Utilities.sleep(waitMs);
    const statusUrl = APYHUB_API_URL_ + "/job/status/" + encodeURIComponent(jobId);
    const statusResponse = fetchApyHubJson_(statusUrl, {
      method: "get",
      headers: { "apy-token": token }
    });

    if (statusResponse.statusCode === 429) {
      waitMs = Math.min(waitMs * 2, 8000);
      continue;
    }

    waitMs = 1000;
    const attributes = statusResponse.data &&
      statusResponse.data.data &&
      statusResponse.data.data.attributes;

    if (attributes && attributes.status === "success") {
      if (typeof attributes.result !== "string") {
        throw new Error("ApyHub returned an invalid proofreading result.");
      }
      return attributes.result;
    }

    if (attributes && attributes.status === "failed") {
      throw new Error("ApyHub could not proofread this document.");
    }

    if (!attributes ||
        (attributes.status !== "queued" && attributes.status !== "running")) {
      throw new Error("ApyHub returned an unknown proofreading job status.");
    }
  }

  throw new Error("Proofreading timed out. Try again with a shorter document.");
}

function fetchApyHubJson_(url, options) {
  const response = UrlFetchApp.fetch(url, Object.assign({}, options, {
    muteHttpExceptions: true
  }));
  const statusCode = response.getResponseCode();

  if (statusCode === 429) {
    return { statusCode: statusCode, data: null };
  }
  if (statusCode === 401) {
    throw new Error("ApyHub rejected the API token. Check it and try again.");
  }
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error("ApyHub request failed (HTTP " + statusCode + ").");
  }

  let data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error("ApyHub returned an invalid response.");
  }
  return { statusCode: statusCode, data: data };
}
