var util = require('util');

module.exports = function(field, search) {
  var value = [];
  search.forEach(function(chunk) {
    if (util.isRegExp(search)) value.push(chunk);
    else value.push(new RegExp(chunk, 'i'));
  });
  return value.length == 0 ? undefined : { $in: value };
}
