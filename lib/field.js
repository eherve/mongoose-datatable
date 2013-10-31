var util = require('util')
  , SearchBuilder = require('./searchBuilder')
  , PATH_SEPARATOR = '.';

// Query fields
var QUERY_FIELD_PREFIX = 'mDataProp_';
var QUERY_SEARCHABLE_PREFIX = 'bSearchable_';
var QUERY_SORTABLE_PREFIX = 'bSortable_';

// Mongoose schema DataTable options
var SELECTABLE_OPTION = 'select';
var SELECTABLE_DATA_TABLE_OPTION = 'dataTableSelect';

// Field Types
var ARRAY_TYPE = 'Array';
var REF_TYPE = 'RefId';

module.exports = function(model, query, sorts, index) {
  var index = index;
  var path = query[util.format("%s%s", QUERY_FIELD_PREFIX, index)];
  if (path == undefined) return undefined;
  var searchable = isFieldSearchable(query, index);
  var search = searchable ? SearchBuilder.buildSearch(query, index, path)
    : undefined;
  var sortable = isFieldSortable(query, index);
  var sort = sortable ? sorts[index]
    : undefined;
  var info = {};
  if (!loadSchemaInfo(model, info, model.schema, path)) return undefined;
  return {
    get index() { return index; },
    get path() { return path; },
    get searchable() { return searchable; },
    get search() { return search; },
    get sortable() { return sortable; },
    get sort() { return sort; },
    get selectable() { return info.selectable; },
    get type() { return info.type; },
    get ref() { return info.ref; },
    get arrayType() { return info.arrayType; },
    get base() { return info.base; },
    get data() {
      return {
        index: index,
        path: path,
        searchable: searchable,
        search: search,
        sortable: sortable,
        sort: sort,
        selectable: info.selectable,
        type: info.type,
        ref: info.ref,
        arrayType: info.arrayType,
        base: info.base
      };
    },
    toString: function() {
      return util.inspect(this.data, false, null, true);
    }
  }
}

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
  console.log("\npath:", path);
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
