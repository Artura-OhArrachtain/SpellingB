# Grammar & Style Checker

A prototype Chrome extension that adds a small checker panel to Google Docs.
The current checker is a local demonstration for two common typos; it is not
a full grammar service.

## Features

- Floating checker UI isolated from Docs styles with a Shadow DOM.
- Scans visible Docs text nodes when the editor exposes them to the extension.
- Demo checks for `teh` → `the` and `adn` → `and`.
- Locates a match with an on-screen highlight and copies its suggestion.
- Does not send document contents to a server or directly edit the document.

## Install for local testing

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this project directory.
4. Open or reload a Google Docs document and select **Grammar check**.

## Permissions and privacy

- The content script is limited to `https://docs.google.com/document/*`.
- `clipboardWrite` is used only when you select **Copy suggestion**.
- There are no network requests, analytics, or external dependencies.
- Document text is processed locally by the demo checker.

## Limitations

Google controls whether the Docs editor exposes its text structure to an
extension. If the required text nodes are unavailable, scanning cannot proceed.
This project does not attempt to bypass Google's extension allowlist.

Docs is not a regular editable HTML document, so the prototype does not apply
changes directly. It also does not currently provide a live grammar API,
background scanning, or comprehensive language/style rules.

## Development checks

With Node.js installed, validate the script and manifest:

```sh
node --check content.js
node -e "JSON.parse(require('node:fs').readFileSync('manifest.json', 'utf8'))"
```

## License

Licensed under the [MIT License](./LICENSE).
