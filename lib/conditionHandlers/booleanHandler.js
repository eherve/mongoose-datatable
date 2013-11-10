module.exports = function(field, search) {
  var value;
  search.forEach(function(chunk) {
    if (/^true$/i.test(chunk)) {
      value = true;
    } else if (/^false$/i.test(chunk)) {
      value = value || false;
    }
  });
  return value == undefined ? undefined : value;
}

