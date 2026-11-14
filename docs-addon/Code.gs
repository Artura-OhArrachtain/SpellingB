const DICTIONARY_API_URL_ = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const STANDS4_SYNONYM_API_URL_ = "https://www.stands4.com/services/v2/syno.php";
const CACHE_SECONDS_ = 21600;
const CACHE_READ_BATCH_SIZE_ = 100;
const LOOKUP_BATCH_SIZE_ = 10;
const STANDS4_UID_PROPERTY_ = "STANDS4_UID";
const STANDS4_TOKEN_PROPERTY_ = "STANDS4_TOKEN_ID";
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
    .addItem("Open Spelling & Thesaurus", "showSpellingChecker")
    .addToUi();
}

function onInstall() {
  onOpen();
}

function showSpellingChecker() {
  const sidebar = HtmlService.createHtmlOutputFromFile("Sidebar")
    .setTitle("English Spelling & Thesaurus");
  DocumentApp.getUi().showSidebar(sidebar);
}

function getSidebarState() {
  const properties = PropertiesService.getUserProperties();
  return {
    hasStands4Credentials: Boolean(
      properties.getProperty(STANDS4_UID_PROPERTY_) &&
      properties.getProperty(STANDS4_TOKEN_PROPERTY_)
    )
  };
}

function saveStands4Credentials(uid, tokenId) {
  if (typeof uid !== "string" || !uid.trim() ||
      typeof tokenId !== "string" || !tokenId.trim()) {
    throw new Error("Enter both your STANDS4 UID and token ID.");
  }

  const properties = PropertiesService.getUserProperties();
  properties.setProperties({
    [STANDS4_UID_PROPERTY_]: uid.trim(),
    [STANDS4_TOKEN_PROPERTY_]: tokenId.trim()
  });
  return getSidebarState();
}

function forgetStands4Credentials() {
  const properties = PropertiesService.getUserProperties();
  properties.deleteProperty(STANDS4_UID_PROPERTY_);
  properties.deleteProperty(STANDS4_TOKEN_PROPERTY_);
  return getSidebarState();
}

function findSynonyms(word) {
  if (typeof word !== "string" ||
      !/^[\p{L}]+(?:['’\-][\p{L}]+)*$/u.test(word.trim()) ||
      word.trim().length > 100) {
    throw new Error("Enter a single word to look up.");
  }

  const properties = PropertiesService.getUserProperties();
  const uid = properties.getProperty(STANDS4_UID_PROPERTY_);
  const tokenId = properties.getProperty(STANDS4_TOKEN_PROPERTY_);
  if (!uid || !tokenId) {
    throw new Error("Save your STANDS4 credentials before looking up synonyms.");
  }

  const normalizedWord = word.trim();
  const url = STANDS4_SYNONYM_API_URL_ +
    "?uid=" + encodeURIComponent(uid) +
    "&tokenid=" + encodeURIComponent(tokenId) +
    "&word=" + encodeURIComponent(normalizedWord) +
    "&format=json";
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const statusCode = response.getResponseCode();

  if (statusCode === 404) {
    return { word: normalizedWord, synonyms: [] };
  }
  if (statusCode === 401 || statusCode === 403) {
    throw new Error("STANDS4 rejected the UID or token ID. Check your credentials.");
  }
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error("STANDS4 synonym lookup failed (HTTP " + statusCode + ").");
  }

  let data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error("STANDS4 returned an invalid response.");
  }
  if (data && data.error) {
    const apiError = String(data.error);
    if (/invalid (user id|token)/i.test(apiError)) {
      throw new Error("STANDS4 rejected the UID or token ID. Check your credentials.");
    }
    throw new Error("STANDS4 could not find synonyms for that word.");
  }

  return {
    word: normalizedWord,
    synonyms: extractSynonyms_(data)
  };
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

function extractSynonyms_(data) {
  const synonyms = [];
  const seen = new Set();

  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;

    Object.keys(value).forEach((key) => {
      const child = value[key];
      if (key.toLowerCase() === "synonym") {
        const values = Array.isArray(child) ? child : [child];
        values.forEach((item) => {
          const synonym = typeof item === "string"
            ? item
            : item && typeof item === "object"
              ? item.word || item.term
              : "";
          if (typeof synonym === "string" &&
              synonym.trim() &&
              !seen.has(synonym.toLowerCase())) {
            seen.add(synonym.toLowerCase());
            synonyms.push(synonym.trim());
          }
        });
      } else if (key.toLowerCase() === "synonyms") {
        const values = Array.isArray(child)
          ? child
          : typeof child === "string"
            ? child.split(/,\s*/)
            : [];
        values.forEach((item) => {
          if (typeof item === "string" &&
              item.trim() &&
              !seen.has(item.toLowerCase())) {
            seen.add(item.toLowerCase());
            synonyms.push(item.trim());
          }
        });
      } else {
        visit(child);
      }
    });
  }

  visit(data);
  return synonyms;
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
