var util = require('util'),
    Tools = require('./tools'),
    SearchCriteria = require('./searchCriteria'),
    ResultHolder = require('./resultHolder'),
    ConditionBuilder = require('./conditionBuilder'),
    Field = require('./field'),
    stringHandler = require('./conditionHandlers/stringHandler'),
    booleanHandler = require('./conditionHandlers/booleanHandler'),
    dateHandler = require('./conditionHandlers/dateHandler'),
    numberHandler = require('./conditionHandlers/numberHandler'),
    refHandler = require('./conditionHandlers/refHandler'),
    PATH_SEPARATOR = '.';

var HANDLERS = module.exports.HANDLERS = {
    String: stringHandler,
    Boolean: booleanHandler,
    Date: dateHandler,
    Number: numberHandler
};
HANDLERS[Field.TYPES.REF_TYPE] = refHandler;

var DEFAULT_CONFIG = {
  conditionHandlers: HANDLERS,
  debug: false,
  verbose: false,
  logger: function(level, args) { console.log.apply(console, args); }
}, configured = false;

var enableVerbose =
module.exports.enableVerbose = Tools.enableVerbose;

var enableDebug =
module.exports.enableDebug = Tools.enableDebug;

var setLogger =
module.exports.setLogger = Tools.setLogger;

var setConditionHandlers =
module.exports.setConditionHandlers = ConditionBuilder.setConditionHandlers;

module.exports.getConditionHandlers = ConditionBuilder.getConditionHandlers;

module.exports.configure = function(config) {
  config = config || {};
  enableVerbose(config.verbose || DEFAULT_CONFIG.verbose);
  enableDebug(config.debug || DEFAULT_CONFIG.debug);
  setLogger(config.logger || DEFAULT_CONFIG.logger);
  setConditionHandlers(config.conditionHandlers ||
      DEFAULT_CONFIG.conditionHandlers);
  configured = true;
}
module.exports.configure();

module.exports.init = function(schema, options) {
  schema.statics.dataTable = dataTable;
}

function dataTable(query, options, callback) {
  Tools.debug("Query:", query);
  var self = this;
  if ('function' == typeof options) {
    callback = options;
    options = {};
  } else options = options || {}
  if ('function' != typeof callback) { throw new Error("Missing callback !"); }
  if ('object'!= typeof query) { return callback(new Error("Invalid query !")); }
  var searchCriteria = buildSearchCriteria(self, query, options);
  if (searchCriteria.isSelectEmpty()) { return callback(new Error("No valid field requested !")); }
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
  return searchCriteria;
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
  this.count(searchCriteria.options.conditions || {}, function(err, count) {
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
  var query = this.aggregate();
  if (searchCriteria.conditions) query.match(searchCriteria.conditions);
  // Sort before skip and limit in order to preserve initial sort integrity
  if (Object.keys(searchCriteria.sort).length > 0) {
    query.sort(searchCriteria.sort);
  }
  query.skip(searchCriteria.pageStart);
  if (searchCriteria.pageSize >= 0) query.limit(searchCriteria.pageSize);
  if (searchCriteria.aggregates.length > 0) {
    searchCriteria.aggregates.forEach(function(aggregate) {
      query.unwind(aggregate.unwind).match(aggregate.match)
        .group(aggregate.group).project(aggregate.project);
    });
  }
  var project = {};
  for (var key in searchCriteria.select) {
    project[key] = searchCriteria.select[key];
  }
  if ('object' == typeof searchCriteria.options.select) {
    if( Object.prototype.toString.call( searchCriteria.options.select ) === '[object Array]' ) {
        for (var key in searchCriteria.options.select) {
          project[searchCriteria.options.select[key]] = 1;
        }
    } else {
        for (var key in searchCriteria.options.select) {
          project[key] = searchCriteria.options.select[key];
        }
    }
  } else if ('string' == typeof searchCriteria.options.select) {
    searchCriteria.options.select.split(' ').forEach(function(value) {
      if (value.indexOf('+') == 0) { project[value.substring(1)] = 1; }
      else if (value.indexOf('-') == 0) { project[value.substring(1)] = 0; }
      else { project[value] = 1; }
    });
  }
  if (Object.keys(project).length > 0) { query.project(project); }
  var self = this;
  query.exec(function(err, records) {
    if (err) return callback(err);
    if (searchCriteria.populate.length == 0) {
      resultHolder.records = records;
      return callback(null, searchCriteria, resultHolder);
    }
    self.populate(records, searchCriteria.populate, function(err, records) {
      if (err) return callback(err);
      resultHolder.records = records;
      callback(null, searchCriteria, resultHolder);
    });
  });
}
