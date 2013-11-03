var util = require('util'),
    Field = require('./field'),
    unknownTypeHandler = require('./conditionHandlers/unknownTypeHandler');

// Conditions
var DISJUNCTION_KEY = '$or';
var CONJUNCTION_KEY = '$and';

var handlers = {};
module.exports.setConditionHandlers = function(conditionHandlers) {
  if (conditionHandlers != undefined) {
    handlers = conditionHandlers;
  } else handlers = {};
}

module.exports.getConditionHandlers = function() {
  return handlers;
}

module.exports.buildConjunction = function(conjunctions) {
  var conjunction = {};
  conjunction[CONJUNCTION_KEY] = conjunctions || [];
  return conjunction;
}

module.exports.buildDisjunction = function(disjunctions) {
  var disjunction = {};
  disjunction[DISJUNCTION_KEY] = disjunctions || [];
  return disjunction;
}

module.exports.getConditions = function(field, search, options) {
  var conditions;
  if ('string' == typeof search) search = [ search ];
  if (search.length == 1) {
    var condition = buildCondition(field, search[0], options);
    if (condition != undefined) {
      conditions = {};
      conditions[field.path] = condition;
    }
  } else {
    var disjunction = [];
    search.forEach(function(value) {
      var condition = buildCondition(field, value, options);
      if (condition != undefined) {
        var element = {};
        element[field.path] = condition;
        disjunction.push(element);
      }
    });
    if (disjunction.length > 0) {
      conditions = {};
      conditions[DISJUNCTION_KEY] = disjunction;
    }
  }
  return conditions;
}

function buildCondition(field, search, options) {
  if ('object' == typeof options.handlers) {
    if ('function' == typeof options.handlers[field.path]) {
      return options.handlers[field.path](field, search, options);
    }
    if ('function' == typeof options.handlers[field.type]) {
      return options.handlers[field.type](field, search, options);
    }
  }
  if ('object' == typeof handlers) {
    if ('function' == typeof handlers[field.type]) {
      return handlers[field.type](field, search, options);
    }
    if ('function' == typeof handlers.default) {
      return handlers.default(field, search, options);
    }
  }
  return unknownTypeHandler(field);
}

