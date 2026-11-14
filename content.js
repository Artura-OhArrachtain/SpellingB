(() => {
  const HOST_ID = "grammar-style-checker-host";
  const BLOCK_SELECTOR = ".kix-lineview-text-block";

  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .launcher, .panel {
        color: #202124;
        font: 14px/1.45 Arial, sans-serif;
      }
      .launcher {
        position: fixed; right: 24px; bottom: 24px; z-index: 2;
        border: 0; border-radius: 24px; padding: 12px 18px;
        background: #1a73e8; color: white; font-weight: 600;
        box-shadow: 0 2px 8px #0003; cursor: pointer;
      }
      .panel {
        position: fixed; right: 24px; bottom: 82px; z-index: 2;
        width: min(380px, calc(100vw - 32px));
        max-height: min(78vh, 700px); overflow: auto;
        background: white; border: 1px solid #dadce0; border-radius: 12px;
        box-shadow: 0 4px 18px #0003;
      }
      .header { padding: 16px; border-bottom: 1px solid #eee; }
      h2 { margin: 0 0 4px; font-size: 16px; }
      .subtitle, .help, .message { color: #5f6368; }
      .help { margin: 8px 0; font-size: 12px; }
      .content { padding: 12px 16px; }
      label { display: block; margin: 0 0 5px; font-weight: 600; }
      input, textarea { width: 100%; font: inherit; }
      input {
        border: 1px solid #dadce0; border-radius: 6px; padding: 9px;
      }
      textarea {
        min-height: 220px; resize: vertical; border: 1px solid #dadce0;
        border-radius: 6px; padding: 10px; white-space: pre-wrap;
      }
      button.action, button.rescan {
        border: 1px solid #dadce0; border-radius: 6px; padding: 8px 11px;
        background: white; color: #1a73e8; cursor: pointer;
      }
      button.primary { background: #1a73e8; color: white; border-color: #1a73e8; }
      button:disabled { cursor: progress; opacity: .65; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .notice { margin: 12px 0; color: #5f6368; white-space: pre-wrap; }
      .result { margin-top: 16px; }
      .result[hidden], [hidden] { display: none !important; }
    </style>
    <button class="launcher" type="button">Grammar check</button>
    <section class="panel" aria-label="Grammar checker" hidden>
      <header class="header">
        <h2>English Proofreader</h2>
        <div class="subtitle" aria-live="polite">Ready to check</div>
      </header>
      <div class="content">
        <label for="apy-token">ApyHub API token</label>
        <input id="apy-token" type="password" autocomplete="off"
          placeholder="Paste your ApyHub API token">
        <p class="help">
          The token is kept only in this tab and is not saved. Checking sends
          the readable document text to ApyHub (EU); API usage may be billed.
        </p>
        <p class="notice">
          ApyHub returns a corrected version of the text, not inline issue locations.
          Review the result before copying it into Docs.
        </p>
        <div class="actions">
          <button class="action primary check" type="button">Send text to ApyHub</button>
          <button class="rescan" type="button" hidden>Check again</button>
        </div>
        <div class="result" hidden>
          <label for="corrected-text">Corrected text</label>
          <textarea id="corrected-text" readonly></textarea>
          <div class="actions">
            <button class="action copy" type="button">Copy corrected text</button>
          </div>
        </div>
        <div class="notice status" role="status" aria-live="polite"></div>
      </div>
    </section>
  `;

  const launcher = shadow.querySelector(".launcher");
  const panel = shadow.querySelector(".panel");
  const tokenInput = shadow.querySelector("#apy-token");
  const checkButton = shadow.querySelector(".check");
  const rescanButton = shadow.querySelector(".rescan");
  const resultSection = shadow.querySelector(".result");
  const correctedText = shadow.querySelector("#corrected-text");
  const status = shadow.querySelector(".status");

  launcher.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) tokenInput.focus();
  });
  checkButton.addEventListener("click", scan);
  rescanButton.addEventListener("click", scan);
  shadow.querySelector(".copy").addEventListener("click", copyCorrectedText);

  async function scan() {
    const token = tokenInput.value.trim();
    if (!token) {
      status.textContent = "Enter your ApyHub API token first.";
      tokenInput.focus();
      return;
    }

    const text = readExposedDocumentText();
    if (text === null) {
      status.textContent =
        "Google Docs has not exposed readable text to this extension. " +
        "This checker does not bypass Google's extension allowlist.";
      resultSection.hidden = true;
      return;
    }
    if (!text.trim()) {
      status.textContent = "No readable document text was found.";
      resultSection.hidden = true;
      return;
    }

    setBusy(true);
    status.textContent = "Sending readable document text to ApyHub for proofreading…";
    resultSection.hidden = true;

    try {
      const result = await requestProofread(token, text);
      correctedText.value = result;
      resultSection.hidden = false;
      status.textContent = "Proofreading complete. Review the corrected text before copying.";
    } catch (error) {
      status.textContent = error instanceof Error
        ? error.message
        : "Proofreading failed. Try again.";
    } finally {
      setBusy(false);
    }
  }

  function readExposedDocumentText() {
    const blocks = Array.from(document.querySelectorAll(BLOCK_SELECTOR))
      .filter((block) => block.getClientRects().length > 0);

    if (blocks.length === 0) return null;

    return blocks.map((block) => {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      const parts = [];
      while (walker.nextNode()) {
        parts.push(walker.currentNode.nodeValue);
      }
      return parts.join("");
    }).filter((blockText) => blockText.length > 0).join("\n");
  }

  function requestProofread(token, text) {
    const message = { type: "proofread-document", token, text };
    if (globalThis.browser?.runtime?.sendMessage) {
      return globalThis.browser.runtime.sendMessage(message).then(readMessageResponse);
    }

    const extensionApi = globalThis.chrome;
    if (!extensionApi?.runtime?.sendMessage) {
      return Promise.reject(new Error("The extension background service is unavailable."));
    }

    return new Promise((resolve, reject) => {
      extensionApi.runtime.sendMessage(message, (response) => {
        const runtimeError = extensionApi.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        try {
          resolve(readMessageResponse(response));
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  function readMessageResponse(response) {
    if (!response?.ok) {
      throw new Error(response?.error || "ApyHub proofreading failed.");
    }
    if (typeof response.correctedText !== "string") {
      throw new Error("ApyHub returned an invalid proofreading result.");
    }
    return response.correctedText;
  }

  async function copyCorrectedText() {
    try {
      await navigator.clipboard.writeText(correctedText.value);
      status.textContent = "Corrected text copied.";
    } catch (error) {
      status.textContent = "Could not copy the corrected text. Select it in the box and copy manually.";
      console.error("Could not copy corrected text.", error);
    }
  }

  function setBusy(busy) {
    checkButton.disabled = busy;
    rescanButton.disabled = busy;
    tokenInput.disabled = busy;
    checkButton.hidden = busy;
    rescanButton.hidden = !busy;
    rescanButton.textContent = busy ? "Checking…" : "Check again";
  }
})();
