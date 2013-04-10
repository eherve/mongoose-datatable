var util = require('util');

module.exports = function(field, search) {
  if (util.isRegExp(search)) return search;
  else return new RegExp(search, 'i');
}
