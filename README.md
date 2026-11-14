# Grammar & Style Checker

A small Chrome and Firefox extension prototype for Google Docs. It checks text
locally for two demo spelling mistakes (`teh` and `adn`) and helps locate or
copy a fix. It is not a full grammar checker.

## Install in Chrome

1. Download or clone this project and keep `manifest.json` and `content.js`
   together in the same folder.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the project folder.
5. Open or reload a Google Docs document, then click **Grammar check** at the
   bottom-right of the page.

To pick up code changes later, return to `chrome://extensions` and click the
extension's **Reload** button, then reload the Docs tab.

## Install temporarily in Firefox

Requires Firefox 140 or newer.

1. Download or clone this project.
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Choose this project's `manifest.json`.
5. Open or reload a Google Docs document, then click **Grammar check** at the
   bottom-right of the page.

Firefox removes temporary add-ons when it closes. Repeat these steps after
restarting Firefox. For persistent Firefox installation or distribution,
the extension needs to be signed by Mozilla.

## Try it

If the extension can read the Docs editor text, add `teh` or `adn` to a
paragraph and click **Grammar check**. Use **Locate** to highlight the match or
**Copy suggestion** to copy its replacement. **Re-scan document** checks the
current document contents again.

## Google Docs access limitation

Google controls whether an extension can read Docs' editor text structure.
This project only reads visible `.kix-lineview-text-block` text when it is
already exposed. It does not and cannot unlock or bypass Google's extension
allowlist. If the panel says **Text is not exposed**, the extension is
installed, but Docs has not made readable text available to it.

## Privacy and permissions

- The extension runs only on `https://docs.google.com/document/*`.
- It checks text locally; it makes no network requests.
- `clipboardWrite` is used only when you click **Copy suggestion**.
- Firefox declares that it collects no data.
- It does not edit the document. Google Docs is not a regular editable HTML
  document, so copying is used instead of unreliable simulated edits.

## License

MIT. See [LICENSE](./LICENSE).
