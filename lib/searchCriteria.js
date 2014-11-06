var util = require('util'),
    SearchBuilder = require('./searchBuilder'),
    ConditionBuilder = require('./conditionBuilder'),
    Field = require('./field');

// Query fields
var QUERY_PAGE_START = 'iDisplayStart';
var QUERY_PAGE_SIZE = 'iDisplayLength';
var QUERY_NB_COLUMNS = 'iColumns';
var QUERY_FIELD_PREFIX = 'mDataProp_';
var QUERY_SEARCHABLE_PREFIX = 'bSearchable_';
var QUERY_SORTING_COLUMNS = 'iSortingCols';
var QUERY_SORTABLE_PREFIX = 'bSortable_';
var QUERY_SORT_COLUMN_PREFIX = 'iSortCol_';
var QUERY_SORT_DIRECTION_PREFIX = 'sSortDir_';
var QUERY_SORTING_COLUMNS = 'iSortingCols';
var QUERY_SORT_COLUMN_PREFIX = 'iSortCol_';
var QUERY_SORT_DIRECTION_PREFIX = 'sSortDir_';

module.exports = function SearchCriteria(model, query, options) {
  var options = options;
  var pageStart = getPageStart(query);
  var pageSize = getPageSize(query);
  var nbColumns = getNbColumns(query);
  SearchBuilder.initialize(query);
  var search = SearchBuilder.getOverallSearch();
  var sorts = getSorts(query);
  var fields = [];
  loadFields(model, query, nbColumns, sorts, fields);
  var select = {};
  var sort = {};
  var conditions;
  var populate = [];
  var aggregates = [];

  Object.defineProperty(this, "options", {
    writable: false, enumerable: true, value: options });

  Object.defineProperty(this, "pageStart", {
    writable: false, enumerable: true, value: pageStart });

  Object.defineProperty(this, "pageSize", {
    writable: false, enumerable: true, value: pageSize });

  Object.defineProperty(this, "nbColumns", {
    writable: false, enumerable: true, value: nbColumns });

  Object.defineProperty(this, "search", {
    writable: false, enumerable: true, value: search });

  Object.defineProperty(this, "fields", {
    writable: false, enumerable: true, value: fields });

  Object.defineProperty(this, "select", {
    enumerable: true,
    get: function() { return select; },
    set: function(value) { select = value; }
  });

  Object.defineProperty(this, "isSelectEmpty", {
    enumerable: true,
    value: function() { return !select || Object.keys(select).length == 0; }
  });

  Object.defineProperty(this, "sort", {
    enumerable: true,
    get: function() { return sort; },
    set: function(value) { sort = value; }
  });

  Object.defineProperty(this, "conditions", {
    enumerable: true,
    get: function() { return conditions; },
    set: function(value) { conditions = value; }
  });

  Object.defineProperty(this, "populate", {
    enumerable: true,
    get: function() { return populate; },
    set: function(value) { populate = value; }
  });

  Object.defineProperty(this, "aggregates", {
    enumerable: true,
    get: function() { return aggregates; },
    set: function(value) { aggregates = value; }
  });

  Object.defineProperty(this, "data", {
    enumerable: true,
    get: function() {
      var data = { options: options, pageStart: pageStart, pageSize: pageSize,
        nbColumns: nbColumns, search: search, fields: [], select: select,
        sort: sort, conditions: conditions, populate: populate };
      for (var index = 0; index < fields.length; ++index) {
        data.fields.push(fields[index]);
      }
      return data;
    }
  });

  Object.defineProperty(this, "toString", {
    enumerable: false,
    value: function() {
      return util.inspect(this.data, false, null, true);
    }
  });

  load(this);
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

function getSorts(query) {
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

function loadFields(model, query, nbColumns, sorts, fields) {
  for (var index = 0; index < nbColumns; ++index) {
    try {
      fields.push(new Field(model, query, sorts, index));
    } catch(err) {}
  }
}

function load(searchCriteria) {
  var conjunctions = [];
  var disjunctions = [];
  if (searchCriteria.options.conditions) {
    conjunctions.push(searchCriteria.options.conditions);
  }
  searchCriteria.fields.forEach(function(field) {
    if (field.sortable && field.sort) addSort(searchCriteria, field);
    if (field.selectable) addSelect(searchCriteria, field);
    if (field.ref || field.base) addPopulate(searchCriteria, field);
    if (field.searchable && field.base == undefined) {
      addConditions(searchCriteria, field, conjunctions, disjunctions);
    }
  });
  if (disjunctions.length > 0) {
    conjunctions.push(ConditionBuilder.buildDisjunction(disjunctions));
  }
  if (conjunctions.length > 0) {
    searchCriteria.conditions = ConditionBuilder.buildConjunction(conjunctions);
  }
}

function addSort(searchCriteria, field) {
  searchCriteria.sort[field.path] = field.sort.dir;
}

function addSelect(searchCriteria, field) {
  var path = field.base ? field.base[0] : field.path;
  if (searchCriteria.select[path] == undefined) {
    searchCriteria.select[path] = 1;
  }
}

function addPopulate(searchCriteria, field) {
  var path, populate;
  if (field.base && field.base.length > 0) {
    path = "";
    field.base.forEach(function(base) {
      if (path.length > 0) path += PATH_SEPARATOR;
      path += base;
    });
  } else path = field.path;
  var select = field.path.substring(path.length + 1);
  for (var index = 0; index < searchCriteria.populate.length; ++index) {
    populate = searchCriteria.populate[index];
    if (populate && populate.path == path) {
      break;
    }
  }
  if (index >= searchCriteria.populate.length) {
    populate = { path: path, sort: {} };
    if (field.base) {
      populate.select = select;
    }
    searchCriteria.populate.push(populate);
  } else if (populate.select) {
    if (populate.select.indexOf(field.path) == -1) {
      populate.select += select + " ";
    }
  }
  if (field.sort) populate.sort[select] = field.sort.dir;
}

function addConditions(searchCriteria, field, conjunctions, disjunctions) {
  var condition = ConditionBuilder.getGeneralSearch(field,
      searchCriteria.search, searchCriteria.options);
  if (condition) {
    var element = {};
    element[field.path] = condition;
    disjunctions.push(element);
  }
  condition = ConditionBuilder.getFieldSearch(field, searchCriteria.options);
  if (condition) {
    var element = {};
    element[field.path] = condition;
    conjunctions.push(element);
    if (field.arrayPath) addAggregate(searchCriteria, field, condition);
  }
}

function addAggregate(searchCriteria, field, condition) {
  var group = { _id: { _id: '$_id' } };
  group[field.arrayPath] = { $push: '$'+field.arrayPath };
  var project = { _id: '$_id._id' };
  project[field.arrayPath] = 1;
  searchCriteria.fields.forEach(function(f) {
    if (f == field) return;
    if (f.path.indexOf(field.arrayPath+'.') == 0) return;
    group._id[f.base || f.arrayPath || f.path] = '$'+(f.base || f.path);
    project[f.base || f.path] = '$_id.'+(f.base || f.path);
  });
  var aggregate = {};
  aggregate.unwind = field.arrayPath;
  aggregate.match = {};
  aggregate.match[field.path] = condition;
  aggregate.group = group;
  aggregate.project = project;
  searchCriteria.aggregates.push(aggregate);
}

