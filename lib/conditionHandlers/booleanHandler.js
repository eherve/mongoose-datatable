module.exports = function(field, search) {
  if (/^true$/i.test(search)) return true;
  if (/^false$/i.test(search)) return false;
  return undefined;
}

