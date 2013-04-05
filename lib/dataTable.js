var util = require('util')
  , tools = require('./tools');

var PATH_SEPARATOR = '.';

// Data Table query fields
var QUERY_ECHO = 'sEcho';
var QUERY_PAGE_START = 'iDisplayStart';
var QUERY_PAGE_SIZE = 'iDisplayLength';
var QUERY_NB_COLUMNS = 'iColumns';
var QUERY_SEARCH = 'sSearch';
var QUERY_SEARCH_PREFIX = 'sSearch_';
var QUERY_SEARCH_REGEXP = 'bRegex';
var QUERY_SEARCH_REGEXP_PREFIX = 'bRegex_';
var QUERY_FIELD_PREFIX = 'mDataProp_';
var QUERY_SEARCHABLE_PREFIX = 'bSearchable_';
var QUERY_SORTING_COLUMNS = 'iSortingCols';
var QUERY_SORTABLE_PREFIX = 'bSortable_';
var QUERY_SORT_COLUMN_PREFIX = 'iSortCol_';
var QUERY_SORT_DIRECTION_PREFIX = 'sSortDir_';

// Data Table possible query fields
var QUERY_CHUNK_SEARCH = 'bChunkSearch';

// Data Table
var DATA_ECHO = 'sEcho';
var DATA_TOTAL_RECORDS = 'iTotalRecords';
var DATA_TOTAL_FILTERED_RECORDS = 'iTotalDisplayRecords';
var DATA_RECORDS = 'aaData';

// Chunk search regexp
var SEARCH_CHUNK_TMPL = "(?:[ \t]+|^)@%s:(?:([a-zA-Z_.@-]+)\|\"((?:[a-zA-Z_. \t@-]\|\\\\\")+)\")[ ]*"
var SEARCH_CHUNK = new RegExp("(?:[ \t]+|^)@([a-zA-Z_.-]+):(?:([a-zA-Z_.@-]+)\|\"((?:[a-zA-Z_. \t@-]\|\\\\\")+)\")[ ]*", 'g');

// Mongoose schema DataTable options
var SELECTABLE_OPTION = 'select';
var SELECTABLE_DATA_TABLE_OPTION = 'dataTableSelect';

var config = {
  conditionHandler: {
    String: buildStringCondition,
  },
  debug: false,
  verbose: false
};

module.exports.configure = function(options) {
  if ('object' == typeof options) {
    tools.extend(config, options);
  }
}

module.exports.enableVerbose = function(enabled) {
  config.verbose = enabled === true ? true : false;
}

module.exports.enableDebug = function(enabled) {
  config.debug = enabled === true ? true : false;
}

module.exports.init = function(schema, options) {
  schema.statics.dataTable = dataTable;
}

function dataTable(query, locale, callback) {
  debug("Query:", query);
  var self = this;
  if ('function' == typeof locale) {
    callback = locale;
    locale = undefined;
  }
  if ('function' != typeof callback) throw new Error("Missing callback !");
  if ('object'!= typeof query) return callback(new Error("Invalid query !"));
  var criteria = buildCriteria.call(self, query, locale);
  debug("Criteria builded:", util.inspect(criteria, false, null, true));
  var data = buildData(query);
  debug("Data builded:", util.inspect(data, false, null, true));
  countAllRecords.call(self, criteria, data, function(err, criteria, data) {
    if (err) return callback(err);
    countFilteredRecords.call(self, criteria, data, function(err, criteria, data) {
      if (err) return callback(err);
      retrieveData.call(self, criteria, data, function(err, criteria, data) {
        if (err) return callback(err);
        debug("Data:", data);
        callback(null, data);
      });
    });
  });
}

function buildCriteria(query, locale) {
  var criteria = {};
  criteria.locale = locale;
  criteria.pageStart = getPageStart(query);
  criteria.pageSize = getPageSize(query);
  criteria.nbColumns = getNbColumns(query);
  criteria.search = getSearchable(query);
  addCriteriaFields.call(this, criteria, query);
  return criteria;
}

function getPageStart(query) {
  return parseInt(query[QUERY_PAGE_START] || 0);
}

function getPageSize(query) {
  return parseInt(query[QUERY_PAGE_SIZE] || 0);
}

function getNbColumns(query) {
  return parseInt(query[QUERY_NB_COLUMNS] || 0);
}

function addCriteriaFields(criteria, query) {
  var sortables = getSortables(query);
  criteria.fields = [];
  criteria.populate = [];
  var field;
  for (var index = 0; index < criteria.nbColumns; ++index) {
    var path = query[util.format("%s%s", QUERY_FIELD_PREFIX, index)];
    if (path) {
      criteria.fields.push(field = { index: index, path: path });
      field.searchable = isFieldSearchable(query, index);
      if (field.searchable) field.search = getSearchable(query, index);
      field.sortable = isFieldSortable(query, index);
      if (field.sortable) field.sort = sortables[index];
      addCriteriaFieldSchemaInfo.call(this, criteria, field);
    }
  }
}

function addCriteriaFieldSchemaInfo(criteria, field) {
  var schemaField = this.schema.path(field.path);
  field.selectable = isFieldSelectable(schemaField);
  if (field.selectable) {
    if (schemaField.options.ref) {
      field.type = schemaField.options.ref;
      addPopulate(criteria, schemaField);
    } else if (util.isArray(schemaField.options.type)) {
      field.type = 'Array';
      if (schemaField.caster && schemaField.caster.options.ref) {
        addPopulate(criteria, schemaField);
      }
    } else {
      field.type = schemaField.options.type.name;
    }
  } else if (schemaField == undefined) {
    var baseSchemaField = getBasePopulateField(this.schema, field.path);
    addVirtualField(criteria, { path: baseSchemaField.path,
      searchable: false, sortable: false, selectable: true });
    field.searchable = field.sortable = field.selectable = false;
    loadCriteriaPopulate.call(this, criteria, this.schema, field.path);
  }
}

function addVirtualField(criteria, field) {
  for (var index = 0; index < criteria.fields.length; ++index) {
    if (criteria.fields[index].path == field.path) return;
  }
  criteria.fields.push(field);
}

function loadCriteriaPopulate(criteria, schema, path, base) {
  var baseField = getBasePopulateField(schema, path);
  if (!baseField) return;
  var basePath = baseField.path;
  var newPath = path.substring(basePath.length + 1);
  base = base ? util.format("%s%s%s", base, PATH_SEPARATOR, basePath)
    : basePath;
  addPopulate(criteria, { path: newPath }, base);
  var baseType = baseField.options.ref || baseField.caster.options.ref;
  var newSchema = this.base.modelSchemas[baseType];
  if (!newSchema) return;
  return loadCriteriaPopulate.call(this, criteria, newSchema, newPath, base);
}

function getBasePopulateField(schema, path) {
  var indexSep = -1;
  var base;
  var baseField;
  while ((indexSep = path.substring(indexSep + 1)
        .indexOf(PATH_SEPARATOR)) != -1) {
    base = path.substring(0, indexSep);
    baseField = schema.path(base);
    if (!baseField || baseField.options.ref ||
          (baseField.caster && baseField.caster.options.ref)) {
      return baseField;
    }
  }
}

function addPopulate(criteria, field, base) {
  var path = base || field.path,
      populate;
  for (var index = 0; index < criteria.populate.length; ++index) {
    populate = criteria.populate[index];
    if (populate && populate.path == path) {
      break;
    } else populate = undefined;
  }
  if (populate == undefined) {
    populate = { path: path };
    if (base) populate.select = field.path;
    criteria.populate.push(populate);
  } else if (populate.select && populate.select.indexOf(field.path) == -1) {
      populate.select += field.path + " ";
  }
}

function getSortables(query) {
  var sortables = [];
  var nbSortingCols = parseInt(query[QUERY_SORTING_COLUMNS]);
  while (--nbSortingCols >= 0) {
    var index = parseInt(query[
        util.format("%s%s", QUERY_SORT_COLUMN_PREFIX, nbSortingCols)]);
    var dir = query[util.format("%s%s", QUERY_SORT_DIRECTION_PREFIX,
        nbSortingCols)];
    sortables[index] = { dir: dir, precedence: nbSortingCols };
  }
  return sortables;
}

function isFieldSortable(query, index) {
  return query[util.format("%s%s", QUERY_SORTABLE_PREFIX, index)] == 'true';
}

function getSearchable(query, index) {
  var searchable;
  var value = getSearchValue(query, index);
  if (value && value.length > 0) {
    var searchable = {
      value: value,
      regexp: isSearchRegexp(query, index)
    };
    if (!index) searchable.chunck = isSearchChunk(query);
  }
  return searchable;
}

function isFieldSearchable(query, index) {
  return query[util.format("%s%s", QUERY_SEARCHABLE_PREFIX, index)] == 'true';
}

function isSearchRegexp(query, index) {
  if (index != undefined) {
    return query[util.format("%s%s", QUERY_SEARCH_REGEXP_PREFIX, index)] == 'true';
  } else return query[QUERY_SEARCH_REGEXP] == 'true';
}

function isSearchChunk(query) {
  return query[QUERY_CHUNK_SEARCH] == 'true';
}

function getSearchValue(query, index) {
  if (index != undefined) {
    return query[util.format("%s%s", QUERY_SEARCH_PREFIX, index)];
  } else return query[QUERY_SEARCH];
}

function isFieldSelectable(field) {
  if (field && (field.options[SELECTABLE_OPTION] == undefined ||
        field.options[SELECTABLE_OPTION] === true) &&
      (field.options[SELECTABLE_DATA_TABLE_OPTION] == undefined ||
       field.options[SELECTABLE_DATA_TABLE_OPTION] === true))
    return true;
  return false;
}

function buildData(query) {
  var data = {};
  data[DATA_ECHO] = query[QUERY_ECHO];
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
  if (!isFiltered(criteria)) {
    data[DATA_TOTAL_FILTERED_RECORDS] = data[DATA_TOTAL_RECORDS];
    return callback(null, criteria, data);
  }
  criteria.conditions = buildConditions(criteria);
  debug("Conditions:", util.inspect(criteria.conditions, false, null, true));
  this.count(criteria.conditions, function(err, count) {
    if (err) return callback(err);
    data[DATA_TOTAL_FILTERED_RECORDS] = count;
    return callback(null, criteria, data);
  });
}

function retrieveData(criteria, data, callback) {
  criteria.sort = buildSort(criteria);
  debug("Sort:", util.inspect(criteria.sort, false, null, true));
  criteria.select = buildSelect(criteria);
  debug("Select:", util.inspect(criteria.select, false, null, true));
  this.find(criteria.conditions).select(criteria.select)
    .skip(criteria.pageStart).limit(criteria.pageSize).sort(criteria.sort)
   .populate(criteria.populate).exec(function(err, values) {
      if (err) return callback(err);
      data[DATA_RECORDS] = values;
      callback(null, criteria, data);
    });
}

<<<<<<< HEAD
function isFiltered(criteria) {
  if (criteria.search) return true;
  for (var index = 0; index < criteria.fields.length; ++index) {
    var field = criteria.fields[index];
    if (field.searchable && field.search) return true;
  }
  return false;
=======
function getSchemaFields(schema, query) {
  var fields = [];
  var field;
  for (key in query)
    if (FIELD_REGEXP.test(key) && query[key]) {
      field = schema.path(query[key]);
      if (field && isSelectable(field)) fields[RegExp.$1] = field;
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
    if (schemaFields[indice] &&
        query[QUERY_SORTABLE_PREFIX + indice] == 'true') {
      sort[schemaFields[indice].path] =
        query[QUERY_SORT_DIRECTION_PREFIX + index];
    }
  }
  return sort;
>>>>>>> de96efa2ac0df43f87e932ef0de63f4f650753d2
}

function buildConditions(criteria) {
  var conditions = {}, chunckSearch, search, disj;
  if (criteria.search.chunck) {
    chunckSearch = criteria.search.value;
    search = chunckSearch.replace(SEARCH_CHUNK, '');
  } else search = criteria.search.value
  if (search.length > 0) disj = [];
  for(var index = 0; index < criteria.fields.length; ++index) {
    var field = criteria.fields[index];
    if (field && field.searchable) {
      if (chunckSearch && chunckSearch.length > 0) {
        addChunkConditions(criteria, chunckSearch, field, conditions);
      }
      if (field.search) {
        addCondition(criteria.locale, conditions, field.search.value,
            field.search.regexp, field);
      }
      if (disj) {
        addDisjunctionCondition(criteria.locale, disj, search,
            criteria.search.regexp, field);
      }
    }
  }
  if (disj && disj.length > 0) conditions['$or'] = disj;
  return conditions;
}

function addChunkConditions(criteria, search, field, conditions) {
  var searchChunk =
    new RegExp(util.format(SEARCH_CHUNK_TMPL,
          field.path.replace(/\./, "\\.")), 'g');
  var captures;
  while ((captures = searchChunk.exec(search))) {
    var search = captures[1] || captures[2];
    addCondition(criteria.locale, conditions, search, criteria.search.regexp, field);
  }
}

function buildSort(criteria) {
  var sortFields = [];
  for (var index = 0; index < criteria.fields.length; ++index) {
    var field = criteria.fields[index];
    if (field && field.sortable && field.sort) {
      sortFields[field.sort.precedence] = field;
    }
  }
  var sort;
  if (sortFields.length > 0) {
    sort = {};
    for (var index = 0; index < sortFields.length; ++index) {
      var field = sortFields[index];
      sort[field.path] = field.sort.dir;
    }
  }
  return sort;
}

function buildSelect(criteria) {
  var select = "";
  for (var index = 0; index < criteria.fields.length; ++index) {
    var field = criteria.fields[index];
    if (field && field.selectable) {
      select += field.path + " ";
    }
  }
  return select;
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
  var handler = handlers[field.type] ||
    handlers.default;
  if (!handler || 'function' != typeof handler) {
    return buildUnknownCondition(field);
  }
  return handler(locale, field, search, regexp);
}

function buildStringCondition(locale, field, search, regexp) {
  if (regexp) return new RegExp(search);
  return new RegExp(search, 'i');
}

function buildUnknownCondition(field) {
  verbose("Unmanaged field condition type:", field.type);
}

function getFieldFullPath(field) {
  return field.base ?
    util.format("%s%s%s", field.base, PATH_SEPARATOR, field.path)
    : field.path;
}

function debug() {
  if (config.debug === true) {
    console.log.apply(console, arguments);
  }
}

function verbose() {
  if (config.verbose === true) {
    console.log.apply(console, arguments);
  }
}
