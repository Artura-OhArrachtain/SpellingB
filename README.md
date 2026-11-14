# Grammar & Style Checker

A minimal Chrome Manifest V3 extension prototype for Google Docs. It injects a
floating checker button and renders its panel inside a closed Shadow DOM so
Docs styles do not leak into the interface.

## Load the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this folder.
4. Open or reload a Google Docs document and select **Grammar check**.

## Current behavior

- Reads visible `.kix-lineview-text-block` text only if Docs exposes those DOM
  nodes to the extension.
- Runs a local demo check for `teh` and `adn`.
- Locates matches with a visual highlight and copies a suggested replacement.
- Does not send document text to a service or directly edit the document.
- Requests Chrome's `clipboardWrite` permission for the copy action.

Google controls access to the Docs editor's text DOM. This extension does not
try to circumvent that access control; if the text is unavailable, the panel
reports that limitation. Google Docs' internal editor is not a normal editable
DOM, so copying a suggestion is used instead of pretending to apply a reliable
in-place correction.
