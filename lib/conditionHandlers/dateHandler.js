var util = require('util');
var regexp = new RegExp("^(=|>|<|<>)[ \t]+([^,]+)(?:,[ \t]*(.+))?$");

module.exports = function(field, search) {
  if (util.isRegExp(search)) return search;
  if (regexp.test(search)) {
    var type = RegExp.$1;
    var from = RegExp.$2;
    var to = RegExp.$3;
    if (type == '=') {
      from = new Date(from);
      return util.isDate(from) ? from : undefined;
    } else if (type == '>') {
      from = new Date(from);
      return util.isDate(from) ? { $gt: from } : undefined;
    } else if (type == '<') {
      from = new Date(from);
      return util.isDate(from) ? { $lt: from } : undefined;
    } else if (type == '<>') {
      from = from ? new Date(from) : null;
      to = to ? new Date(to) : null;
      return util.isDate(from) && util.isDate(to) ?
      { $gt: from, $lt: to } : undefined;
    }
  }
  return undefined;
}
