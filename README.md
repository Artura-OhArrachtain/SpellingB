# Grammar & Style Checker

This repository includes a Google Docs-bound Apps Script sidebar and a Chrome/
Firefox extension. For a Docs-native workflow that can read the active
document through `DocumentApp`, use the Apps Script version in [docs-addon/](./docs-addon/).

## Set up the Google Docs sidebar

This is a bound Apps Script project for your own Docs, not a Marketplace
listing. No browser extension or Google Docs DOM allowlisting is needed.

1. Open the Google Doc where you want the checker.
2. Select **Extensions → Apps Script**.
3. In `Code.gs`, replace the starter content with
   [`docs-addon/Code.gs`](./docs-addon/Code.gs).
4. Click **+** beside Files, choose **HTML**, name it `Sidebar`, and paste
   [`docs-addon/Sidebar.html`](./docs-addon/Sidebar.html).
5. In Apps Script **Project Settings**, enable **Show "appsscript.json"
   manifest file in editor**, then replace its contents with
   [`docs-addon/appsscript.json`](./docs-addon/appsscript.json).
6. Save the project, return to the Doc, and reload the page.
7. Open **Grammar & Style → Open English Proofreader** and approve the
   requested Google permissions.
8. Paste a fresh ApyHub **API token** into the sidebar and choose **Save
   token**. Then choose **Proofread current document**.

The token is stored in Apps Script **User Properties** for your account, not
in the document or source files. Use **Forget saved token** to remove it. The
API token must be an ApyHub `apy-token` key; it is not the MCP Bearer token.

## What the Docs sidebar does

- Reads the active document text using `DocumentApp`.
- Sends the text to ApyHub only when you click **Proofread current document**.
- Shows the full corrected text; use **Select text to copy** and paste it into
  Docs yourself.
- Does not modify the document automatically.

ApyHub returns a corrected version rather than individual issue locations, so
the add-on cannot underline or locate specific changes. The endpoint does not
provide an English dialect setting. ApyHub usage may be billed; check your
account's current plan and pricing.

## Data handling

The document text and API token are sent over HTTPS to ApyHub's EU endpoint
when you start proofreading. Do not send confidential text unless you are
comfortable with ApyHub processing it. The add-on does not log the token or
save the document text.

## Browser extension

The root `manifest.json`, `content.js`, and `background.js` are the separate
Chrome/Firefox extension version. It reads only Docs text that Google exposes
to the extension and cannot bypass Google's allowlist. The Apps Script sidebar
is the recommended option for the full active document.

## Tests

With Node.js installed, validate the browser extension and its API job flow:

```sh
node --check content.js
node --check background.js
node --test tests/*.test.js
```

## License

MIT. See [LICENSE](./LICENSE).
