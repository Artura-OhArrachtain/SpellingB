const DICTIONARY_API_URL_ = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const CACHE_SECONDS_ = 21600;
const CACHE_READ_BATCH_SIZE_ = 100;
const LOOKUP_BATCH_SIZE_ = 10;
const COMMON_CONTRACTIONS_ = new Set([
  "ain't", "aren't", "can't", "could've", "couldn't", "didn't", "doesn't",
  "don't", "hadn't", "hasn't", "haven't", "he'd", "he'll", "he's", "i'd",
  "i'll", "i'm", "i've", "isn't", "it'd", "it'll", "it's", "let's", "might've",
  "mightn't", "must've", "mustn't", "shan't", "she'd", "she'll", "she's",
  "should've", "shouldn't", "that'll", "that's", "there's", "they'd", "they'll",
  "they're", "they've", "wasn't", "we'd", "we'll", "we're", "we've", "weren't",
  "what'll", "what's", "when's", "where's", "who's", "why's", "won't",
  "would've", "wouldn't", "you'd", "you'll", "you're", "you've"
]);

function onOpen() {
  DocumentApp.getUi()
    .createMenu("Grammar & Style")
    .addItem("Open Spelling Checker", "showSpellingChecker")
    .addToUi();
}

function onInstall() {
  onOpen();
}

function showSpellingChecker() {
  const sidebar = HtmlService.createHtmlOutputFromFile("Sidebar")
    .setTitle("English Spelling Checker");
  DocumentApp.getUi().showSidebar(sidebar);
}

function checkDocumentSpelling() {
  const text = DocumentApp.getActiveDocument().getBody().getText();
  if (!text.trim()) {
    throw new Error("The current document has no readable text to check.");
  }

  const words = extractWords_(text);
  if (words.length === 0) {
    return { checkedWords: 0, unrecognizedWords: [] };
  }

  const dictionaryResults = lookupWords_(words.map((word) => word.lookup));
  const unrecognizedWords = words
    .filter((word) => !dictionaryResults[word.lookup])
    .flatMap((word) => groupOccurrences_(word));

  return {
    checkedWords: words.length,
    unrecognizedWords: unrecognizedWords
  };
}

function locateWordOccurrence(word, occurrence) {
  if (typeof word !== "string" ||
      !/^[\p{L}]+(?:['’][\p{L}]+)*$/u.test(word)) {
    throw new Error("Invalid word to locate.");
  }
  if (!Number.isInteger(occurrence) || occurrence < 0 || occurrence > 10000) {
    throw new Error("Invalid occurrence to locate.");
  }

  const pattern = "(?i)\\b" + escapeRegex_(word) + "\\b";
  const document = DocumentApp.getActiveDocument();
  const body = document.getBody();
  let found = null;

  for (let index = 0; index <= occurrence; index++) {
    found = found ? body.findText(pattern, found) : body.findText(pattern);
    if (!found) {
      throw new Error("That word has moved or was removed. Run the spelling check again.");
    }
  }

  const range = document.newRange();
  range.addElement(
    found.getElement(),
    found.getStartOffset(),
    found.getEndOffsetInclusive()
  );
  document.setSelection(range.build());
  return true;
}

function extractWords_(text) {
  const entries = new Map();
  const pattern = /\p{L}+(?:['’]\p{L}+)*/gu;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const original = match[0];
    const normalized = original.toLowerCase().replace(/’/g, "'");
    if (normalized.length < 2 || COMMON_CONTRACTIONS_.has(normalized)) continue;

    const lookup = /'s$/.test(normalized) ? normalized.slice(0, -2) : normalized;
    if (lookup.length < 2) continue;

    if (!entries.has(lookup)) {
      entries.set(lookup, { lookup: lookup, occurrences: [] });
    }
    entries.get(lookup).occurrences.push({
      original: original,
      index: match.index
    });
  }

  return Array.from(entries.values());
}

function groupOccurrences_(entry) {
  const groups = new Map();
  entry.occurrences.forEach((occurrence) => {
    const key = occurrence.original.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { word: occurrence.original, count: 0 });
    }
    groups.get(key).count++;
  });
  return Array.from(groups.values());
}

function lookupWords_(words) {
  const cache = CacheService.getUserCache();
  const cached = {};

  for (let start = 0; start < words.length; start += CACHE_READ_BATCH_SIZE_) {
    const batch = words.slice(start, start + CACHE_READ_BATCH_SIZE_);
    const keys = batch.map((word) => "dictionary-en-" + word);
    Object.assign(cached, cache.getAll(keys));
  }

  const results = {};
  const uncached = [];
  words.forEach((word) => {
    const value = cached["dictionary-en-" + word];
    if (value === "1") {
      results[word] = true;
    } else if (value === "0") {
      results[word] = false;
    } else {
      uncached.push(word);
    }
  });

  for (let start = 0; start < uncached.length; start += LOOKUP_BATCH_SIZE_) {
    const batch = uncached.slice(start, start + LOOKUP_BATCH_SIZE_);
    lookupBatch_(batch, results, cache);
  }

  return results;
}

function lookupBatch_(words, results, cache) {
  let pending = words;
  let attempt = 0;

  while (pending.length > 0) {
    const responses = UrlFetchApp.fetchAll(pending.map((word) => ({
      url: DICTIONARY_API_URL_ + encodeURIComponent(word),
      method: "get",
      muteHttpExceptions: true
    })));
    const retry = [];

    responses.forEach((response, index) => {
      const word = pending[index];
      const status = response.getResponseCode();

      if (status === 404) {
        results[word] = false;
      } else if (status >= 200 && status < 300) {
        let entries;
        try {
          entries = JSON.parse(response.getContentText());
        } catch (error) {
          throw new Error("The dictionary service returned an invalid response.");
        }
        if (!Array.isArray(entries) || entries.length === 0) {
          throw new Error("The dictionary service returned an invalid response.");
        }
        results[word] = true;
      } else if (status === 429 || status >= 500) {
        retry.push(word);
      } else {
        throw new Error(
          "Dictionary lookup failed (HTTP " + status + "). Try again later."
        );
      }
    });

    if (retry.length > 0) {
      attempt++;
      if (attempt > 3) {
        throw new Error("The dictionary service is busy. Try again later.");
      }
      Utilities.sleep(Math.min(1000 * Math.pow(2, attempt - 1), 8000));
      pending = retry;
      continue;
    }

    pending = [];
  }

  const cacheValues = {};
  words.forEach((word) => {
    cacheValues["dictionary-en-" + word] = results[word] ? "1" : "0";
  });
  cache.putAll(cacheValues, CACHE_SECONDS_);
}

function escapeRegex_(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
