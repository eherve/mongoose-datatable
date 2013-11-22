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
        from = Number(from);
        if (!isNaN(from)) valueIn.push(from);
      } else if (type == '>') {
        from = Number(from);
        if (!isNaN(from) &&
            (fromValue == null || from.getTime() > fromValue.getTime()))
          fromValue = from;
      } else if (type == '<') {
        from = Number(from);
        if (!isNaN(from) &&
            (toValue == null || from.getTime() < toValue.getTime()))
          toValue = from;
      } else if (type == '<>') {
        from = from ? Number(from) : null;
        to = to ? Number(to) : null;
        if (!isNaN(from) && !isNaN(to)) {
          if (fromValue == null || from.getTime() > fromValue.getTime())
            fromValue = from;
          if (toValue == null || to.getTime() < toValue.getTime())
            toValue = to;
        }
      }
    } else if (/[0-9.]+/.test(chunk)) {
      chunk = Number(chunk);
      if (!isNaN(chunk)) valueIn.push(chunk);
    }
  });
  if (valueIn.length > 0) return { $in: valueIn };
  if (fromValue && toValue) return { $gt: fromValue, $lt: toValue };
  if (fromValue) return { $gt: fromValue };
  if (toValue) return { $lt: toValue };
}
