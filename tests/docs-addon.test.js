const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptSource = readFile(
  path.join(__dirname, "..", "docs-addon", "Code.gs"),
  "utf8"
);

async function loadAddOn(text, missingWords = [], options = {}) {
  const cachedValues = new Map();
  const savedProperties = new Map();
  const requests = [];
  const synonymRequests = [];
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
    PropertiesService: {
      getUserProperties: () => ({
        getProperty: (key) => savedProperties.get(key) || null,
        setProperties(values) {
          Object.entries(values).forEach(([key, value]) => {
            savedProperties.set(key, value);
          });
        },
        deleteProperty(key) {
          savedProperties.delete(key);
        }
      })
    },
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
      fetch(url) {
        synonymRequests.push(url);
        const response = options.synonymResponse || {
          status: 200,
          body: JSON.stringify({ results: { result: [] } })
        };
        return {
          getResponseCode: () => response.status,
          getContentText: () => response.body
        };
      },
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
    synonymRequests,
    savedProperties,
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

test("stores STANDS4 credentials and parses deduplicated synonyms", async () => {
  const addOn = await loadAddOn("", [], {
    synonymResponse: {
      status: 200,
      body: JSON.stringify({
        results: {
          result: [
            { synonym: "joyful" },
            { synonym: "cheerful" },
            { synonym: "joyful" }
          ]
        }
      })
    }
  });

  const savedState = addOn.context.saveStands4Credentials("user 1", "secret+token");
  assert.equal(savedState.hasStands4Credentials, true);

  const result = addOn.context.findSynonyms("happy");
  assert.equal(result.word, "happy");
  assert.deepEqual(Array.from(result.synonyms), ["joyful", "cheerful"]);

  const requestUrl = new URL(addOn.synonymRequests[0]);
  assert.equal(requestUrl.searchParams.get("uid"), "user 1");
  assert.equal(requestUrl.searchParams.get("tokenid"), "secret+token");
  assert.equal(requestUrl.searchParams.get("word"), "happy");
  assert.equal(requestUrl.searchParams.get("format"), "json");
});

test("reports STANDS4 credential rejection instead of returning empty results", async () => {
  const addOn = await loadAddOn("", [], {
    synonymResponse: {
      status: 200,
      body: JSON.stringify({ error: "Invalid Token" })
    }
  });
  addOn.context.saveStands4Credentials("uid", "bad-token");

  assert.throws(
    () => addOn.context.findSynonyms("happy"),
    /STANDS4 rejected the UID or token ID/
  );
});

test("returns an empty synonym list when STANDS4 has no matches", async () => {
  const addOn = await loadAddOn("");
  addOn.context.saveStands4Credentials("uid", "token");

  const result = addOn.context.findSynonyms("happy");
  assert.equal(result.word, "happy");
  assert.deepEqual(Array.from(result.synonyms), []);
  assert.equal(
    addOn.context.forgetStands4Credentials().hasStands4Credentials,
    false
  );
});
