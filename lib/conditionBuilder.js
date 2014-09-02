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

module.exports.getGeneralSearch = function(field, search, options) {
  if (search && search.length > 0)
    return buildCondition(field, search, options);
}

module.exports.getFieldSearch = function(field, options) {
  if (!field.search) return undefined;
  var disjunction = [];
  if (field.search.search && 
  ( field.search.search.length > 0 || Object.prototype.toString.call(field.search.search) === '[object RegExp]')) 
    disjunction.push(field.search.search);
  if (field.search.chunks && field.search.chunks.length > 0) {
    field.search.chunks.forEach(function(value) {
      disjunction.push(value);
    });
  }
  if (disjunction.length > 0)
    return buildCondition(field, disjunction, options);
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

