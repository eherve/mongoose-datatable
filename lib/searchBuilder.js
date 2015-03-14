var util = require('util');

// Query fields
var QUERY_COLUMNS = 'columns';
var QUERY_SEARCH = 'search'; // 'sSearch';
var QUERY_SEARCH_PREFIX = 'value'; // 'sSearch_';
var QUERY_SEARCH_REGEXP = 'regex'; // 'bRegex';
var QUERY_SEARCH_REGEXP_PREFIX = 'regex'; // 'bRegex_';

// Data Table possible query fields
var QUERY_CHUNK_SEARCH = 'bChunkSearch';

// Search regexp
var CHUNK_KEY = '([0-9a-zA-Z_.-]+)';
var CHUNK_VALUE = '(?:([^" \t]+)\|"((?:[^"\\\\]|\\\\.)+)")';
var CHUNK = '@'+CHUNK_KEY+':'+CHUNK_VALUE;
var SEARCH_CHUNK_REGEXP = new RegExp(CHUNK, 'g');
var QUOTE_WORD_REGEXP = /(?:^|[ \t])"(?:[^"\\]|\\.)*"/g;

var query;
var block;

module.exports.initialize = function(data) {
  query = data;
  block = { words: [], chunks: [] };
  loadSearchBlock();
}

module.exports.getOverallSearch = function() {
  if (block == undefined || block.words.length == 0) return;
  return block.words;
}

module.exports.getFieldSearch = function(index, path) {
  var value = getSearchFieldValue(index);
  var search = { chunks: [] };
  if (value.length > 0) {
    search.search = (isSearchFieldRegexp(index) ? new RegExp(value) : value);
  }
  if (block != undefined && block.chunks.length > 0) {
    block.chunks.forEach(function(element) {
      if (element.key == path && search.chunks.indexOf(element.value) == -1) {
        search.chunks.push(element.value);
      }
    });
  }
  return search.search || search.chunks.length > 0 ? search : undefined;
}

function loadSearchBlock() {
  var searchStr = getSearchValue().trim();
  if (searchStr.length == 0) return;
  var isRegexp = isSearchRegexp(); // TODO return just one regexp ?
  var chunkSearch = isChunkSearch();
  searchStr = loadQuotedWords(searchStr, block.words, isRegexp, chunkSearch);
  if (chunkSearch) searchStr = loadChunks(searchStr, block.chunks, isRegexp);
  loadWords(searchStr, block.words, isRegexp);
}

function loadQuotedWords(searchStr, words, isRegexp, chunkSearch) {
  return searchStr.replace(QUOTE_WORD_REGEXP, function() {
    if (!chunkSearch || arguments[1] == undefined) {
      if (arguments[3] != undefined && arguments[3].length > 0 &&
          words.indexOf(arguments[3]) == -1) {
        words.push(isRegexp ? new RegExp(arguments[3]) : arguments[3]);
      }
    } else return arguments[0];
    return "";
  });
}

function loadChunks(searchStr, chunks, isRegexp) {
  return searchStr.replace(SEARCH_CHUNK_REGEXP, function() {
    var chunk = {};
    chunk.key = arguments[1];
    chunk.value = arguments[2] || arguments[3];
    chunks.push(chunk);
    return "";
  });
}

function loadWords(searchStr, words, isRegexp) {
  searchStr.trim().split(/[ \t]+/).forEach(function(element) {
    if (element.length > 0 && words.indexOf(element) == -1) {
      words.push(isRegexp ? new RegExp(element) : element);
    }
  });
}

function getSearchValue() {
  return query[QUERY_SEARCH][QUERY_SEARCH_PREFIX] || "";
}

function isSearchRegexp() {
  return query[QUERY_SEARCH][QUERY_SEARCH_REGEXP] == 'true';
}

function isChunkSearch() {
  return query[QUERY_CHUNK_SEARCH] == 'true';
}

function getSearchFieldValue(index) {
  return query[QUERY_COLUMNS][index][QUERY_SEARCH][QUERY_SEARCH_PREFIX];
}

function isSearchFieldRegexp(index) {
  return query[QUERY_COLUMNS][index][QUERY_SEARCH][QUERY_SEARCH_REGEXP_PREFIX] == 'true';
}
