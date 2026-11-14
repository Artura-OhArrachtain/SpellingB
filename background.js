const API_URL = "https://api.eu.apyhub.com/sharpapi/proofread-text-grammar-check";
const DOCUMENT_ORIGIN = "https://docs.google.com";
const MAX_WAIT_MS = 120_000;

const extensionApi = globalThis.browser ?? globalThis.chrome;

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "proofread-document") return false;

  if (!isDocsSender(sender) || typeof message.text !== "string" || !message.text.trim()) {
    sendResponse({ ok: false, error: "No readable Google Docs text was provided." });
    return false;
  }

  if (typeof message.token !== "string" || !message.token.trim()) {
    sendResponse({ ok: false, error: "Enter an ApyHub API token to continue." });
    return false;
  }

  proofreadDocument(message.text, message.token.trim())
    .then((correctedText) => sendResponse({ ok: true, correctedText }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "ApyHub proofreading failed."
      });
    });

  return true;
});

function isDocsSender(sender) {
  if (typeof sender.url !== "string") return false;
  try {
    const url = new URL(sender.url);
    return url.origin === DOCUMENT_ORIGIN && url.pathname.startsWith("/document/");
  } catch {
    return false;
  }
}

async function proofreadDocument(text, token) {
  const submitResponse = await apiFetch(API_URL, {
    method: "POST",
    headers: {
      "apy-token": token,
      "content-type": "application/json"
    },
    body: JSON.stringify({ content: text })
  });
  const submitData = await readJson(submitResponse);
  const jobId = submitData?.job_id;
  if (typeof jobId !== "string" || !jobId) {
    throw new Error("ApyHub did not return a proofreading job ID.");
  }

  const deadline = Date.now() + MAX_WAIT_MS;
  let waitMs = 1000;

  while (Date.now() < deadline) {
    await delay(waitMs);
    const statusUrl = `${API_URL}/job/status/${encodeURIComponent(jobId)}`;
    const statusResponse = await apiFetch(statusUrl, {
      method: "GET",
      headers: { "apy-token": token }
    }, { allowRateLimit: true });

    if (statusResponse === null) {
      waitMs = Math.min(waitMs * 2, 8000);
      continue;
    }

    waitMs = 1000;
    const statusData = await readJson(statusResponse);
    const attributes = statusData?.data?.attributes;

    if (attributes?.status === "success") {
      if (typeof attributes.result !== "string") {
        throw new Error("ApyHub returned an invalid proofreading result.");
      }
      return attributes.result;
    }

    if (attributes?.status === "failed") {
      throw new Error("ApyHub could not proofread this text.");
    }

    if (attributes?.status !== "queued" && attributes?.status !== "running") {
      throw new Error("ApyHub returned an unknown proofreading job status.");
    }
  }

  throw new Error("ApyHub proofreading timed out. Try again with a shorter document.");
}

async function apiFetch(url, options, { allowRateLimit = false } = {}) {
  const response = await fetch(url, options);
  if (allowRateLimit && response.status === 429) return null;
  if (response.status === 401) {
    throw new Error("ApyHub rejected the API token. Check it and try again.");
  }
  if (response.status === 429) {
    throw new Error("ApyHub rate limit reached. Wait a little and try again.");
  }
  if (!response.ok) {
    throw new Error(`ApyHub request failed (HTTP ${response.status}).`);
  }
  return response;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error("ApyHub returned an invalid response.");
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
