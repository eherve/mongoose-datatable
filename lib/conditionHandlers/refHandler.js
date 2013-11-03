module.exports = function(field, search) {
  if (field.refType == 'String') return search;
  Tools.verbose("Unmanaged condition on field ref type:", field.refType);
}

