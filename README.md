# Grammar & Style Checker

The recommended Google Docs version is a bound Apps Script sidebar in
[docs-addon/](./docs-addon/). It checks spelling with DictionaryAPI.dev and
provides optional synonym lookups through STANDS4.

## Set up the Google Docs checker

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
7. Open **Grammar & Style → Open Spelling & Thesaurus** and approve the
   requested Google permissions.
8. Select **Check document spelling** to check spelling.
9. To use synonym lookup, enter your STANDS4 UID and token ID in the sidebar,
   select **Save credentials**, then enter a word and select **Find synonyms**.

STANDS4 credentials are optional and are stored in your Apps Script user
properties. Do not put credentials in the script source or commit them to
GitHub. Use **Forget saved credentials** to remove them from your account.

## What it checks

- Extracts words from the current Doc and checks each unique word with the
  English endpoint at DictionaryAPI.dev.
- Shows word forms that have no dictionary entry and provides a **Locate**
  button for each.
- Caches dictionary lookup results for up to six hours.
- Offers an explicit STANDS4 synonym lookup for a word you enter.
- Does not provide spelling replacements, check grammar, or modify the Doc.

An unrecognized word may be a name, specialist term, inflection, or dictionary
gap rather than a spelling error. Synonyms may not fit the meaning or tone of
your sentence, so review them in context.

## Data handling

DictionaryAPI.dev receives individual unique words, not complete sentences or
the whole document. Lookups happen only when you click **Check document
spelling**. Results are cached in Apps Script's per-user cache. Dictionary
lookups do not use an API key.

STANDS4 receives only the word entered for a synonym lookup. Its UID and token
ID are sent as URL query parameters, so the token ID may be visible in URL logs
handled by STANDS4 or network infrastructure. STANDS4 credentials are stored in
your Apps Script user properties; do not share them or include them in code.

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
