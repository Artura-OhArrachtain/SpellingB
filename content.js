(() => {
  const HOST_ID = "grammar-style-checker-host";
  const BLOCK_SELECTOR = ".kix-lineview-text-block";
  const issuePattern = /\b(teh|adn)\b/gi;
  const replacements = { teh: "the", adn: "and" };

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
        width: 340px; max-height: min(70vh, 620px); overflow: auto;
        background: white; border: 1px solid #dadce0; border-radius: 12px;
        box-shadow: 0 4px 18px #0003;
      }
      .header { padding: 16px; border-bottom: 1px solid #eee; }
      h2 { margin: 0 0 4px; font-size: 16px; }
      .subtitle, .message { color: #5f6368; }
      .content { padding: 12px 16px; }
      .issue { padding: 12px 0; border-bottom: 1px solid #eee; }
      .issue:last-child { border-bottom: 0; }
      .rule { color: #5f6368; font-size: 12px; }
      .suggestion { margin: 4px 0; font-weight: 600; overflow-wrap: anywhere; }
      .actions { display: flex; gap: 8px; margin-top: 8px; }
      button.action, button.rescan {
        border: 1px solid #dadce0; border-radius: 6px; padding: 7px 10px;
        background: white; color: #1a73e8; cursor: pointer;
      }
      button.action.primary { background: #1a73e8; color: white; border-color: #1a73e8; }
      button.rescan { margin-top: 12px; }
      .notice { padding: 12px 0; color: #5f6368; }
      .highlight {
        position: fixed; z-index: 1; pointer-events: none;
        border: 2px solid #fbbc04; border-radius: 3px;
        background: #fbbc0433;
      }
      [hidden] { display: none !important; }
    </style>
    <button class="launcher" type="button">Grammar check</button>
    <section class="panel" aria-label="Grammar suggestions" hidden>
      <header class="header">
        <h2>Grammar Suggestions</h2>
        <div class="subtitle" aria-live="polite">Ready to scan</div>
      </header>
      <div class="content">
        <div class="results"></div>
        <button class="rescan" type="button">Re-scan document</button>
      </div>
    </section>
    <div class="highlights" aria-hidden="true"></div>
  `;

  const launcher = shadow.querySelector(".launcher");
  const panel = shadow.querySelector(".panel");
  const subtitle = shadow.querySelector(".subtitle");
  const results = shadow.querySelector(".results");
  const highlights = shadow.querySelector(".highlights");
  let activeRange = null;
  let highlightFrame = 0;

  launcher.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) scan();
  });
  shadow.querySelector(".rescan").addEventListener("click", scan);

  function getVisibleTextBlocks() {
    return Array.from(document.querySelectorAll(BLOCK_SELECTOR))
      .filter((block) => block.getClientRects().length > 0);
  }

  function getTextNodes(block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    return nodes;
  }

  function createRange(nodes, start, end) {
    let offset = 0;
    let startNode;
    let endNode;
    let startOffset = 0;
    let endOffset = 0;

    for (const node of nodes) {
      const length = node.nodeValue.length;
      if (!startNode && start < offset + length) {
        startNode = node;
        startOffset = start - offset;
      }
      if (end <= offset + length) {
        endNode = node;
        endOffset = end - offset;
        break;
      }
      offset += length;
    }

    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function mockGrammarCheck(blockRanges) {
    const issues = [];
    for (const { text: blockText, nodes } of blockRanges) {
      issuePattern.lastIndex = 0;
      let match;
      while ((match = issuePattern.exec(blockText)) !== null) {
        const range = createRange(nodes, match.index, match.index + match[0].length);
        if (!range) continue;

        const key = match[0].toLowerCase();
        const replacement = replacements[key];
        issues.push({
          original: match[0],
          suggestion: match[0][0] === match[0][0].toUpperCase()
            ? replacement[0].toUpperCase() + replacement.slice(1)
            : replacement,
          ruleName: "Spelling (local demo)",
          message: "Possible spelling mistake.",
          range
        });
      }
    }
    return issues;
  }

  function scan() {
    clearHighlights();
    const blocks = getVisibleTextBlocks();
    if (blocks.length === 0) {
      subtitle.textContent = "Text is not exposed";
      results.replaceChildren(makeNotice(
        "Google Docs has not exposed readable editor text to this extension. " +
        "This checker does not try to bypass Google's extension allowlist."
      ));
      return;
    }

    const blockRanges = blocks.map((block) => {
      const nodes = getTextNodes(block);
      return { nodes, text: nodes.map((node) => node.nodeValue).join("") };
    }).filter((block) => block.text.length > 0);

    const issues = mockGrammarCheck(blockRanges);
    subtitle.textContent = `${issues.length} issue${issues.length === 1 ? "" : "s"} found`;
    results.replaceChildren();

    if (issues.length === 0) {
      results.append(makeNotice("No spelling or grammar issues found."));
      return;
    }

    for (const issue of issues) {
      results.append(makeIssueCard(issue));
    }
  }

  function makeIssueCard(issue) {
    const card = document.createElement("article");
    card.className = "issue";

    const rule = document.createElement("div");
    rule.className = "rule";
    rule.textContent = issue.ruleName;

    const suggestion = document.createElement("div");
    suggestion.className = "suggestion";
    suggestion.textContent = `${issue.original} → ${issue.suggestion}`;

    const message = document.createElement("div");
    message.className = "message";
    message.textContent = issue.message;

    const actions = document.createElement("div");
    actions.className = "actions";
    const locate = document.createElement("button");
    locate.className = "action";
    locate.type = "button";
    locate.textContent = "Locate";
    locate.addEventListener("click", () => showHighlight(issue.range));

    const copy = document.createElement("button");
    copy.className = "action primary";
    copy.type = "button";
    copy.textContent = "Copy suggestion";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(issue.suggestion);
        copy.textContent = "Copied";
      } catch (error) {
        copy.textContent = "Copy unavailable";
        console.error("Could not copy suggestion to clipboard.", error);
      }
    });

    actions.append(locate, copy);
    card.append(rule, suggestion, message, actions);
    return card;
  }

  function makeNotice(text) {
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.textContent = text;
    return notice;
  }

  function showHighlight(range) {
    clearHighlights();
    if (!range.startContainer.isConnected) {
      subtitle.textContent = "Text changed; re-scan the document";
      return;
    }

    activeRange = range;
    const target = range.startContainer.parentElement;
    target?.scrollIntoView({ block: "center", behavior: "auto" });
    scheduleHighlightRender();
  }

  function clearHighlights() {
    activeRange = null;
    highlights.replaceChildren();
  }

  function scheduleHighlightRender() {
    if (highlightFrame) return;
    highlightFrame = requestAnimationFrame(() => {
      highlightFrame = 0;
      renderHighlight();
    });
  }

  function renderHighlight() {
    highlights.replaceChildren();
    if (!activeRange || !activeRange.startContainer.isConnected) {
      activeRange = null;
      return;
    }

    for (const rect of activeRange.getClientRects()) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      const marker = document.createElement("div");
      marker.className = "highlight";
      marker.style.left = `${rect.left}px`;
      marker.style.top = `${rect.top}px`;
      marker.style.width = `${rect.width}px`;
      marker.style.height = `${rect.height}px`;
      highlights.append(marker);
    }
  }

  window.addEventListener("scroll", scheduleHighlightRender, { passive: true, capture: true });
  window.addEventListener("resize", scheduleHighlightRender, { passive: true });
})();
