const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const backgroundSource = readFile(
  path.join(__dirname, "..", "background.js"),
  "utf8"
);
const docsSender = { url: "https://docs.google.com/document/d/example/edit" };

async function loadBackground(responses) {
  const requests = [];
  const delays = [];
  let messageListener;

  const source = await backgroundSource;
  const context = {
    URL,
    browser: {
      runtime: {
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          }
        }
      }
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      const next = responses.shift();
      if (!next) throw new Error("Unexpected API request");
      return {
        status: next.status,
        ok: next.status >= 200 && next.status < 300,
        json: async () => next.body
      };
    },
    setTimeout(callback, milliseconds) {
      delays.push(milliseconds);
      queueMicrotask(callback);
      return 0;
    }
  };

  vm.runInNewContext(source, context, { filename: "background.js" });

  return {
    requests,
    delays,
    send(message, sender = docsSender) {
      return new Promise((resolve) => {
        const keepChannelOpen = messageListener(message, sender, resolve);
        if (!keepChannelOpen) resolve(null);
      });
    }
  };
}

test("submits text and polls until ApyHub returns corrected text", async () => {
  const background = await loadBackground([
    { status: 200, body: { job_id: "job-id" } },
    { status: 200, body: { data: { attributes: { status: "running" } } } },
    {
      status: 200,
      body: { data: { attributes: { status: "success", result: "Corrected text." } } }
    }
  ]);

  const response = await background.send({
    type: "proofread-document",
    token: "test-api-token",
    text: "Text to proofread."
  });

  assert.equal(response.ok, true);
  assert.equal(response.correctedText, "Corrected text.");
  assert.equal(background.requests.length, 3);
  assert.equal(background.requests[0].options.method, "POST");
  assert.equal(background.requests[0].options.headers["apy-token"], "test-api-token");
  assert.deepEqual(JSON.parse(background.requests[0].options.body), {
    content: "Text to proofread."
  });
  assert.equal(background.delays.every((delay) => delay >= 1000), true);
});

test("rejects requests that did not come from Google Docs", async () => {
  const background = await loadBackground([]);
  const response = await background.send({
    type: "proofread-document",
    token: "test-api-token",
    text: "Text."
  }, { url: "https://example.com/" });

  assert.equal(response.ok, false);
  assert.equal(background.requests.length, 0);
});

test("reports invalid ApyHub credentials without logging or retrying", async () => {
  const background = await loadBackground([
    { status: 401, body: { error: "unauthorized" } }
  ]);

  const response = await background.send({
    type: "proofread-document",
    token: "invalid-token",
    text: "Text."
  });

  assert.equal(response.ok, false);
  assert.match(response.error, /rejected the API token/i);
  assert.equal(background.requests.length, 1);
});
