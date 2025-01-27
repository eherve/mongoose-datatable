"use strict";
/** @format */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.datatablePlugin = datatablePlugin;
const mongoose_1 = require("mongoose");
const util_1 = require("util");
const lodash_1 = __importDefault(require("lodash"));
function datatablePlugin(schema, options) {
    schema.statics.datatableOptions = () => options;
    schema.statics.datatable = datatable;
    // TODO remove in later version
    schema.statics.dataTable = function (query, options) {
        console.warn('DEPRECATED use model.datatable');
        return datatable.call(this, query, options);
    };
}
function datatable(query, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const pipeline = yield buildPipeline(this, query, options);
        const recordsTotalPipeline = [{ $group: { _id: null, value: { $sum: 1 } } }];
        const recordsFilteredPipeline = [
            ...pipeline,
            { $group: { _id: null, value: { $sum: 1 } } },
        ];
        const dataPipeline = [...pipeline];
        const $sort = buildSort(query);
        if ($sort)
            dataPipeline.push({ $sort });
        const pagination = buildPagination(query);
        dataPipeline.push({ $skip: pagination.start });
        if (pagination === null || pagination === void 0 ? void 0 : pagination.length)
            dataPipeline.push({ $limit: pagination.length });
        (_a = options === null || options === void 0 ? void 0 : options.logger) === null || _a === void 0 ? void 0 : _a.debug((0, util_1.inspect)(dataPipeline, false, null, true));
        const res = yield this.aggregate([
            {
                $facet: {
                    recordsTotal: recordsTotalPipeline,
                    recordsFiltered: recordsFilteredPipeline,
                    data: dataPipeline,
                },
            },
            {
                $project: {
                    recordsTotal: { $first: '$recordsTotal.value' },
                    recordsFiltered: { $first: '$recordsFiltered.value' },
                    data: '$data',
                },
            },
        ]);
        return {
            draw: query.draw,
            recordsTotal: res ? res[0].recordsTotal : 0,
            recordsFiltered: res ? res[0].recordsFiltered : 0,
            data: res ? res[0].data : [],
        };
    });
}
function buildPipeline(model, query, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const project = { $project: {} };
        const $or = [];
        const $and = [];
        const lookups = [];
        const pipeline = [];
        query.columns.forEach(column => {
            const path = column.data.trim();
            if (!path.length)
                return;
            project.$project[path] = 1;
            const fields = getSchemaFieldInfo(model, path, options);
            const globalFilter = getSearch(column, query.search, (fields === null || fields === void 0 ? void 0 : fields.length) ? fields[fields.length - 1] : undefined);
            $or.push(...globalFilter);
            const columnFilter = getSearch(column, column.search, (fields === null || fields === void 0 ? void 0 : fields.length) ? fields[fields.length - 1] : undefined);
            if (fields === null || fields === void 0 ? void 0 : fields.length) {
                if (!isSelectable(fields))
                    return;
                if (fields.length === 1) {
                    $and === null || $and === void 0 ? void 0 : $and.push(...columnFilter);
                    return;
                }
                fields.forEach((field, index) => {
                    var _a;
                    if (!index)
                        return;
                    const previousField = fields[index - 1];
                    const from = getFieldRefModel(model, fields[index - 1], options).collection.name;
                    const localField = fields.slice(0, index).reduce((pv, cv, i) => (!i ? cv.path : (pv += `.${cv.path}`)), '');
                    if (!((_a = previousField.array) === null || _a === void 0 ? void 0 : _a.length)) {
                        lookups.push({ $lookup: { from, localField, foreignField: '_id', as: localField } });
                        if (previousField.instance !== 'Array') {
                            lookups.push({ $unwind: { path: `$${localField}`, preserveNullAndEmptyArrays: true } });
                        }
                    }
                    else {
                        previousField.array.forEach((_, index) => {
                            const path = previousField.array.slice(0, index + 1).join('.');
                            lookups.push({ $unwind: `$${path}` });
                        });
                        lookups.push({ $lookup: { from, localField, foreignField: '_id', as: localField } }, { $unwind: { path: `$${localField}`, preserveNullAndEmptyArrays: true } });
                        previousField.array.forEach((_, index) => {
                            const path = previousField.array.slice(0, previousField.array.length - index).join('.');
                            const data = {};
                            lodash_1.default.set(data, path, '$data');
                            lookups.push({ $group: { _id: '$_id', root: { $first: '$$ROOT' }, data: { $push: `$${path}` } } }, { $replaceRoot: { newRoot: { $mergeObjects: ['$root', data] } } });
                        });
                    }
                });
                if (columnFilter.length)
                    lookups.push({ $match: { $and: columnFilter } });
            }
        });
        if ($and.length)
            pipeline.push({ $match: { $and } });
        pipeline.push(...lookups);
        if ($or.length)
            pipeline.push({ $match: { $or } });
        pipeline.push(project);
        return pipeline;
    });
}
function getSearch(column, search, field) {
    var _a, _b;
    if (column.searchable === false)
        return [];
    if (!search)
        return [];
    const filters = [];
    switch (((_a = field === null || field === void 0 ? void 0 : field.instance) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || ((_b = column.type) === null || _b === void 0 ? void 0 : _b.toLowerCase())) {
        case 'string':
            filters.push(...getStringSearch(column, search));
            break;
        case 'boolean':
            filters.push(...getBooleanSearch(column, search));
            break;
        case 'number':
            filters.push(...getNumberSearch(column, search));
            break;
        case 'date':
            filters.push(...getDateSearch(column, search));
            break;
        case 'objectid':
            filters.push(...getObjectIdSearch(column, search));
            break;
    }
    return filters;
}
function getObjectIdSearch(column, search) {
    const filters = [];
    let value;
    if (typeof search.value === 'string' && mongoose_1.Types.ObjectId.isValid(search.value)) {
        value = mongoose_1.Types.ObjectId.createFromHexString(search.value);
    }
    else if (typeof search.value === 'number' && mongoose_1.Types.ObjectId.isValid(search.value)) {
        value = mongoose_1.Types.ObjectId.createFromTime(search.value);
    }
    else if (typeof search.value === 'object')
        value = search.value; // TODO allow disable for security reason
    else if (search.value === null)
        value = null;
    const filter = buildFilter(column.data, search.operator, value);
    if (filter)
        filters.push(filter);
    return filters;
}
function getDateSearch(column, search) {
    var _a, _b, _c, _d;
    const filters = [];
    let value;
    if (typeof search.value === 'string') {
        value = search.value
            .split(';')
            .map(value => new Date(value))
            .filter(value => !isNaN(value.valueOf()));
    }
    else if (typeof search.value === 'number')
        value = new Date(search.value);
    else if (search.value instanceof Date)
        value = search.value;
    else if (((_a = search.value) === null || _a === void 0 ? void 0 : _a.from) || ((_b = search.value) === null || _b === void 0 ? void 0 : _b.to)) {
        const from = ((_c = search.value) === null || _c === void 0 ? void 0 : _c.from) ? new Date(search.value.from) : undefined;
        if (from && !isNaN(from.valueOf()))
            value = [...(value || []), from];
        const to = ((_d = search.value) === null || _d === void 0 ? void 0 : _d.to) ? new Date(search.value.to) : undefined;
        if (to && !isNaN(to.valueOf()))
            value = [...(value || []), to];
    }
    else if (typeof search.value === 'object')
        value = search.value; // TODO allow disable for security reason
    else if (search.value === null)
        value = null;
    const filter = buildFilter(column.data, search.operator, value);
    if (filter)
        filters.push(filter);
    return filters;
}
function getNumberSearch(column, search) {
    const filters = [];
    let value;
    if (typeof search.value === 'string') {
        value = search.value
            .split(';')
            .map(value => parseFloat(value))
            .filter(value => !isNaN(value));
    }
    else if (typeof search.value === 'number')
        value = search.value;
    else if (typeof search.value === 'object')
        value = search.value; // TODO allow disable for security reason
    else if (search.value === null)
        value = null;
    const filter = buildFilter(column.data, search.operator, value);
    if (filter)
        filters.push(filter);
    return filters;
}
function getBooleanSearch(column, search) {
    const filters = [];
    let value;
    if (typeof search.value === 'string') {
        const stringValue = search.value.trim().toLowerCase();
        value = stringValue === 'true' ? true : stringValue === 'false' ? false : undefined;
    }
    else if (typeof search.value === 'boolean')
        value = search.value;
    else if (typeof search.value === 'object')
        value = search.value; // TODO allow disable for security reason
    else if (search.value === null)
        value = null;
    const filter = buildFilter(column.data, search.operator, value);
    if (filter)
        filters.push(filter);
    return filters;
}
function getStringSearch(column, search) {
    const filters = [];
    let value;
    if (typeof search.value === 'string')
        value = search.value;
    else if (typeof search.value === 'object')
        value = search.value; // TODO allow disable for security reason
    else if (search.value === null)
        value = null;
    const filter = buildFilter(column.data, search.operator, value, search.regex);
    if (filter)
        filters.push(filter);
    return filters;
}
function buildFilter(property, op, value, regex = false) {
    if (value === undefined)
        return;
    if (value === null)
        return { [property]: null };
    const value1 = Array.isArray(value) && value.length >= 1 ? value[0] : value;
    const value2 = Array.isArray(value) && value.length >= 2 ? value[1] : undefined;
    switch (op) {
        case '>':
            return { [property]: { $gt: value1 } };
        case '≥':
            return { [property]: { $gte: value1 } };
        case '<':
            return { [property]: { $lt: value1 } };
        case '≤':
            return { [property]: { $lte: value1 } };
        case '<>':
            return { [property]: { $gt: value1, $lt: value2 } };
        case '≤≥':
            return { [property]: { $gte: value1, $lte: value2 } };
        case '><':
            return { [property]: { $gt: value1, $lt: value2 } };
        case '≥≤':
            return { [property]: { $gte: value1, $lte: value2 } };
        case '$in':
            return { [property]: { $in: value } };
        case '$nin':
            return { [property]: { $nin: value } };
        default:
            if (regex)
                return { [property]: new RegExp(value1) };
            return { [property]: value1 };
    }
}
function isSelectable(fields) {
    for (let field of fields) {
        if (field.selectabled === false)
            return false;
    }
    return true;
}
function getSchemaFieldInfo(model, path, options) {
    const field = model.schema.path(path);
    if (field)
        return [buildFieldInfo(path, field)];
    const fields = [];
    let base = path.substring(0, path.lastIndexOf('.'));
    path = path.substring(base.length + 1);
    while (path.length) {
        const baseField = model.schema.path(base);
        if (baseField) {
            const info = buildFieldInfo(base, baseField);
            fields.push(info);
            const pathModel = getFieldRefModel(model, info, options);
            if (!pathModel)
                return;
            const pathFields = getSchemaFieldInfo(pathModel, path, options);
            if (!(pathFields === null || pathFields === void 0 ? void 0 : pathFields.length))
                return;
            fields.push(...pathFields);
            break;
        }
        else {
            base = path.substring(0, path.lastIndexOf('.'));
            path = path.substring(base.length + 1);
        }
    }
    return fields;
}
function buildFieldInfo(path, field) {
    var _a, _b, _c, _d, _e;
    let array = [];
    let schemaType = field.instance === 'Array' ? field.$embeddedSchemaType : field.$parentSchemaDocArray;
    while (schemaType) {
        array.splice(0, 0, schemaType.path);
        schemaType = schemaType.$parentSchemaDocArray;
    }
    let ref = (_a = field.options) === null || _a === void 0 ? void 0 : _a.ref;
    if (field.instance === 'Array')
        ref = (_c = (_b = field.options) === null || _b === void 0 ? void 0 : _b.type[0]) === null || _c === void 0 ? void 0 : _c.ref;
    return {
        path,
        instance: field.instance,
        ref,
        selectabled: (_e = (_d = field.options) === null || _d === void 0 ? void 0 : _d.datatable) === null || _e === void 0 ? void 0 : _e.selectabled,
        array,
    };
}
function getFieldRefModel(model, field, options) {
    var _a;
    try {
        if (field.ref)
            return model.db.model(field.ref);
    }
    catch (err) {
        (_a = options === null || options === void 0 ? void 0 : options.logger) === null || _a === void 0 ? void 0 : _a.warn(err);
    }
}
function buildPagination(query) {
    let start = 0;
    if (typeof query.start === 'string')
        start = parseInt(query.start);
    else if (typeof query.start === 'number')
        start = query.start;
    else
        start = 0;
    let length = undefined;
    if (typeof query.length === 'string')
        length = parseInt(query.length);
    else if (typeof query.length === 'number')
        length = query.length;
    return {
        start: !isNaN(start) ? start : 0,
        length: length !== undefined && !isNaN(length) ? length : undefined,
    };
}
function buildSort(query) {
    var _a;
    if (!((_a = query.order) === null || _a === void 0 ? void 0 : _a.length))
        return;
    const sort = {};
    query.order.forEach(order => {
        const column = query.columns[order.column];
        if (!column)
            return;
        sort[column.data] = order.dir == 'asc' ? 1 : -1;
    });
    if (!!Object.keys(sort).length)
        return sort;
    console.warn(`invalid order provided`);
}
//# sourceMappingURL=plugin.js.map