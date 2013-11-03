var util = require('util'), verbose, debug, log;

module.exports.enableVerbose = function(enabled) {
  verbose = enabled === true ? true : false;
}

module.exports.enableDebug = function(enabled) {
  debug = enabled === true ? true : false;
}

module.exports.setLogger = function(logger) {
  log = 'function' == typeof logger ? logger : log;
}

/*
 * Log methods
*/

module.exports.debug = function() {
  if (debug === true) {
    log('debug', arguments);
  }
}

module.exports.verbose = function() {
  if (verbose === true) {
    log('verbose', arguments);
  }
}
