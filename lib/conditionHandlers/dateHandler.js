var util = require('util');
var regexp = new RegExp("^(=|>|<|<>)[ \t]+([^,]+)(?:,[ \t]*(.+))?$");

module.exports = function(field, search) {
  var valueIn = [];
  var fromValue;
  var toValue;
  search.forEach(function(chunk) {
    if (util.isRegExp(chunk)) return valueIn.push(chunk);
    if (regexp.test(chunk)) {
      var type = RegExp.$1;
      var from = RegExp.$2;
      var to = RegExp.$3;
      if (type == '=') {
        from = new Date(from);
        if (util.isDate(from)) valueIn.push(from);
      } else if (type == '>') {
        from = new Date(from);
        if (util.isDate(from) &&
            (fromValue == null || from.getTime() > fromValue.getTime()))
          fromValue = from;
      } else if (type == '<') {
        from = new Date(from);
        if (util.isDate(from) &&
            (toValue == null || from.getTime() < toValue.getTime()))
          toValue = from;
      } else if (type == '<>') {
        from = from ? new Date(from) : null;
        to = to ? new Date(to) : null;
        if (util.isDate(from) && util.isDate(to)) {
          if (fromValue == null || from.getTime() > fromValue.getTime())
            fromValue = from;
          if (toValue == null || to.getTime() < toValue.getTime())
            toValue = to;
        }
      }
    } else {
      chunk = Date.parse(chunk);
      if (util.isDate(chunk)) valueIn.push(chunk);
    }
  });
  if (valueIn.length > 0) return { $in: valueIn };
  if (fromValue && toValue) return { $gt: fromValue, $lt: toValue };
  if (fromValue) return { $gt: fromValue };
  if (toValue) return { $lt: toValue };
}
