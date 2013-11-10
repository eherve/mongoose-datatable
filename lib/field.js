var util = require('util'),
    SearchBuilder = require('./searchBuilder'),
    PATH_SEPARATOR = '.';

// Query fields
var QUERY_FIELD_PREFIX = 'mDataProp_';
var QUERY_SEARCHABLE_PREFIX = 'bSearchable_';
var QUERY_SORTABLE_PREFIX = 'bSortable_';

// Mongoose schema DataTable options
var SELECTABLE_OPTION = 'select';
var SELECTABLE_DATA_TABLE_OPTION = 'dataTableSelect';

// Field Types
var REF_TYPE = 'RefId';
var ARRAY_TYPE = 'Array';

var Field = module.exports = function Field(model, query, sorts, index) {
  var index = index;
  var path = query[util.format("%s%s", QUERY_FIELD_PREFIX, index)];
  if (path == undefined) return undefined;
  var searchable = isFieldSearchable(query, index);
  var search = searchable ? SearchBuilder.getFieldSearch(index, path)
    : undefined;
  var sortable = isFieldSortable(query, index);
  var sort = sortable ? sorts[index]
    : undefined;
  var info = {};
  if (!loadSchemaInfo(model, info, model.schema, path))
    throw Error(util.format("Unknown field path %s !", path));

  Object.defineProperty(this, "index", {
    writable: false, enumerable: true, value: index });

  Object.defineProperty(this, "path", {
    writable: false, enumerable: true, value: path });

  Object.defineProperty(this, "searchable", {
    writable: false, enumerable: true, value: searchable });

  Object.defineProperty(this, "search", {
    writable: false, enumerable: true, value: search });

  Object.defineProperty(this, "sortable", {
    writable: false, enumerable: true, value: sortable });

  Object.defineProperty(this, "sort", {
    writable: false, enumerable: true, value: sort });

  Object.defineProperty(this, "selectable", {
    writable: false, enumerable: true, value: info.selectable });

  Object.defineProperty(this, "type", {
    writable: false, enumerable: true, value: info.type });

  Object.defineProperty(this, "ref", {
    writable: false, enumerable: true, value: info.ref });

  Object.defineProperty(this, "refType", {
    writable: false, enumerable: true, value: info.refType });

  Object.defineProperty(this, "arrayType", {
    writable: false, enumerable: true, value: info.arrayType });

  Object.defineProperty(this, "base", {
    writable: false, enumerable: true, value: info.base });

  Object.defineProperty(this, "arrayPath", {
    writable: false, enumerable: true, value: info.arrayPath });

}

Object.defineProperty(Field, "TYPES", {
    writable: false, enumerable: true,
  value: {
    REF_TYPE: REF_TYPE,
    ARRAY_TYPE: ARRAY_TYPE
  }
});

function isFieldSearchable(query, index) {
  return query[util.format("%s%s", QUERY_SEARCHABLE_PREFIX, index)] == 'true';
}

function isFieldSortable(query, index) {
  return query[util.format("%s%s", QUERY_SORTABLE_PREFIX, index)] == 'true';
}

function loadSchemaInfo(model, info, schema, path) {
  var schemaField = schema.path(path);
  if (schemaField) {
    info.selectable = isFieldSelectable(schemaField);
    if (schemaField.options.ref) {
      info.type = REF_TYPE;
      info.refType = schemaField.options.type.name;
      info.ref = schemaField.options.ref;
    } else if (util.isArray(schemaField.options.type)) {
      info.type = ARRAY_TYPE;
      if (schemaField.caster && schemaField.caster.options &&
          schemaField.caster.options.ref) {
        info.arrayType = REF_TYPE;
        info.ref = schemaField.caster.options.ref;
      } else {
        // TODO retrieve the field array type when not a ref
        //console.log(util.inspect(schemaField, false, null, true));
      }
    } else {
      info.type = schemaField.options.type.name;
    }
    return true;
  } else {
    return loadPopulatedSchemaInfo(model, info, schema, path);
  }
}

function isFieldSelectable(field) {
  if (field && (field.options[SELECTABLE_OPTION] == undefined ||
        field.options[SELECTABLE_OPTION] === true) &&
      (field.options[SELECTABLE_DATA_TABLE_OPTION] == undefined ||
       field.options[SELECTABLE_DATA_TABLE_OPTION] === true))
    return true;
  return false;
}

function loadPopulatedSchemaInfo(model, info, schema, path) {
  var path = path;
  var baseField = getBasePopulatedField(schema, path);
  if (!baseField) return false;
  var basePath = baseField.path;
  var newPath = path.substring(basePath.length + 1);
  if (baseField.schema) {
    var loaded = loadSchemaInfo(model, info, baseField.schema, newPath);
    if (!loaded) return false;
    if (util.isArray(baseField.options.type)) info.arrayPath = basePath;
    if (info.base != undefined) {
      info.base.forEach(function(p, i) {
        info.base[i] = basePath + PATH_SEPARATOR + p;
      });
    }
    return true;
  }
  if (info.base == undefined) info.base = [];
  info.base.push(basePath);
  var baseType = baseField.options.ref || baseField.caster.options.ref;
  var newSchema = model.base.modelSchemas[baseType];
  if (!newSchema) return;
  return loadSchemaInfo(model, info, newSchema, newPath);
}

function getBasePopulatedField(schema, path) {
  var baseField;
  var tail = path;
  var base;
  var indexSep;
  var index = -1;
  var count = 0;
  while ((indexSep = tail.indexOf(PATH_SEPARATOR)) != -1) {
    if (++count > 10) break;
    index += indexSep + 1;
    var base = path.substring(0, index);
    baseField = schema.path(base);
    if (baseField) return baseField;
    tail = path.substring(base.length + 1);
  }
}
