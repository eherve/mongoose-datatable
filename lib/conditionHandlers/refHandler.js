var Tools = require('../tools');
var checkForHexRegExp = new RegExp("^[0-9a-fA-F]{24}$");

module.exports = function(field, search) {
  if (checkForHexRegExp.test(search)) {
    if (field.refType == 'String') return { $in: search };
    if (field.refType == 'ObjectId') return { $in: search };
    Tools.verbose("Unmanaged condition on field ref type:", field.refType);
  }
}
