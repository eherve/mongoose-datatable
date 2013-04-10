var util = require('util')
  , Tools = require('./tools')
  , SearchCriteria = require('./searchCriteria')
  , ResultHolder = require('./resultHolder')
  , ConditionBuilder = require('./conditionBuilder')
  , stringHandler = require('./conditionHandlers/stringHandler')
  , PATH_SEPARATOR = '.';

var DEFAULT_CONFIG = {
  conditionHandlers: {
    String: stringHandler,
  },
  debug: false,
  verbose: false
}, configured = false;

var configure =
module.exports.configure = function(config) {
  config = config || {};
  enableVerbose(config.verbose ||
      DEFAULT_CONFIG.verbose);
  enableDebug(config.debug ||
      DEFAULT_CONFIG.debug);
  setConditionHandlers(config.conditionHandlers ||
      DEFAULT_CONFIG.conditionHandlers);
  configured = true;
}

var setConditionHandlers =
module.exports.setConditionHandlers = ConditionBuilder.setConditionHandlers;

var enableVerbose =
module.exports.enableVerbose = Tools.enableVerbose;

var enableDebug =
module.exports.enableDebug = Tools.enableDebug;

module.exports.init = function(schema, options) {
  if (!configured) configure(DEFAULT_CONFIG);
  schema.statics.dataTable = dataTable;
}

function dataTable(query, options, callback) {
  Tools.debug("Query:", query);
  var self = this;
  if ('function' == typeof options) {
    callback = options;
    options = {};
  } else options = options || {}
  if ('object'!= typeof query) return callback(new Error("Invalid query !"));
  if ('function' != typeof callback) throw new Error("Missing callback !");
  var searchCriteria = buildSearchCriteria(self, query, options);
  Tools.debug("Search Criteria builded:", searchCriteria.toString());
  var resultHolder = buildResultHolder(query);
  countAllRecords.call(self, searchCriteria, resultHolder,
      function(err, searchCriteria, resultHolder) {
        if (err) return callback(err);
        countFilteredRecords.call(self, searchCriteria, resultHolder,
          function(err, searchCriteria, resultHolder) {
            if (err) return callback(err);
            fetchData.call(self, searchCriteria, resultHolder,
              function(err, searchCriteria, resultHolder) {
                if (err) return callback(err);
                sendData(resultHolder, callback);
              });
          });
      });
}

function sendData(resultHolder, callback) {
  Tools.debug("Data:", resultHolder.toString());
  callback(null, resultHolder.data);
}

/*
 * Build Criteria methods
*/

function buildSearchCriteria(model, query, options) {
  var searchCriteria = new SearchCriteria(model, query, options);
  loadSearchCriteria(searchCriteria);
  return searchCriteria;
}

function loadSearchCriteria(searchCriteria) {
  var conjunctions = [];
  var disjunctions = []
  searchCriteria.fields.forEach(function(field) {
    if (field.sortable && field.sort) {
      addToSort(searchCriteria, field);
    }
    if (field.selectable) {
      addToSelect(searchCriteria, field);
    }
    if (field.ref || field.base) {
      addToPopulate(searchCriteria, field);
    }
    if (field.searchable && field.base == undefined &&
        (searchCriteria.search || field.search)) {
      addToConditions(searchCriteria, field, conjunctions, disjunctions);
    }
  });
  if (disjunctions.length > 0) {
    conjunctions.push(ConditionBuilder.buildDisjunction(disjunctions));
  }
  if (conjunctions.length > 0) {
    searchCriteria.conditions = ConditionBuilder.buildConjunction(conjunctions);
  }
}

function addToSort(searchCriteria, field) {
  searchCriteria.sort[field.path] = field.sort.dir;
}

function addToSelect(searchCriteria, field) {
  var path = field.base ? field.base[0] : field.path;
  if (searchCriteria.select.indexOf(path) == -1) {
    searchCriteria.select += path + " ";
  }
}

function addToPopulate(searchCriteria, field) {
  var path, populate;
  if (field.base && field.base.length > 0) {
    field.base.forEach(function(base) {
      if (path) path += PATH_SEPARATOR;
      else path = "";
      path += base;
    });
  } else path = field.path;
  for (var index = 0; index < searchCriteria.populate.length; ++index) {
    populate = searchCriteria.populate[index];
    if (populate && populate.path == path) {
      break;
    } else populate = undefined;
  }
  if (populate == undefined) {
    populate = { path: path };
    if (field.base) {
      var select = field.path.substring(path.length + 1);
      populate.select = select;
    }
    searchCriteria.populate.push(populate);
  } else if (populate.select) {
    if (field.base == undefined) populate.select = undefined;
    else if (populate.select.indexOf(field.path) == -1) {
      var select = field.path.substring(path.length + 1);
      populate.select += select + " ";
    }
  }
}

function addToConditions(searchCriteria, field, conjunctions, disjunctions) {
  if (field.search != undefined) {
    var condition = ConditionBuilder.getFieldConditions(field);
    if (condition != undefined) conjunctions.push(condition);
  }
  if (searchCriteria.search != undefined) {
    var condition = ConditionBuilder.getConditions(field,
        searchCriteria.search);
    if (condition != undefined) disjunctions.push(condition);
  }
}

/*
 * Build Data methods
*/

function buildResultHolder(query) {
  var resultHolder = new ResultHolder(query);
  return resultHolder;
}

/*
 * Data Fetch methods
*/

function countAllRecords(searchCriteria, resultHolder, callback) {
  this.count(function(err, count) {
    if (err) return callback(err);
    resultHolder.totalRecords = count;
    return callback(null, searchCriteria, resultHolder);
  });
}

function countFilteredRecords(searchCriteria, resultHolder, callback) {
  if (searchCriteria.conditions == undefined) {
    resultHolder.totalFilteredRecords = resultHolder.totalRecords;
    return callback(null, searchCriteria, resultHolder);
  }
  this.count(searchCriteria.conditions, function(err, count) {
    if (err) return callback(err);
    resultHolder.totalFilteredRecords = count;
    return callback(null, searchCriteria, resultHolder);
  });
}

function fetchData(searchCriteria, resultHolder, callback) {
  this.find(searchCriteria.conditions).select(searchCriteria.select)
    .skip(searchCriteria.pageStart).limit(searchCriteria.pageSize)
    .sort(searchCriteria.sort).populate(searchCriteria.populate)
    .exec(function(err, records) {
      if (err) return callback(err);
      resultHolder.records = records;
      callback(null, searchCriteria, resultHolder);
    });
}

