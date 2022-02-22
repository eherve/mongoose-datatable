"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const util = require("util");
const lodash_1 = require("lodash");
const escapeStringRegexp = require("escape-string-regexp");
const mongoose_1 = require("mongoose");
const flat_1 = require("flat");
class DataTableModule {
    constructor(schema) {
        this.schema = schema;
        this._config = DataTableModule.CONFIG;
    }
    get config() {
        return this._config;
    }
    get logger() {
        return this._config.logger;
    }
    static configure(config) {
        if (config) {
            DataTableModule.CONFIG = lodash_1.assign(DataTableModule.CONFIG, config);
        }
        return DataTableModule.CONFIG;
    }
    static init(schema, config) {
        const dataTableModule = new DataTableModule(schema);
        schema.statics.dataTable = function (query, options) {
            options = lodash_1.merge({}, config || {}, options || {});
            dataTableModule.model = this;
            return dataTableModule.dataTable(query, options);
        };
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
            if (!finfo) {
                return;
            }
            if (!this.isSelectable(finfo.field)) {
                return;
            }
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
    fetchFieldRef(data) {
        data.populated = true;
        data.model = data.model.db.model(data.field.options.ref);
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
    fetchFieldArrayRef(data) {
        data.populated = true;
        data.model = data.model.db.model(data.field.options.ref);
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
    fetchField(options, query, column, populate) {
        let populated = false;
        let field = this.schema.path(column.data);
        if (field) {
            return { field, populated };
        }
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
            if (!data.field) {
                this.warn(options.logger, `field path ${column.data} not found !`);
                return;
            }
            data.base += (data.base.length ? '.' : '') + data.field.path;
            data.path = data.path.substring(data.field.path.length + 1);
            // ref field
            if (data.field.options && data.field.options.ref && !data.inArray) {
                this.fetchFieldRef(data);
                continue;
            }
            // ref field in array
            if (data.field.options && data.field.options.ref && !!data.inArray) {
                this.fetchFieldArrayRef(data);
                continue;
            }
            // ref array field
            if (data.field.instance === 'Array' &&
                data.field.caster &&
                data.field.caster.options &&
                data.field.caster.options.ref) {
                data.populated = true;
                data.model = data.model.base.model(data.field.caster.options.ref);
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
        if (options.select || projection !== {}) {
            const select = typeof options.select === 'string'
                ? options.select.split(' ').reduce((p, c) => ((p[c] = 1), p), {})
                : Array.isArray(options.select)
                    ? options.select.reduce((p, c) => ((p[c] = 1), p), {})
                    : options.select;
            aggregate.projection = flat_1.unflatten(lodash_1.merge(select, projection || {}), {
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
        if (lodash_1.isArray(search)) {
            lodash_1.each(search, s => (chunks = lodash_1.concat(chunks, this.getChunkSearch(s))));
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
            .filter(s => lodash_1.trim(s) !== '');
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
            instance = this.tryDeductMixedFromValue(search.value);
        }
        switch (instance) {
            case 'String':
                if (global)
                    return this.buildGlobalColumnSearchString(options, column, search);
                return this.buildColumnSearchString(options, column, search);
            case 'Boolean':
                if (global)
                    break;
                return this.buildColumnSearchBoolean(options, column, search);
            case 'Number':
                if (global)
                    return this.buildGlobalColumnSearchNumber(options, column, search);
                return this.buildColumnSearchNumber(options, column, search);
            case 'Date':
                if (global)
                    break;
                return this.buildColumnSearchDate(options, column, search);
            case 'ObjectID':
                return this.buildColumnSearchObjectId(options, column, search);
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
        switch (typeof value) {
            case 'string':
                if (mongoose_1.Types.ObjectId.isValid(value)) {
                    return 'ObjectID';
                }
                if (/^(=|>|>=|<=|<|<>|<=>)?([0-9.]+)(?:,([0-9.]+))?$/.test(value)) {
                    return 'Number';
                }
                if (/^(=|>|>=|<=|<|<>|<=>)?([0-9.\/-]+)(?:,([0-9.\/-]+))?$/.test(value)) {
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
    buildGlobalColumnSearchString(options, column, search) {
        this.debug(options.logger, 'buildGlobalColumnSearchString:', column.data, search);
        const s = lodash_1.map(search.chunks, chunk => ({
            [column.data]: new RegExp(`${escapeStringRegexp(chunk)}`, 'gi'),
        }));
        return s.length > 0 ? (s.length > 1 ? { $or: s } : s[0]) : null;
    }
    buildColumnSearchString(options, column, search) {
        this.debug(options.logger, 'buildColumnSearchString:', column.data, search);
        const s = lodash_1.map(lodash_1.isArray(search.value) ? search.value : [search.value], chunk => ({
            [column.data]: chunk.match(/^\/.*\/$/)
                ? new RegExp(`${chunk.substring(1, chunk.length - 1)}`, 'gi')
                : new RegExp(`${escapeStringRegexp(chunk)}`, 'gi'),
        }));
        return s.length > 0 ? (s.length > 1 ? { $or: s } : s[0]) : null;
    }
    buildColumnSearchBoolean(options, column, search) {
        this.debug(options.logger, 'buildColumnSearchBoolean:', column.data, search);
        if (['string', 'boolean'].includes(typeof search.value)) {
            const value = typeof search.value === 'boolean' ? search.value : lodash_1.lowerCase(lodash_1.trim(search.value));
            if (value === 'true' || value === true) {
                return { [column.data]: true };
            }
            else if (value === 'false' || value === false) {
                return { [column.data]: false };
            }
        }
        this.warn(options.logger, `buildColumnSearchBoolean unmanaged search value '${search.value}'`);
        return null;
    }
    buildGlobalColumnSearchNumber(options, column, search) {
        this.debug(options.logger, 'buildGlobalColumnSearchNumber:', column.data, search);
        const s = [];
        lodash_1.each(search.chunks, chunk => {
            if (!isNaN(chunk)) {
                s.push({ [column.data]: new Number(chunk).valueOf() });
            }
        });
        return s.length > 0 ? (s.length > 1 ? { $or: s } : s[0]) : null;
    }
    buildColumnSearchNumber(options, column, search) {
        this.debug(options.logger, 'buildColumnSearchNumber:', column.data, search);
        if (/^(=|>|>=|<=|<|<>|<=>)?((?:[0-9]+[.])?[0-9]+)(?:,((?:[0-9]+[.])?[0-9]+))?$/.test(search.value)) {
            const op = RegExp.$1;
            const from = new Number(RegExp.$2);
            const to = new Number(RegExp.$3);
            const columnSearch = {};
            switch (op) {
                case '>':
                    columnSearch[column.data] = { $gt: from.valueOf() };
                    break;
                case '>=':
                    columnSearch[column.data] = { $gte: from.valueOf() };
                    break;
                case '<':
                    columnSearch[column.data] = { $lt: from.valueOf() };
                    break;
                case '<=':
                    columnSearch[column.data] = { $lte: from.valueOf() };
                    break;
                case '<>':
                    columnSearch[column.data] = { $gt: from.valueOf(), $lt: to.valueOf() };
                    break;
                case '<=>':
                    columnSearch[column.data] = { $gte: from.valueOf(), $lte: to.valueOf() };
                    break;
                default:
                    columnSearch[column.data] = from.valueOf();
            }
            return columnSearch;
        }
        this.warn(options.logger, `buildColumnSearchNumber unmanaged search value '${search.value}'`);
        return null;
    }
    buildColumnSearchDate(options, column, search) {
        this.debug(options.logger, 'buildColumnSearchDate:', column.data, search);
        if (/^(=|>|>=|<=|<|<>|<=>)?([0-9.\/-]+)(?:,([0-9.\/-]+))?$/.test(search.value)) {
            const op = RegExp.$1;
            const $2 = RegExp.$2;
            const from = isNaN($2) ? new Date($2) : new Date(parseInt($2));
            if (!(from instanceof Date) || isNaN(from.valueOf())) {
                return this.warn(options.logger, `buildColumnSearchDate invalid 'from' date format [YYYY/MM/DD] '${$2}`);
            }
            const $3 = RegExp.$3;
            const to = isNaN($3) ? new Date($3) : new Date(parseInt($3));
            if ($3 !== '' && (!(to instanceof Date) || isNaN(to.valueOf()))) {
                return this.warn(options.logger, `buildColumnSearchDate invalid 'to' date format [YYYY/MM/DD] '${$3}`);
            }
            const columnSearch = {};
            switch (op) {
                case '>':
                    columnSearch[column.data] = { $gt: from };
                    break;
                case '>=':
                    columnSearch[column.data] = { $gte: from };
                    break;
                case '<':
                    columnSearch[column.data] = { $lt: from };
                    break;
                case '<=':
                    columnSearch[column.data] = { $lte: from };
                    break;
                case '<>':
                    columnSearch[column.data] = { $gt: from, $lt: to };
                    break;
                case '<=>':
                    columnSearch[column.data] = { $gte: from, $lte: to };
                    break;
                default:
                    columnSearch[column.data] = from;
            }
            return columnSearch;
        }
        this.warn(options.logger, `buildColumnSearchDate unmanaged search value '${search.value}'`);
        return null;
    }
    buildColumnSearchObjectId(options, column, search) {
        this.debug(options.logger, 'buildColumnSearchObjectId:', column.data, search);
        if (mongoose_1.Types.ObjectId.isValid(search.value)) {
            const columnSearch = {};
            columnSearch[column.data] = new mongoose_1.Types.ObjectId(search.value);
            return columnSearch;
        }
        this.warn(options.logger, `buildColumnSearchObjectId unmanaged search value '${search.value}'`);
        return null;
    }
    pagination(query) {
        const start = query.start ? parseInt(query.start, 10) : 0;
        const length = query.length ? parseInt(query.length, 10) : undefined;
        return {
            start: isNaN(start) ? 0 : start,
            length: isNaN(length) ? undefined : length,
        };
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
    recordsTotal(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.model.countDocuments(options.conditions);
        });
    }
    recordsFiltered(options, aggregateOptions, recordsTotal) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!aggregateOptions.search && !aggregateOptions.afterPopulateSearch) {
                return Promise.resolve(recordsTotal);
            }
            const aggregate = [];
            if (aggregateOptions.search) {
                aggregate.push({ $match: aggregateOptions.search });
            }
            aggregateOptions.populate.forEach(data => aggregate.push(data));
            if (aggregateOptions.afterPopulateSearch) {
                aggregate.push({ $match: aggregateOptions.afterPopulateSearch });
            }
            aggregate.push({ $count: 'filtered' });
            return this.model.aggregate(aggregate).then(data => (data.length === 1 ? data[0].filtered : 0));
        });
    }
    data(options, aggregateOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const aggregate = [];
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
        });
    }
    buildGroupBy(aggregateOptions) {
        const aggregate = [];
        const _id = {};
        let id = [];
        aggregateOptions.groupBy.forEach((gb, i) => {
            lodash_1.set(_id, gb, `$${gb}`);
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
                    _id: lodash_1.clone(_id),
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
DataTableModule.CONFIG = {
    logger: null,
    handlers: {},
};
exports.default = DataTableModule;
//# sourceMappingURL=datatable.js.map