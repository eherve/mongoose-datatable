var util = require('util');

// Data Table query fields
var QUERY_PAGE_START = 'iDisplayStart';
var QUERY_PAGE_SIZE = 'iDisplayLength';
var QUERY_FIELD_PREFIX = 'mDataProp_';
var QUERY_SEARCHABLE_PREFIX = 'bSearchable_';
var QUERY_SORTING_COLUMNS = 'iSortingCols';
var QUERY_SORTABLE_PREFIX = 'bSortable_';
var QUERY_SORT_COLUMN_PREFIX = 'iSortCol_';
var QUERY_SORT_DIRECTION_PREFIX = 'sSortDir_';
var QUERY_SEARCH = 'sSearch';
var QUERY_SEARCH_PREFIX = 'sSearch_';
var QUERY_SEARCH_REGEXP = 'bRegex';
var QUERY_SEARCH_REGEXP_PREFIX = 'bRegex_';
var QUERY_CHUNK_SEARCH = 'bChunkSearch';

// Regexp
var FIELD_REGEXP = new RegExp("^" + QUERY_FIELD_PREFIX + "(\\d+)$");

// Data Table
var DATA_ECHO = 'sEcho';
var DATA_TOTAL_RECORDS = 'iTotalRecords';
var DATA_TOTAL_FILTERED_RECORDS = 'iTotalDisplayRecords';
var DATA_RECORDS = 'aaData';

// Find Criteria
var CRITERIA_QUERY = 'query';
var CRITERIA_LOCALE = 'locale';
var CRITERIA_PAGE_START = 'pageStart';
var CRITERIA_PAGE_SIZE = 'pageSize';
var CRITERIA_SCHEMA_FIELDS = 'schemaFields';
var CRITERIA_CONDITIONS = 'conditions';
var CRITERIA_FIELDS = 'fields';
var CRITERIA_SORT = 'sort';

// Chunk search regexp
var SEARCH_CHUNK_TMPL = "@%s:(?:(\\w+)\|\"((?:\\w\|[ ]\|\\\\\")+)\")[ ]*"
var SEARCH_CHUNK = new RegExp("@(\\w+):(?:(\\w+)\|\"((?:\\w\|[ ]\|\\\\\")+)\")[ ]*", 'g');

// Mongoose schema DataTable options
var SELECTABLE_OPTION = 'select';
var SELECTABLE_DATA_TABLE_OPTION = 'dataTableSelect';

var config = {
  conditionHandler: {
    String: buildStringCondition,
  }
};

module.exports.configure = function(options) {
  config = options || config;
}

module.exports.init = function(schema, options) {
  schema.statics.dataTable = dataTable;
}

function dataTable(query, locale, callback) {
  console.log("Query:", query); // TODO remove
  var self = this;
  if ('function' == typeof locale) {
    callback = locale;
    locale = undefined;
  }
  if ('function' != typeof callback) throw new Error("Missing callback !");
  if ('object'!= typeof query) return callback(new Error("Invalid query !"));
  var criteria = buildCriteria(query, locale);
  var data = buildData(query);
  countAllRecords.call(self, criteria, data, function(err, criteria, data) {
    if (err) return callback(err);
    countFilteredRecords.call(self, criteria, data, function(err, criteria, data) {
      if (err) return callback(err);
      retrieveData.call(self, criteria, data, function(err, criteria, data) {
        if (err) return callback(err);
        callback(null, data);
      });
    });
  });
}

function buildCriteria(query, locale) {
  var criteria = {};
  criteria[CRITERIA_QUERY] = query;
  criteria[CRITERIA_LOCALE] = locale;
  return criteria;
}

function buildData(query) {
  var data = {};
  data[DATA_ECHO] = query[DATA_ECHO];
  return data;
}

function countAllRecords(criteria, data, callback) {
  this.count(function(err, countAll) {
    if (err) return callback(err);
    data[DATA_TOTAL_RECORDS] = countAll;
    return callback(null, criteria, data);
  });
}

function countFilteredRecords(criteria, data, callback) {
  var query = criteria[CRITERIA_QUERY];
  var locale = criteria[CRITERIA_LOCALE];
  var schemaFields = criteria[CRITERIA_SCHEMA_FIELDS] =
    getSchemaFields(this.schema, query);
  console.log("Schema fields:", schemaFields); // TODO remove
  var conditions = criteria[CRITERIA_CONDITIONS] =
    getConditions(locale, query, schemaFields);
  console.log("Conditions:", conditions); // TODO remove
  this.count(conditions, function(err, countFiltered) {
    if (err) return callback(err);
    data[DATA_TOTAL_FILTERED_RECORDS] = countFiltered;
    return callback(null, criteria, data);
  });
}

function retrieveData(criteria, data, callback) {
  var schemaFields = criteria[CRITERIA_SCHEMA_FIELDS];
  var fields = criteria[CRITERIA_FIELDS] = getFields(schemaFields);
  console.log("Fields:", fields); // TODO remove
  var query = criteria[CRITERIA_QUERY];
  var sort = criteria[CRITERIA_SORT] = getSort(query, schemaFields);
  console.log("Sort:", sort); // TODO remove
  var conditions = criteria[CRITERIA_CONDITIONS];
  var pageStart = criteria[CRITERIA_QUERY][QUERY_PAGE_START];
  var pageSize = criteria[CRITERIA_QUERY][QUERY_PAGE_SIZE];
  this.find(conditions, fields).skip(pageStart).limit(pageSize).sort(sort)
    .exec(function(err, values) {
      if (err) return callback(err);
      data[DATA_RECORDS] = values;
      callback(null, criteria, data);
    });
}

function getSchemaFields(schema, query) {
  var fields = [];
  var field;
  for (key in query)
    if (FIELD_REGEXP.test(key) && query[key]) {
      field = schema.path(query[key]);
      if (isSelectable(field)) fields[RegExp.$1] = field;
    }
  return fields;
}

function isSelectable(field) {
  if ((field.options[SELECTABLE_OPTION] == undefined ||
        field.options[SELECTABLE_OPTION] === true) &&
      (field.options[SELECTABLE_DATA_TABLE_OPTION] == undefined ||
       field.options[SELECTABLE_DATA_TABLE_OPTION] === true))
    return true;
  return false;
}

function getFields(schemaFields) {
  var fields = "";
  for(var index = 0; index < schemaFields.length; ++index) {
    if (schemaFields[index]) fields += schemaFields[index].path + ' ';
  }
  return fields;
}

function getSort(query, schemaFields) {
  var sort = {};
  var nbSortingCols = parseInt(query[QUERY_SORTING_COLUMNS]);
  for (var index = 0; index < nbSortingCols; ++index) {
    var indice = query[QUERY_SORT_COLUMN_PREFIX + index];
    if (query[QUERY_SORTABLE_PREFIX + indice] == 'true') {
      sort[schemaFields[indice].path] =
        query[QUERY_SORT_DIRECTION_PREFIX + index];
    }
  }
  return sort;
}

function getConditions(locale, query, schemaFields) {
  var conditions = {};
  var chunckSearch;
  var search;
  if (query[QUERY_CHUNK_SEARCH] == 'true') {
    chunckSearch = query[QUERY_SEARCH] || '';
    search = chunckSearch.replace(SEARCH_CHUNK, '');
  } else search = query[QUERY_SEARCH] || '';
  var disj;
  if (search.length > 0) disj = [];
  for(var index = 0; index < schemaFields.length; ++index) {
    if (schemaFields[index] && isSearchable(query, index)) {
      if (chunckSearch && chunckSearch.length > 0) {
        addSearchChunkCondition(locale, conditions, chunckSearch,
            isRegexp(query), schemaFields[index]);
      }
      if (query[QUERY_SEARCH_PREFIX + index]) {
        addCondition(locale, conditions, query[QUERY_SEARCH_PREFIX + index],
            isRegexp(query, index), schemaFields[index]);
      }
      if (disj) {
        addDisjunctionCondition(locale, disj, search,
            isRegexp(query), schemaFields[index]);
      }
    }
  }
  if (disj && disj.length > 0) conditions['$or'] = disj;
  return conditions;
}

function isSearchable(query, index) {
  if (query[QUERY_SEARCHABLE_PREFIX + index] == 'true') return true;
  return false;
}

function isRegexp(query, index) {
  if (index && query[QUERY_SEARCH_REGEXP_PREFIX + index] == 'true') return true;
  if (!index && query[QUERY_SEARCH_REGEXP] == 'true') return true;
  return false;
}

function addSearchChunkCondition(locale, conditions, search, regexp, field) {
  var searchChunk = new RegExp(util.format(SEARCH_CHUNK_TMPL, field.path), 'g');
  var captures;
  while ((captures = searchChunk.exec(search))) {
    var search = captures[1] || captures[2];
    var condition = buildCondition(locale, field, search, regexp);
    if (condition != undefined) conditions[field.path] = condition;
  }
}

function addCondition(locale, conditions, search, regexp, field) {
  var condition = buildCondition(locale, field, search, regexp);
  if (condition != undefined) conditions[field.path] = condition;
}

function addDisjunctionCondition(locale, disj, search, regexp, field) {
  var condition = buildCondition(locale, field, search, regexp);
  if (condition != undefined) {
    var disjCondition = {};
    disjCondition[field.path] = condition;
    disj.push(disjCondition);
  }
}

function buildCondition(locale, field, search, regexp) {
  var handlers = config.conditionHandler;
  if (!handlers || 'object' != typeof handlers)
    return buildUnknownCondition(field);
  var handler = handlers[field.options.type.name];
  if (!handler || 'function' != typeof handler)
    return buildUnknownCondition(field);
  var options = 'object' == typeof config.conditionOptions ?
    config.conditionOptions[field.options.type.name] || {} : {}
  return handler(locale, field, search, regexp, options);
}

function buildStringCondition(locale, field, search, regexp, options) {
  if (regexp) return new RegExp(search);
  return new RegExp(search, 'i');
}

function buildUnknownCondition(field) {
  console.error("Unmanaged field condition type:", field.options.type.name);
}
