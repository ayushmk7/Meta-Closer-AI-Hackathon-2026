'use strict';

// query-string 7 expects a callable CommonJS export; the upstream fixed decoder is ESM-only.
module.exports = function decodeUriComponent(value) {
  if (typeof value !== 'string') throw new TypeError('Expected a string URI component.');
  const normalized = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(normalized);
  } catch {
    // Escape literal separators so malformed UTF-8 cannot change the query's shape.
    return new URLSearchParams('value=' + normalized.replace(/&/g, '%26')).get('value');
  }
};
