var util = require('util')
  , verbose, debug;


module.exports.configure = function(options) {
  options = options || {};
  enableVerbose(options.verbose);
  enableDebug(options.debug);
}

var enableVerbose =
module.exports.enableVerbose = function(enabled) {
  verbose = enabled === true ? true : false;
}

var enableDebug =
module.exports.enableDebug = function(enabled) {
  debug = enabled === true ? true : false;
}

/*
 * Log methods
*/

module.exports.debug = function() {
  if (debug === true) {
    console.log.apply(console, arguments);
  }
}

module.exports.verbose = function() {
  if (verbose === true) {
    console.log.apply(console, arguments);
  }
}
