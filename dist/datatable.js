"use strict";
/** @format */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTableModule = void 0;
const flat = require("flat");
const lodash_1 = require("lodash");
const mongoose_1 = require("mongoose");
const util = require("util");
const SearchOperator = (0, lodash_1.orderBy)(['>', '>=', '≥', '<', '<=', '≤', '<>', '<=>', '≤≥', '><=', '>=<'], ['length'], ['desc']);
console.log(SearchOperator);
class DataTableModule {
    get config() {
        return this._config;
    }
    get logger() {
        return this._config.logger;
    }
    static configure(config) {
        if (config) {
            DataTableModule.CONFIG = (0, lodash_1.assign)(DataTableModule.CONFIG, config);
        }
        return DataTableModule.CONFIG;
    }
    static init(schema, config) {
        const dataTableModule = new DataTableModule(schema);
        schema.statics.dataTableConfig = (0, lodash_1.merge)({}, DataTableModule.CONFIG, config);
        schema.statics.dataTable = function (query, options) {
            options = (0, lodash_1.merge)({}, schema.statics.dataTableConfig, options);
            dataTableModule.model = this;
            return dataTableModule.dataTable(query, options);
        };
    }
    constructor(schema) {
        this.schema = schema;
        this._config = DataTableModule.CONFIG;
    }
    dataTable(query, options = {}) {
        this.debug(options.logger, 'quey:', util.inspect(query, { depth: null }));
        const aggregate = {
            projection: null,
            populate: [],
            sort: this.buildSort(query),
            pagination: this.pagination(query),
            groupBy: query.groupBy,
        };
        this.updateAggregateOptions(options, query, aggregate);
        return (options.disableCount === true ? Promise.resolve(-1) : this.recordsTotal(options)).then(recordsTotal => {
            return (options.disableCount === true ? Promise.resolve(-1) : this.recordsFiltered(options, aggregate, recordsTotal)).then(recordsFiltered => {
                return this.data(options, aggregate).then(data => {
                    return Promise.resolve({
                        draw: query.draw,
                        recordsTotal,
                        recordsFiltered,
                        data,
                    });
                });
            });
        });
    }
    buildSort(query) {
        if (!query.order || query.order.length === 0) {
            return null;
        }
        const sort = {};
        query.order.forEach(order => {
            const column = query.columns[order.column];
            if (column) {
                if (this.isFalse(column.orderable)) {
                    return;
                }
                sort[column.data] = order.dir === 'asc' ? 1 : -1;
            }
        });
        return !!Object.keys(sort).length ? sort : null;
    }
    updateAggregateOptions(options, query, aggregate) {
        let search = [], csearch = [], psearch = [];
        const projection = {};
        if (query.search && query.search.value !== undefined && query.search.value !== '') {
            query.search.chunks = this.getChunkSearch(query.search.value);
        }
        query.columns.forEach(column => {
            const finfo = this.fetchField(options, query, column, aggregate.populate);
            if (!finfo?.field)
                return;
            if (!this.isSelectable(finfo.field))
                return;
            if (this.isTrue(column.searchable)) {
                if (column.search && column.search.value !== undefined && column.search.value !== '') {
                    column.search.chunks = this.getChunkSearch(column.search.value);
                }
                const s = this.getSearch(options, query, column, finfo.field);
                search = search.concat(s.search);
                if (finfo.populated) {
                    psearch = psearch.concat(s.csearch);
                }
                else {
                    csearch = csearch.concat(s.csearch);
                }
            }
            projection[column.data] = 1;
        });
        this.addProjection(options, aggregate, projection);
        aggregate.search = this.addSearch(csearch);
        aggregate.afterPopulateSearch = this.addSearch(psearch, search, options.conditions);
    }
    getModel(base, modelName) {
        try {
            return base.db.model(modelName);
        }
        catch (err) { }
        return null;
    }
    addFieldRef(data) {
        data.populated = true;
        data.model = this.getModel(data.model, data.field.options.ref);
        if (!data.model)
            return;
        data.schema = data.model.schema;
        if (!data.populate.find((l) => l.$lookup && l.$lookup.localField === data.base)) {
            data.populate.push({
                $lookup: {
                    from: data.model.collection.collectionName,
                    localField: data.base,
                    foreignField: '_id',
                    as: data.base,
                },
            });
            data.populate.push({
                $unwind: { path: `$${data.base}`, preserveNullAndEmptyArrays: true },
            });
        }
    }
    addFieldArrayRef(data) {
        data.populated = true;
        data.model = this.getModel(data.model, data.field.options.ref);
        if (!data.model)
            return;
        data.schema = data.model.schema;
        if (!data.populate.find((l) => l.$lookup && l.$lookup.localField === data.base)) {
            const refProperty = data.base.substr(data.inArray.length + 1);
            const lookupProperty = `${data.inArray}__${refProperty}`;
            data.populate.push({
                $lookup: {
                    from: data.model.collection.collectionName,
                    localField: data.base,
                    foreignField: '_id',
                    as: lookupProperty,
                },
            });
            data.populate.push({
                $addFields: {
                    [data.inArray]: {
                        $map: {
                            input: `$${data.inArray}`,
                            as: 'elmt',
                            in: {
                                $mergeObjects: [
                                    '$$elmt',
                                    {
                                        [refProperty]: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: `$${lookupProperty}`,
                                                        as: 'lookup',
                                                        cond: {
                                                            $eq: [`$$elmt.${refProperty}`, '$$lookup._id'],
                                                        },
                                                    },
                                                },
                                                0,
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            });
        }
    }
    fieldNotFound(options, column, data) {
        if (!data?.model) {
            this.warn(options.logger, `field path ${column.data} refered model ${data.field?.options?.ref} not found !`);
        }
        else
            this.warn(options.logger, `field path ${column.data} not found !`);
        if (!options.processUnknownFields)
            return;
        return { field: { path: column.data }, populated: false };
    }
    fetchField(options, query, column, populate) {
        let populated = false;
        let field = this.schema.path(column.data);
        if (field)
            return { field, populated };
        const data = {
            populate,
            populated,
            field,
            path: column.data,
            model: this.model,
            schema: this.schema,
            base: '',
            inArray: null,
        };
        while (data.path.length) {
            data.field = data.schema.path(data.path) || this.getField(data.schema, data.path);
            if (!data.field)
                return this.fieldNotFound(options, column, data);
            data.base += (data.base.length ? '.' : '') + data.field.path;
            data.path = data.path.substring(data.field.path.length + 1);
            // ref field
            if (data.field.options && data.field.options.ref && !data.inArray) {
                this.addFieldRef(data);
                if (!data.model)
                    return this.fieldNotFound(options, column, data);
                continue;
            }
            // ref field in array
            if (data.field.options && data.field.options.ref && !!data.inArray) {
                this.addFieldArrayRef(data);
                if (!data.model)
                    return this.fieldNotFound(options, column, data);
                continue;
            }
            // ref array field ref
            if (data.field.instance === 'Array' &&
                data.field.caster &&
                data.field.caster.options &&
                data.field.caster.options.ref) {
                data.populated = true;
                data.model = this.getModel(data.model, data.field.caster.options.ref);
                if (!data.model) {
                    this.warn(options.logger, `field path ${column.data} refered model ${data.field.caster.options.ref} not found !`);
                    return;
                }
                data.schema = data.model.schema;
                if (!populate.find((l) => l.$lookup && l.$lookup.localField === data.base)) {
                    populate.push({
                        $lookup: {
                            from: data.model.collection.collectionName,
                            localField: data.base,
                            foreignField: '_id',
                            as: data.base,
                        },
                    });
                }
                continue;
            }
            // array field
            if (data.field.instance === 'Array') {
                data.inArray = data.base;
                if (data.field.schema) {
                    data.schema = data.field.schema;
                }
                continue;
            }
            // sub schema
            if (data.field.schema) {
                data.schema = data.field.schema;
                continue;
            }
            break;
        }
        if (!data.field) {
            this.warn(options.logger, `field path ${column.data} not found !`);
        }
        return { field: data.field, populated: data.populated };
    }
    getField(schema, path) {
        var baseField, tail = path, base, indexSep, index = -1, count = 0;
        while ((indexSep = tail.indexOf('.')) != -1) {
            if (++count > 10)
                break;
            index += indexSep + 1;
            var base = path.substring(0, index);
            baseField = schema.path(base);
            if (baseField) {
                return baseField;
            }
            tail = path.substring(base.length + 1);
        }
    }
    addProjection(options, aggregate, projection) {
        if (options.select || Object.keys(projection).length) {
            const select = typeof options.select === 'string'
                ? options.select.split(' ').reduce((p, c) => ((p[c] = 1), p), {})
                : Array.isArray(options.select)
                    ? options.select.reduce((p, c) => ((p[c] = 1), p), {})
                    : options.select;
            aggregate.projection = flat.unflatten((0, lodash_1.merge)(select, projection || {}), {
                overwrite: true,
            });
        }
    }
    addSearch(csearch, search = [], conditions) {
        let asearch;
        if (conditions || search.length || csearch.length) {
            asearch = { $and: [] };
            if (conditions) {
                asearch.$and.push(conditions);
            }
            if (search.length) {
                asearch.$and.push({ $or: search });
            }
            if (csearch.length) {
                asearch.$and = asearch.$and.concat(csearch);
            }
        }
        return asearch;
    }
    getSearch(options, query, column, field) {
        const search = [], csearch = [];
        if (query.search && query.search.value !== undefined && query.search.value !== '') {
            const s = this.buildColumnSearch(options, query, column, field, query.search, true);
            if (s) {
                search.push(s);
            }
        }
        if (column.search && column.search.value !== undefined && column.search.value !== '') {
            const s = this.buildColumnSearch(options, query, column, field, column.search, false);
            if (s) {
                csearch.push(s);
            }
        }
        return { search, csearch };
    }
    getChunkSearch(search) {
        let chunks = [];
        if ((0, lodash_1.isArray)(search)) {
            (0, lodash_1.each)(search, s => (chunks = (0, lodash_1.concat)(chunks, this.getChunkSearch(s))));
            return chunks;
        }
        search = search !== null && search !== undefined ? search.toString() : '';
        return search
            .replace(/(?:"([^"]*)")/g, (match, word) => {
            if (word && word.length > 0) {
                chunks.push(word);
            }
            return '';
        })
            .split(/[ \t]+/)
            .filter(s => (0, lodash_1.trim)(s) !== '');
    }
    buildColumnSearch(options, query, column, field, search, global) {
        let instance = field.instance;
        if (options.handlers && options.handlers[instance]) {
            return options.handlers[instance](query, column, field, search, global);
        }
        if (this.config.handlers[instance]) {
            return this.config.handlers[instance](query, column, field, search, global);
        }
        if (search.value === null) {
            const columnSearch = {};
            return (columnSearch[column.data] = null);
        }
        if (instance === 'Mixed') {
            if (column.type)
                instance = column.type;
            else
                instance = this.tryDeductMixedFromValue(search.value);
        }
        switch (instance) {
            case 'String':
                return this.buildColumnSearchString(options, column, search, global);
            case 'Boolean':
                return this.buildColumnSearchBoolean(options, column, search, global);
            case 'Number':
                return this.buildColumnSearchNumber(options, column, search, global);
            case 'Date':
                return this.buildColumnSearchDate(options, column, search, global);
            case 'ObjectID':
            case 'ObjectId':
                return this.buildColumnSearchObjectId(options, column, search, global);
            default:
                if (options.handlers && options.handlers.default) {
                    return options.handlers.default(query, column, field, search, global);
                }
                if (this.config.handlers.default) {
                    return this.config.handlers.default(query, column, field, search, global);
                }
                this.warn(options.logger, `buildColumnSearch column [${column.data}] type [${instance}] not managed !`);
        }
        return null;
    }
    tryDeductMixedFromValue(value) {
        if (value instanceof Date)
            return 'Date';
        switch (typeof value) {
            case 'string':
                if (mongoose_1.Types.ObjectId.isValid(value)) {
                    return 'ObjectID';
                }
                if (/^(=|>|>=|<=|<|<>|<=>)?([0-9.]+)(?:,([0-9.]+))?$/.test(value)) {
                    return 'Number';
                }
                if (/^(=|>|>=|<=|<|<>|<=>|><=|>=<)?([0-9.\/-]+)(?:,([0-9.\/-]+))?$/.test(value)) {
                    return 'Date';
                }
                return 'String';
            case 'boolean':
                return 'Boolean';
            case 'number':
                return 'Number';
        }
        return 'Mixed';
    }
    buildColumnSearchString(options, column, search, global = false) {
        this.debug(options.logger, 'buildColumnSearchString:', column.data, search);
        const values = global ? search.chunks : (0, lodash_1.isArray)(search.value) ? search.value : [search.value];
        const s = (0, lodash_1.map)(values, val => {
            if (typeof val === 'string' && search.regex)
                return { [column.data]: new RegExp(`${val}`, 'gi') };
            return { [column.data]: val };
        });
        return s.length > 0 ? (s.length > 1 ? { $or: s } : s[0]) : null;
    }
    buildColumnSearchBoolean(options, column, search, global = false) {
        if (global)
            return;
        this.debug(options.logger, 'buildColumnSearchBoolean:', column.data, search);
        if (['string', 'boolean'].includes(typeof search.value)) {
            const value = typeof search.value === 'boolean' ? search.value : (0, lodash_1.lowerCase)((0, lodash_1.trim)(search.value));
            if (value === 'true' || value === true) {
                return { [column.data]: true };
            }
            else if (value === 'false' || value === false) {
                return { [column.data]: false };
            }
        }
        this.warn(options.logger, `buildColumnSearchBoolean unmanaged search value '${search.value}'`);
    }
    buildCompare(op, value1, value2) {
        switch (op) {
            case '>':
                return { $gt: value1 };
            case '>=':
            case '≥':
                return { $gte: value1 };
            case '<':
                return { $lt: value1 };
            case '<=':
            case '≤':
                return { $lte: value1 };
            case '<>':
                return { $gt: value1, $lt: value2 };
            case '<=>':
            case '≤≥':
                return { $gte: value1, $lte: value2 };
            case '><=':
                return { $gt: value1, $lte: value2 };
            case '>=<':
                return { $gte: value1, $lt: value2 };
            default:
                return value1;
        }
    }
    parseStringValue(val) {
        const regexp = new RegExp(`^(${SearchOperator.join('|')})?(.*)$`);
        const match = val.match(regexp);
        if (match) {
            return { op: match.at(1), values: match.at(2)?.split(',') };
        }
        return null;
    }
    buildColumnSearchNumber(options, column, search, global = false) {
        this.debug(options.logger, 'buildColumnSearchNumber:', column.data, search);
        const values = global ? search.chunks : (0, lodash_1.isArray)(search.value) ? search.value : [search.value];
        const s = [];
        (0, lodash_1.each)(values, val => {
            let compare;
            if (typeof val === 'string') {
                compare = this.buildColumnSearchNumberString(val);
            }
            else if (typeof val === 'number') {
                compare = this.buildCompare(search.operator, val);
            }
            if (compare)
                s.push({ [column.data]: compare });
        });
        return s.length > 0 ? (s.length > 1 ? { $or: s } : s[0]) : null;
    }
    buildColumnSearchNumberString(val) {
        const data = this.parseStringValue(val);
        if (data) {
            const values = (0, lodash_1.filter)((0, lodash_1.map)(data.values, value => parseFloat(value)), value => !isNaN(value));
            if (values.length)
                return this.buildCompare(data.op, values[0], values[1]);
        }
    }
    buildColumnSearchDate(options, column, search, global = false) {
        this.debug(options.logger, 'buildColumnSearchDate:', column.data, search);
        const values = global ? search.chunks : (0, lodash_1.isArray)(search.value) ? search.value : [search.value];
        const s = [];
        (0, lodash_1.each)(values, val => {
            let compare;
            if (typeof val === 'string') {
                compare = this.buildColumnSearchDateString(val);
            }
            else if (typeof val === 'number') {
                compare = this.buildCompare(search.operator, new Date(val));
            }
            else if (Array.isArray(val)) {
                compare = this.buildCompare(search.operator, new Date(val[0]), new Date(val[1]));
            }
            else if (val?.from || val?.to) {
                const op = val.op || search.operator || '>=<';
                const from = val?.from ? new Date(val.from) : undefined;
                const to = val?.to ? new Date(val.to) : undefined;
                compare = this.buildCompare(op, from, to);
            }
            if (compare)
                s.push({ [column.data]: compare });
        });
        return s.length > 0 ? (s.length > 1 ? { $or: s } : s[0]) : null;
    }
    buildColumnSearchDateString(val) {
        const data = this.parseStringValue(val);
        console.log(val, data);
        if (data) {
            const values = (0, lodash_1.filter)((0, lodash_1.map)(data.values, value => new Date(value)), value => !isNaN(value.valueOf()));
            console.log(values);
            if (values.length)
                return this.buildCompare(data.op, values[0], values[1]);
        }
    }
    buildColumnSearchObjectId(options, column, search, global = false) {
        if (global)
            return;
        this.debug(options.logger, 'buildColumnSearchObjectId:', column.data, search);
        const values = (0, lodash_1.isArray)(search.value) ? search.value : [search.value];
        const s = [];
        (0, lodash_1.each)(values, val => {
            if (mongoose_1.Types.ObjectId.isValid(val))
                return s.push({ [column.data]: new mongoose_1.Types.ObjectId(val) });
            this.warn(options.logger, `buildColumnSearchObjectId unmanaged search value '${search.value}'`);
        });
        return s.length > 0 ? (s.length > 1 ? { $or: s } : s[0]) : null;
    }
    pagination(query) {
        const start = this.parseNumber(query.start, 0);
        const length = this.parseNumber(query.length, undefined);
        return {
            start: isNaN(start) ? 0 : start,
            length: isNaN(length) ? undefined : length,
        };
    }
    parseNumber(data, def) {
        if ((0, lodash_1.isNil)(data))
            return def;
        if (typeof data === 'string')
            return parseInt(data, 10);
        if (typeof data === 'number')
            return data;
        return def;
    }
    isTrue(data) {
        return data === true || data === 'true';
    }
    isFalse(data) {
        return data === false || data === 'false';
    }
    isSelectable(field) {
        return !field.options || (field.options.select !== false && field.options.dataTableSelect !== false);
    }
    async recordsTotal(options) {
        if (!!options.unwind?.length) {
            const aggregate = [];
            options.unwind.forEach($unwind => aggregate.push({ $unwind }));
            aggregate.push({ $match: options.conditions });
            // aggregate.push({ $group: { _id: null, count: { $sum: 1 } } });
            // return get(head(await this.model.aggregate(aggregate)), 'count');
            aggregate.push({ $count: 'count' });
            return this.model.aggregate(aggregate).then(data => (data.length === 1 ? data[0].count : 0));
        }
        return this.model.countDocuments(options.conditions);
    }
    async recordsFiltered(options, aggregateOptions, recordsTotal) {
        if (!aggregateOptions.search && !aggregateOptions.afterPopulateSearch) {
            return Promise.resolve(recordsTotal);
        }
        const aggregate = [];
        (options.unwind || []).forEach($unwind => aggregate.push({ $unwind }));
        if (aggregateOptions.search)
            aggregate.push({ $match: aggregateOptions.search });
        aggregateOptions.populate.forEach(data => aggregate.push(data));
        if (aggregateOptions.afterPopulateSearch)
            aggregate.push({ $match: aggregateOptions.afterPopulateSearch });
        aggregate.push({ $count: 'count' });
        return this.model.aggregate(aggregate).then(data => (data.length === 1 ? data[0].count : 0));
    }
    async data(options, aggregateOptions) {
        const aggregate = [];
        (options.unwind || []).forEach($unwind => aggregate.push({ $unwind }));
        if (aggregateOptions.search) {
            aggregate.push({ $match: aggregateOptions.search });
        }
        aggregateOptions.populate.forEach(data => aggregate.push(data));
        if (aggregateOptions.afterPopulateSearch) {
            aggregate.push({ $match: aggregateOptions.afterPopulateSearch });
        }
        if (aggregateOptions.projection) {
            aggregate.push({ $project: aggregateOptions.projection });
        }
        if (aggregateOptions.groupBy) {
            this.buildGroupBy(aggregateOptions).forEach(gb => aggregate.push(gb));
        }
        if (aggregateOptions.sort) {
            aggregate.push({ $sort: aggregateOptions.sort });
        }
        if (aggregateOptions.pagination) {
            if (aggregateOptions.pagination.start) {
                aggregate.push({
                    $skip: aggregateOptions.pagination.start * aggregateOptions.pagination.length,
                });
            }
            if (aggregateOptions.pagination.length) {
                aggregate.push({ $limit: aggregateOptions.pagination.length });
            }
        }
        this.debug(options.logger, util.inspect(aggregate, { depth: null }));
        return this.model.aggregate(aggregate).allowDiskUse(true);
    }
    buildGroupBy(aggregateOptions) {
        const aggregate = [];
        const _id = {};
        let id = [];
        aggregateOptions.groupBy.forEach((gb, i) => {
            (0, lodash_1.set)(_id, gb, `$${gb}`);
            id = id.concat({ $toString: `$_id.${gb}` });
            const groupBy = {};
            if (i < aggregateOptions.groupBy.length - 1) {
                groupBy[`gb${i}`] = {
                    id: { $concat: id },
                    count: '$groupByCount',
                    field: gb,
                    value: `$_id.${gb}`,
                };
            }
            else {
                groupBy.groupBy = [];
                while (i--) {
                    groupBy.groupBy.push(`$data.gb${i}`);
                }
                groupBy.groupBy.push({
                    id: { $concat: id },
                    count: '$groupByCount',
                    field: gb,
                    value: `$_id.${gb}`,
                });
            }
            aggregate.push({
                $group: {
                    _id: (0, lodash_1.clone)(_id),
                    groupByCount: { $sum: 1 },
                    data: { $push: '$$ROOT' },
                },
            });
            aggregate.push({ $unwind: '$data' });
            aggregate.push({
                $replaceRoot: { newRoot: { $mergeObjects: ['$data', groupBy] } },
            });
        });
        return aggregate;
    }
    debug(logger, ...args) {
        const l = logger || this.logger;
        if (l && l.debug) {
            l.debug.apply(l, args);
        }
    }
    warn(logger, ...args) {
        const l = logger || this.logger;
        if (l && l.warn) {
            l.warn.apply(l, args);
        }
    }
}
exports.DataTableModule = DataTableModule;
DataTableModule.CONFIG = {
    logger: null,
    handlers: {},
    processUnknownFields: true,
};
exports.default = DataTableModule;
//# sourceMappingURL=datatable.js.map