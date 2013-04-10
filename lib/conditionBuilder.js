var util = require('util')
  , unknownTypeHandler = require('./conditionHandlers/unknownTypeHandler');

// Conditions
var DISJUNCTION_KEY = '$or';
var CONJUNCTION_KEY = '$and';

var handlers = {};
module.exports.setConditionHandlers = function(conditionHandlers) {
  if (conditionHandlers != undefined) {
    handlers = conditionHandlers;
  } else handlers = {};
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

module.exports.getFieldConditions = function(field) {
  return getConditions(field, field.search);
}

var getConditions =
module.exports.getConditions = function(field, search) {
  var conditions;
  if (search.length == 1) {
    var condition = buildCondition(field, search[0]);
    if (condition != undefined) {
      conditions = {};
      conditions[field.path] = condition;
    }
  } else {
    var disjunction = [];
    search.forEach(function(value) {
      var condition = buildCondition(field, value);
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

function buildCondition(field, search) {
  if ('object' != typeof handlers) return unknownTypeHandler(field);
  var handler = handlers[field.type] || handlers.default;
  if (!handler || 'function' != typeof handler) {
    return unknownTypeHandler(field);
  }
  return handler(field, search);
}

