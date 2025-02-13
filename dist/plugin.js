"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.datatablePlugin = datatablePlugin;
const mongoose_1 = require("mongoose");
const util_1 = require("util");
const lodash = require("lodash");
function datatablePlugin(schema, options) {
    schema.statics.datatableOptions = () => options;
    schema.statics.datatable = datatable;
    schema.statics.dataTable = function (query, options) {
        console.warn('DEPRECATED use model.datatable');
        return datatable.call(this, query, options);
    };
}
async function datatable(query, options) {
    options?.logger?.debug('query', (0, util_1.inspect)(query, false, null, false));
    const pipeline = await buildPipeline(this, query, options);
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
    if (pagination?.length)
        dataPipeline.push({ $limit: pagination.length });
    const $facet = {
        recordsFiltered: recordsFilteredPipeline,
        data: dataPipeline,
    };
    if (query.disableTotal !== true)
        $facet.recordsTotal = recordsTotalPipeline;
    const aggregation = [
        { $facet },
        {
            $project: {
                recordsTotal: { $first: '$recordsTotal.value' },
                recordsFiltered: { $first: '$recordsFiltered.value' },
                data: '$data',
            },
        },
    ];
    if (options?.unwind?.length)
        aggregation.splice(0, 0, ...options.unwind.map($unwind => ({ $unwind })));
    if (options?.conditions)
        aggregation.splice(0, 0, { $match: options.conditions });
    options?.logger?.debug('aggregation', (0, util_1.inspect)(aggregation, false, null, false));
    const res = await this.aggregate(aggregation);
    return {
        draw: query.draw,
        recordsTotal: res ? res[0].recordsTotal : 0,
        recordsFiltered: res ? res[0].recordsFiltered : 0,
        data: res ? res[0].data : [],
    };
}
async function buildPipeline(model, query, options) {
    const project = getOptionsProject(options);
    const $or = [];
    const $and = [];
    const lookups = [];
    const pipeline = [];
    query.columns.forEach(column => {
        const path = column.data.trim();
        if (!path.length)
            return;
        project[path] = 1;
        const fields = getSchemaFieldInfo(model, path, options);
        const globalFilter = getSearch(column, query.search, fields?.length ? fields[fields.length - 1] : undefined);
        $or.push(...globalFilter);
        const columnFilter = getSearch(column, column.search, fields?.length ? fields[fields.length - 1] : undefined);
        if (fields?.length) {
            if (!isSelectable(fields))
                return;
            if (fields.length === 1) {
                $and?.push(...columnFilter);
                return;
            }
            fields.forEach((field, index) => {
                if (!index)
                    return;
                const previousField = fields[index - 1];
                const from = getFieldRefModel(model, fields[index - 1], options).collection.name;
                const localField = fields.slice(0, index).reduce((pv, cv, i) => (!i ? cv.path : (pv += `.${cv.path}`)), '');
                if (!previousField.array?.length) {
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
                        lodash.set(data, path, '$data');
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
    pipeline.push({ $project: consolidateProject(project) });
    return pipeline;
}
function consolidateProject(project) {
    const consolidated = {};
    Object.keys(project)
        .sort((p1, p2) => p1.length - p2.length)
        .forEach(key => {
        if (!Object.keys(consolidated).find(k => key.startsWith(`${k}.`))) {
            consolidated[key] = project[key];
        }
    });
    return consolidated;
}
function getOptionsProject(options) {
    if (!options?.select)
        return {};
    return typeof options.select === 'string'
        ? options.select.split(' ').reduce((p, c) => ((p[c] = 1), p), {})
        : Array.isArray(options.select)
            ? options.select.reduce((p, c) => ((p[c] = 1), p), {})
            : options.select;
}
function getSearch(column, search, field) {
    if (column.searchable === false)
        return [];
    if (!search)
        return [];
    const filters = [];
    switch (field?.instance?.toLowerCase() || column.type?.toLowerCase()) {
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
        value = search.value;
    else if (search.value === null)
        value = null;
    const filter = buildFilter(column.data, search.operator, value);
    if (filter)
        filters.push(filter);
    return filters;
}
function getDateSearch(column, search) {
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
    else if (search.value?.from || search.value?.to) {
        const from = search.value?.from ? new Date(search.value.from) : undefined;
        if (from && !isNaN(from.valueOf()))
            value = [...(value || []), from];
        const to = search.value?.to ? new Date(search.value.to) : undefined;
        if (to && !isNaN(to.valueOf()))
            value = [...(value || []), to];
    }
    else if (typeof search.value === 'object')
        value = search.value;
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
        value = search.value;
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
        value = search.value;
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
        value = search.value;
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
            if (!pathFields?.length)
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
    let array = [];
    let schemaType = field.instance === 'Array' ? field.$embeddedSchemaType : field.$parentSchemaDocArray;
    while (schemaType) {
        array.splice(0, 0, schemaType.path);
        schemaType = schemaType.$parentSchemaDocArray;
    }
    let ref = field.options?.ref;
    if (field.instance === 'Array')
        ref = field.options?.type[0]?.ref;
    return {
        path,
        instance: field.instance,
        ref,
        selectabled: field.options?.datatable?.selectabled,
        array,
    };
}
function getFieldRefModel(model, field, options) {
    try {
        if (field.ref)
            return model.db.model(field.ref);
    }
    catch (err) {
        options?.logger?.warn(err);
    }
}
function buildPagination(query) {
    let start = 0;
    if (typeof query.start === 'string')
        start = parseInt(query.start);
    else if (typeof query.start === 'number')
        start = query.start;
    if (isNaN(start))
        start = 0;
    let length = undefined;
    if (typeof query.length === 'string')
        length = parseInt(query.length);
    else if (typeof query.length === 'number')
        length = query.length;
    if (length !== undefined && isNaN(length))
        length = undefined;
    if (length !== undefined)
        start = start * length;
    return { start, length };
}
function buildSort(query) {
    if (!query.order?.length)
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
