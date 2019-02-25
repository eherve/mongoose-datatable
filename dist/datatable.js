"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const util = require("util");
const lodash_1 = require("lodash");
const escapeStringRegexp = require("escape-string-regexp");
const flat_1 = require("flat");
;
class DataTableModule {
    constructor(schema) {
        this.schema = schema;
        this._config = DataTableModule.CONFIG;
    }
    get config() { return this._config; }
    get logger() { return this._config.logger; }
    static configure(config) {
        if (config) {
            DataTableModule.CONFIG = lodash_1.assign(DataTableModule.CONFIG, config);
        }
        return DataTableModule.CONFIG;
    }
    static init(schema, opts) {
        const dataTableModule = new DataTableModule(schema);
        schema.statics.dataTable = function (query, options) {
            dataTableModule.model = this;
            return dataTableModule.dataTable(query, options);
        };
    }
    dataTable(query, options = {}) {
        if (options.logger) {
            this._config.logger = options.logger;
        }
        this.logger.debug('quey:', util.inspect(query, { depth: null }));
        const aggregate = {
            projection: [],
            populate: [],
            sort: this.buildSort(query),
            pagination: this.pagination(query)
        };
        this.updateAggregateOptions(options, query, aggregate);
        this.logger.debug('aggregate:', util.inspect(aggregate, { depth: null }));
        return this.recordsTotal(options).then(recordsTotal => {
            return this.recordsFiltered(options, aggregate, recordsTotal).then(recordsFiltered => {
                return this.data(options, aggregate).then(data => {
                    return Promise.resolve({ draw: query.draw, recordsTotal, recordsFiltered, data });
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
            if (!column && this.isFalse(column.orderable)) {
                return;
            }
            sort[column.data] = order.dir === 'asc' ? 1 : -1;
        });
        return sort;
    }
    updateAggregateOptions(options, query, aggregate) {
        let search = [], csearch = [];
        const projection = {};
        const populate = [];
        if (query.search && query.search.value && query.search.value !== '') {
            query.search.chunks = this.chunkSearch(query.search.value);
        }
        query.columns.forEach(column => {
            const field = this.fetchField(options, query, column, populate);
            if (!field) {
                return;
            }
            if (!this.isSelectable(field)) {
                return;
            }
            if (this.isTrue(column.searchable)) {
                if (column.search && column.search.value && column.search.value !== '') {
                    column.search.chunks = this.chunkSearch(column.search.value);
                }
                const s = this.getSearch(options, query, column, field);
                search = search.concat(s.search);
                csearch = csearch.concat(s.csearch);
            }
            projection[column.data] = 1;
        });
        if (populate.length > 0) {
            aggregate.populate = populate;
        }
        this.addProjection(options, aggregate, projection);
        this.addSearch(options, aggregate, search, csearch);
    }
    fetchField(options, query, column, populate) {
        const group = [];
        let field = this.schema.path(column.data);
        if (field) {
            return field;
        }
        let path = column.data, model = this.model, schema = this.schema, base = '', inArray = false;
        while (path.length) {
            field = schema.path(path) || this.getField(schema, path);
            if (!field) {
                return this.logger.warn(`field path ${column.data} not found !`);
            }
            base += ((base.length ? '.' : '') + field.path);
            path = path.substring(field.path.length + 1);
            if (field.options && field.options.ref) {
                model = model.model(field.options.ref);
                schema = model.schema;
                if (!populate.find((l) => l.$lookup && l.$lookup.localField === base)) {
                    populate.push({ $lookup: { from: model.collection.collectionName, localField: base, foreignField: '_id', as: base } });
                    populate.push({ $unwind: { path: `$${base}` } });
                }
            }
            else if (field.instance === 'Array' && field.caster && field.caster.options && field.caster.options.ref) {
                if (inArray) {
                    this.logger.warn(`lookup on submodel array [${column.data}] not managed !`);
                    return;
                }
                model = model.model(field.caster.options.ref);
                schema = model.schema;
                if (!populate.find((l) => l.$lookup && l.$lookup.localField === base)) {
                    populate.push({ $lookup: { from: model.collection.collectionName, localField: base, foreignField: '_id', as: base } });
                }
            }
            else if (field.instance === 'Array') {
                inArray = true;
                group.push(base);
                schema = field.schema;
            }
            else {
                break;
            }
        }
        if (!field) {
            this.logger.warn(`field path ${column.data} not found !`);
        }
        return field;
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
            const select = typeof options.select === 'string' ?
                options.select.split(' ').reduce((p, c) => (p[c] = 1, p), {}) :
                Array.isArray(options.select) ?
                    options.select.reduce((p, c) => (p[c] = 1, p), {}) :
                    options.select;
            aggregate.projection = flat_1.unflatten(lodash_1.merge(select, projection || {}), { overwrite: true });
        }
    }
    addSearch(options, aggregate, search, csearch) {
        if (options.conditions || search.length || csearch.length) {
            aggregate.search = { $and: [] };
            if (options.conditions) {
                aggregate.search.$and.push(options.conditions);
            }
            if (search.length) {
                aggregate.search.$and.push({ $or: search });
            }
            if (csearch.length) {
                aggregate.search.$and = aggregate.search.$and.concat(csearch);
            }
        }
    }
    getSearch(options, query, column, field) {
        const search = [], csearch = [];
        if (query.search && query.search.value && query.search.value !== '') {
            const s = this.buildColumnSearch(options, query, column, field, query.search, true);
            if (s) {
                search.push(s);
            }
        }
        if (column.search && column.search.value && column.search.value !== '') {
            const s = this.buildColumnSearch(options, query, column, field, column.search, false);
            if (s) {
                csearch.push(s);
            }
        }
        return { search, csearch };
    }
    chunkSearch(search) {
        let chunks = [];
        chunks = chunks.concat(search.replace(/(?:"([^"]*)")/g, (match, word) => {
            if (word && word.length > 0) {
                chunks.push(word);
            }
            return '';
        }).split(/[ \t]+/).filter(s => lodash_1.trim(s) !== ''));
        return chunks;
    }
    buildColumnSearch(options, query, column, field, search, global) {
        this.logger.debug('buildColumnSearch:', column.data, search);
        let instance = field.instance;
        if (options.handlers && options.handlers[instance]) {
            return options.handlers[instance](query, column, field, search, global);
        }
        if (this.config.handlers[instance]) {
            return this.config.handlers[instance](query, column, field, search, global);
        }
        switch (instance) {
            case 'String':
                return this.buildColumnSearchString(query, column, field, search, global);
            case 'Boolean':
                return this.buildColumnSearchBoolean(query, column, field, search, global);
            case 'Number':
                return this.buildColumnSearchNumber(query, column, field, search, global);
            case 'Date':
                return this.buildColumnSearchDate(query, column, field, search, global);
            case 'ObjectID':
                return this.buildColumnSearchObjectId(query, column, field, search, global);
            default:
                this.logger.warn(`buildColumnSearch column [${column.data}] type [${instance}] not managed !`);
        }
        return null;
    }
    buildColumnSearchString(query, column, field, search, global) {
        this.logger.debug('buildColumnSearchString:', column.data, search);
        if (!global && search.value.match(/^\/.*\/$/)) {
            try {
                const columnSearch = {};
                columnSearch[column.data] = new RegExp(`${search.value.substring(1, search.value.length - 1)}`, 'gi');
                return columnSearch;
            }
            catch (err) { }
        }
        const s = [];
        (search.chunks || [search.value]).forEach(chunk => {
            const columnSearch = {};
            columnSearch[column.data] = new RegExp(`${escapeStringRegexp(chunk)}`, 'gi');
            s.push(columnSearch);
        });
        return s.length > 0 ? { $or: s } : null;
    }
    buildColumnSearchBoolean(query, column, field, search, global) {
        this.logger.debug('buildColumnSearchString:', column.data, search);
        if (global) {
            return null;
        }
        const value = lodash_1.lowerCase(lodash_1.trim(search.value));
        let columnSearch = null;
        if (value === 'true') {
            columnSearch = {};
            columnSearch[column.data] = true;
        }
        else if (value === 'false') {
            columnSearch = {};
            columnSearch[column.data] = false;
        }
        return columnSearch;
    }
    buildColumnSearchNumber(query, column, field, search, global) {
        this.logger.debug('buildColumnSearchNumber:', column.data, search);
        if (global) {
            const s = [];
            (search.chunks || [search.value]).forEach(chunk => {
                if (isNaN(chunk)) {
                    return;
                }
                const columnSearch = {};
                columnSearch[column.data] = (new Number(chunk)).valueOf();
                s.push(columnSearch);
            });
            return s.length > 0 ? { $or: s } : null;
        }
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
                default: columnSearch[column.data] = from.valueOf();
            }
            return columnSearch;
        }
        else {
            this.logger.warn(`buildColumnSearchNumber unmanaged search value '${search.value}`);
        }
        return null;
    }
    buildColumnSearchDate(query, column, field, search, global) {
        this.logger.debug('buildColumnSearchDate:', column.data, search);
        if (global) {
            const s = [];
            (search.chunks || [search.value]).forEach(chunk => {
                if (isNaN(chunk)) {
                    return;
                }
                const columnSearch = {};
                columnSearch[column.data] = (new Number(chunk)).valueOf();
                s.push(columnSearch);
            });
            return s.length > 0 ? { $or: s } : null;
        }
        if (/^(=|>|>=|<=|<|<>|<=>)?([0-9.\/-]+)(?:,([0-9.\/-]+))?$/.test(search.value)) {
            const op = RegExp.$1;
            const $2 = RegExp.$2;
            const from = isNaN($2) ? new Date($2) : new Date(parseInt($2));
            if (!(from instanceof Date) || isNaN(from.valueOf())) {
                return this.logger.warn(`buildColumnSearchDate invalid 'from' date format [YYYY/MM/DD] '${$2}`);
            }
            const $3 = RegExp.$3;
            const to = isNaN($3) ? new Date($3) : new Date(parseInt($3));
            if ($3 !== '' && (!(to instanceof Date) || isNaN(to.valueOf()))) {
                return this.logger.warn(`buildColumnSearchDate invalid 'to' date format [YYYY/MM/DD] '${$3}`);
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
                default: columnSearch[column.data] = from;
            }
            return columnSearch;
        }
        else {
            this.logger.warn(`buildColumnSearchDate unmanaged search value '${search.value}`);
        }
        return null;
    }
    buildColumnSearchObjectId(query, column, field, search, global) {
        this.logger.debug('buildColumnSearchObjectId:', column.data, search);
        if (global || !search.value.match(/^[0-9a-fA-F]{24}$/)) {
            return null;
        }
        const columnSearch = {};
        columnSearch[column.data] = search.value;
        return columnSearch;
    }
    pagination(query) {
        const start = query.start ? parseInt(query.start, 10) : 0;
        const length = query.length ? parseInt(query.length, 10) : undefined;
        return { start: isNaN(start) ? 0 : start, length: isNaN(length) ? undefined : length };
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
            if (!aggregateOptions.search) {
                return Promise.resolve(recordsTotal);
            }
            if (!aggregateOptions.populate) {
                return this.model.countDocuments(aggregateOptions.search);
            }
            const aggregate = [];
            aggregateOptions.populate.forEach(data => aggregate.push(data));
            aggregate.push({ $match: aggregateOptions.search });
            aggregate.push({ $count: 'filtered' });
            return this.model.aggregate(aggregate).then(data => data.length === 1 ? data[0].filtered : 0);
        });
    }
    data(options, aggregateOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const aggregate = [];
            if (aggregateOptions.populate) {
                aggregateOptions.populate.forEach(data => aggregate.push(data));
            }
            if (aggregateOptions.projection) {
                aggregate.push({ $project: aggregateOptions.projection });
            }
            if (aggregateOptions.search) {
                aggregate.push({ $match: aggregateOptions.search });
            }
            if (aggregateOptions.sort) {
                aggregate.push({ $sort: aggregateOptions.sort });
            }
            if (aggregateOptions.pagination) {
                if (aggregateOptions.pagination.start) {
                    aggregate.push({ $skip: aggregateOptions.pagination.start * aggregateOptions.pagination.length });
                }
                if (aggregateOptions.pagination.length) {
                    aggregate.push({ $limit: aggregateOptions.pagination.length });
                }
            }
            return this.model.aggregate(aggregate).allowDiskUse(true);
        });
    }
}
DataTableModule.CONFIG = {
    logger: console,
    handlers: {}
};
exports.default = DataTableModule;
//# sourceMappingURL=datatable.js.map