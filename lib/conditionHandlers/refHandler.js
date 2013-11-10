var Tools = require('../tools');

module.exports = function(field, search) {
  if (field.refType == 'String') return { $in: search };
  if (field.refType == 'ObjectId') return { $in: search };
  Tools.verbose("Unmanaged condition on field ref type:", field.refType);
}
