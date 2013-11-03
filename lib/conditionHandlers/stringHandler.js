var util = require('util');

module.exports = function(field, search) {
  if (util.isRegExp(search)) return search;
  return new RegExp(search, 'i');
}
