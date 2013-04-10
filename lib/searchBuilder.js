var util = require('util');

// Query fields
var QUERY_SEARCH = 'sSearch';
var QUERY_SEARCH_PREFIX = 'sSearch_';
var QUERY_SEARCH_REGEXP = 'bRegex';
var QUERY_SEARCH_REGEXP_PREFIX = 'bRegex_';

// Data Table possible query fields
var QUERY_CHUNK_SEARCH = 'bChunkSearch';

// Search regexp
var CHUNK_KEY = '([a-zA-Z_.-]+)';
var CHUNK_VALUE = '(?:([a-zA-Z_.@-]+)\|"((?:[a-zA-Z_. \t@-]\|\\\\")+)")'
var CHUNK = '@'+CHUNK_KEY+':'+CHUNK_VALUE;
var SEARCH_CHUNK_REGEXP = new RegExp(CHUNK, 'g');
var SEARCH_CHUNK_TMPL = '(?:[ \t]+|^)@%s:'+CHUNK_VALUE;
var QUOTE_WORD_REGEXP = new RegExp('(@'+CHUNK_KEY+':)?"([^"]*)"', 'g');

var lastSearchStr;
var block;

module.exports.buildSearch = function() {
 if (arguments.length == 1)
   return buildOverallSearch.apply(this, arguments);
 else
   return buildFieldSearch.apply(this, arguments);
}

function buildOverallSearch(query) {
  loadSearchBlock(query);
  if (block == undefined || block.words.length == 0) return;
  return block.words;
}

function buildFieldSearch(query, index, path) {
  loadSearchBlock(query);
  var value = getSearchFieldValue(query, index);
  var search = [];
  if (value.length > 0) {
    search.push(isSearchFieldRegexp(query, index) ? new RegExp(value) : value);
  }
  if (block != undefined && block.chunks.length > 0) {
    block.chunks.forEach(function(element) {
      if (element.key == path && search.indexOf(element.value) == -1) {
        search.push(element.value);
      }
    });
  }
  return search.length > 0 ? search : undefined;
}

function loadSearchBlock(query) {
  var searchStr = getSearchValue(query).trim();
  if (searchStr == lastSearchStr) return block;
  lastSearchStr = searchStr;
  block = undefined;
  if (searchStr.length == 0) return;
  var chunkSearch = isChunkSearch(query);
  var isRegexp = isSearchRegexp(query);
  block = { words: [], chunks: [] };
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

function getSearchValue(query) {
  return query[QUERY_SEARCH];
}

function getSearchFieldValue(query, index) {
  return query[util.format("%s%s", QUERY_SEARCH_PREFIX, index)];
}

function isSearchRegexp(query) {
  return query[QUERY_SEARCH_REGEXP] == 'true';
}

function isSearchFieldRegexp(query, index) {
  return query[util.format("%s%s", QUERY_SEARCH_REGEXP_PREFIX, index)] == 'true';
}

function isChunkSearch(query) {
  return query[QUERY_CHUNK_SEARCH] == 'true';
}
