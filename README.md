# Grammar & Style Checker

The recommended Google Docs version is a bound Apps Script sidebar in
[docs-addon/](./docs-addon/). It checks spelling against DictionaryAPI.dev and
does not require an API key.

## Set up the Google Docs spelling checker

This is a script bound to one Google Doc, not a Google Workspace Marketplace
listing.

1. Open the Google Doc where you want the checker.
2. Select **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with
   [`docs-addon/Code.gs`](./docs-addon/Code.gs).
4. Click **+** beside Files, choose **HTML**, name it `Sidebar`, and paste
   [`docs-addon/Sidebar.html`](./docs-addon/Sidebar.html).
5. In Apps Script **Project Settings**, enable **Show "appsscript.json"
   manifest file in editor**, then replace its contents with
   [`docs-addon/appsscript.json`](./docs-addon/appsscript.json).
6. Save the project, return to the Doc, and reload the page.
7. Open **Grammar & Style → Open Spelling Checker** and approve the requested
   Google permissions.
8. Select **Check document spelling**.

## What it checks

- Extracts words from the current Doc and checks each unique word with the
  English endpoint at DictionaryAPI.dev.
- Shows word forms that have no dictionary entry and provides a **Locate**
  button for each.
- Caches lookup results for up to six hours to reduce repeated requests.
- Does not provide replacement suggestions, check grammar, or modify the Doc.

An unrecognized word may be a name, specialist term, inflection, or dictionary
gap rather than a spelling error. Review results before changing text.

## Data handling

DictionaryAPI.dev receives individual unique words, not complete sentences or
the whole document. Lookups happen only when you click **Check document
spelling**. Results are cached in Apps Script's per-user cache. This checker
does not use an API key.

## Browser extension

The root `manifest.json`, `content.js`, and `background.js` are the separate
Chrome/Firefox version, which uses ApyHub for full proofreading. It requires an
ApyHub API key and remains subject to Google Docs' DOM allowlist; details are
in the [extension setup](#browser-extension).

## Development checks

With Node.js installed, validate the Apps Script files and run browser extension
tests:

```sh
node --check < docs-addon/Code.gs
node --check content.js
node --check background.js
node --test tests/*.test.js
```

## License

MIT. See [LICENSE](./LICENSE).
