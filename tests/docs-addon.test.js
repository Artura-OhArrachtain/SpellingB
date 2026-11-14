const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptSource = readFile(
  path.join(__dirname, "..", "docs-addon", "Code.gs"),
  "utf8"
);

async function loadAddOn(text, missingWords = []) {
  const cachedValues = new Map();
  const requests = [];
  let selectedRange = null;
  const textElement = {};

  const body = {
    getText: () => text,
    findText(pattern, previous) {
      const startAt = previous ? previous.getEndOffsetInclusive() + 1 : 0;
      const expression = new RegExp(pattern.replace("(?i)", ""), "gi");
      expression.lastIndex = startAt;
      const match = expression.exec(text);
      if (!match) return null;

      const start = match.index;
      const end = start + match[0].length - 1;
      return {
        getElement: () => textElement,
        getStartOffset: () => start,
        getEndOffsetInclusive: () => end
      };
    }
  };

  const document = {
    getBody: () => body,
    newRange() {
      let startOffset;
      let endOffset;
      return {
        addElement(_element, start, end) {
          startOffset = start;
          endOffset = end;
        },
        build() {
          return { startOffset, endOffset };
        }
      };
    },
    setSelection(range) {
      selectedRange = range;
    }
  };

  const context = {
    DocumentApp: { getActiveDocument: () => document },
    CacheService: {
      getUserCache: () => ({
        getAll(keys) {
          const values = {};
          keys.forEach((key) => {
            if (cachedValues.has(key)) values[key] = cachedValues.get(key);
          });
          return values;
        },
        putAll(values) {
          Object.entries(values).forEach(([key, value]) => {
            cachedValues.set(key, value);
          });
        }
      })
    },
    UrlFetchApp: {
      fetchAll(batch) {
        return batch.map((request) => {
          requests.push(request.url);
          const word = decodeURIComponent(new URL(request.url).pathname.split("/").pop());
          const status = missingWords.includes(word) ? 404 : 200;
          return {
            getResponseCode: () => status,
            getContentText: () => JSON.stringify(status === 200 ? [{ word }] : {})
          };
        });
      }
    },
    Utilities: { sleep() {} }
  };

  const source = await scriptSource;
  vm.runInNewContext(source, context, { filename: "docs-addon/Code.gs" });
  return {
    context,
    requests,
    getSelectedRange: () => selectedRange
  };
}

test("checks unique English words and returns repeated dictionary misses", async () => {
  const addOn = await loadAddOn("The teh, teh dog’s don't naïve.", ["teh"]);
  const result = addOn.context.checkDocumentSpelling();

  assert.equal(result.checkedWords, 4);
  assert.equal(result.unrecognizedWords.length, 1);
  assert.equal(result.unrecognizedWords[0].word, "teh");
  assert.equal(result.unrecognizedWords[0].count, 2);
  assert.equal(addOn.requests.length, 4);

  addOn.context.checkDocumentSpelling();
  assert.equal(addOn.requests.length, 4);
});

test("locates the requested occurrence of a word in the document", async () => {
  const addOn = await loadAddOn("teh, then teh.");
  addOn.context.locateWordOccurrence("teh", 1);

  assert.deepEqual(addOn.getSelectedRange(), { startOffset: 10, endOffset: 12 });
});
