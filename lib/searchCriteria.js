var util = require('util')
  , SearchBuilder = require('./searchBuilder')
  , Field = require('./field');

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

module.exports = function(model, query, options) {
  var options = options;
  var pageStart = getPageStart(query);
  var pageSize = getPageSize(query);
  var nbColumns = getNbColumns(query);
  var search = SearchBuilder.buildSearch(query);
  var sorts = getSorts(query);
  var fields = [];
  loadFields(model, query, nbColumns, sorts, fields);
  var select = "";
  var sort = {};
  var conditions;
  var populate = [];
  return {
    get options() { return options; },
    get pageStart() { return pageStart; },
    get pageSize() { return pageSize; },
    get nbColumns() { return nbColumns; },
    get search() { return search; },
    get fields() { return fields; },
    get select() { return select; },
    set select(value) { select = value; },
    get sort() { return sort; },
    set sort(value) { sort = value; },
    get conditions() { return conditions; },
    set conditions(value) { conditions = value; },
    get populate() { return populate; },
    set populate(value) { populate = value; },
    get data() {
      var data = {
        options: options,
        pageStart: pageStart,
        pageSize: pageSize,
        nbColumns: nbColumns,
        search: search,
        fields: [],
        select: select,
        sort: sort,
        conditions: conditions,
        populate: populate
      };
      for (var index = 0; index < fields.length; ++index) {
        data.fields.push(fields[index].data);
      }
      return data;
    },
    toString: function() {
      return util.inspect(this.data, false, null, true);
    }
  }
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
    var field = new Field(model, query, sorts, index);
    if (field != undefined) fields.push(field);
  }
}
