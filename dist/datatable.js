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
        if (query.search && query.search.value !== '') {
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
                if (column.search && column.search.value !== '') {
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
        if (query.search && query.search.value !== '') {
            const s = this.buildColumnSearch(options, query, column, field, query.search, true);
            if (s) {
                search.push(s);
            }
        }
        if (column.search && column.search.value !== '') {
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
            return { $or: s };
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
            return { $or: s };
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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LENBQUMsQ0FBQzthQUFFO1lBQ2hGLElBQUksZ0JBQWdCLENBQUMsVUFBVSxFQUFFO2dCQUMvQixJQUFJLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUU7b0JBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsS0FBSyxHQUFHLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO2lCQUFFO2dCQUM3SSxJQUFJLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUU7b0JBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztpQkFBRTthQUM1RztZQUNELE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVELENBQUM7S0FBQTs7QUEvVk0sc0JBQU0sR0FBWTtJQUN2QixNQUFNLEVBQUUsT0FBTztJQUNmLFFBQVEsRUFBRSxFQUFFO0NBQ2IsQ0FBQztBQWdXSixrQkFBZSxlQUFlLENBQUMiLCJmaWxlIjoiZGF0YXRhYmxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgKiBhcyB1dGlsIGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgYXNzaWduLCB0cmltLCBsb3dlckNhc2UsIG1lcmdlIH0gZnJvbSAnbG9kYXNoJztcbmltcG9ydCAqIGFzIGVzY2FwZVN0cmluZ1JlZ2V4cCBmcm9tICdlc2NhcGUtc3RyaW5nLXJlZ2V4cCc7XG5pbXBvcnQgeyBTY2hlbWEsIE1vZGVsLCBTY2hlbWFUeXBlIH0gZnJvbSAnbW9uZ29vc2UnO1xuaW1wb3J0IHsgdW5mbGF0dGVuIH0gZnJvbSAnZmxhdCc7XG5cbmludGVyZmFjZSBJTG9nZ2VyIHtcbiAgZGVidWc6ICguLi5kYXRhOiBhbnkpID0+IHZvaWQ7XG4gIGluZm86ICguLi5kYXRhOiBhbnkpID0+IHZvaWQ7XG4gIHdhcm46ICguLi5kYXRhOiBhbnkpID0+IHZvaWQ7XG4gIGVycm9yOiAoLi4uZGF0YTogYW55KSA9PiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSVNvcnQge1xuICBbY29sdW1uOiBzdHJpbmddOiBudW1iZXJcbn1cblxuaW50ZXJmYWNlIElDb2x1bW4ge1xuICBkYXRhOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgc2VhcmNoYWJsZTogYm9vbGVhbjtcbiAgb3JkZXJhYmxlOiBib29sZWFuO1xuICBzZWFyY2g6IElTZWFyY2g7XG59XG5cbmludGVyZmFjZSBJT3JkZXIge1xuICBjb2x1bW46IG51bWJlcjtcbiAgZGlyOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJU2VhcmNoIHtcbiAgdmFsdWU6IHN0cmluZztcbiAgcmVnZXg6IGJvb2xlYW47XG4gIGNodW5rcz86IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgSVByb2plY3Rpb24ge1xuICBba2V5OiBzdHJpbmddOiBhbnk7XG59XG5cbmludGVyZmFjZSBJTG9va3VwIHtcbiAgJGxvb2t1cDoge1xuICAgIGZyb206IHN0cmluZztcbiAgICBsb2NhbEZpZWxkOiBzdHJpbmc7XG4gICAgZm9yZWlnbkZpZWxkOiBzdHJpbmc7XG4gICAgYXM6IHN0cmluZztcbiAgfVxufVxuXG5pbnRlcmZhY2UgSVJlcGxhY2Uge1xuICAkcmVwbGFjZVJvb3Q6IHtcbiAgICBuZXdSb290OiB7XG4gICAgICAkbWVyZ2VPYmplY3RzOiBhbnlbXTtcbiAgICB9XG4gIH1cbn1cblxuaW50ZXJmYWNlIElVbndpbmQge1xuICAkdW53aW5kOiB7XG4gICAgcGF0aDogc3RyaW5nO1xuICB9XG59XG5cbmludGVyZmFjZSBJUGFnaW5hdGlvbiB7XG4gIHN0YXJ0OiBudW1iZXI7XG4gIGxlbmd0aDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSUFnZ3JlZ2F0ZU9wdGlvbnMge1xuICBwb3B1bGF0ZTogKElMb29rdXAgfCBJVW53aW5kKVtdO1xuICBwcm9qZWN0aW9uOiBJUHJvamVjdGlvbjtcbiAgc2VhcmNoPzogYW55O1xuICBzb3J0OiBJU29ydDtcbiAgcGFnaW5hdGlvbjogSVBhZ2luYXRpb247XG5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUXVlcnkge1xuICBkcmF3OiBzdHJpbmc7XG4gIGNvbHVtbnM6IElDb2x1bW5bXTtcbiAgb3JkZXI/OiBJT3JkZXJbXTtcbiAgc3RhcnQ6IHN0cmluZztcbiAgbGVuZ3RoOiBzdHJpbmc7XG4gIHNlYXJjaDogSVNlYXJjaDtcbn1cblxuZXhwb3J0IHR5cGUgSGFuZGxlclR5cGUgPSAocXVlcnk6IElRdWVyeSwgY29sdW1uOiBJQ29sdW1uLCBmaWVsZDogYW55LCBzZWFyY2g6IElTZWFyY2gsIGdsb2JhbDogYm9vbGVhbikgPT4gYW55O1xuXG5leHBvcnQgaW50ZXJmYWNlIElPcHRpb25zIHtcbiAgaGFuZGxlcnM/OiB7IFt0eXBlOiBzdHJpbmddOiBIYW5kbGVyVHlwZSB9O1xuICBjb25kaXRpb25zPzogYW55O1xuICBzZWxlY3Q/OiBhbnlcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGF0YSB7XG4gIGRyYXc6IHN0cmluZztcbiAgcmVjb3Jkc1RvdGFsOiBudW1iZXI7XG4gIHJlY29yZHNGaWx0ZXJlZDogbnVtYmVyO1xuICBkYXRhOiBhbnlbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlnIHtcbiAgbG9nZ2VyPzogSUxvZ2dlcjtcbiAgaGFuZGxlcnM/OiB7IFt0eXBlOiBzdHJpbmddOiBIYW5kbGVyVHlwZSB9O1xufTtcblxuY2xhc3MgRGF0YVRhYmxlTW9kdWxlIHtcblxuICBzdGF0aWMgQ09ORklHOiBJQ29uZmlnID0ge1xuICAgIGxvZ2dlcjogY29uc29sZSxcbiAgICBoYW5kbGVyczoge31cbiAgfTtcblxuICBwcml2YXRlIF9jb25maWc6IElDb25maWcgPSBEYXRhVGFibGVNb2R1bGUuQ09ORklHO1xuICBwcml2YXRlIGdldCBjb25maWcoKSB7IHJldHVybiB0aGlzLl9jb25maWc7IH1cbiAgcHJpdmF0ZSBnZXQgbG9nZ2VyKCkgeyByZXR1cm4gdGhpcy5fY29uZmlnLmxvZ2dlcjsgfVxuICBwcml2YXRlIG1vZGVsOiBNb2RlbDxhbnksIGFueT47XG5cbiAgc3RhdGljIGNvbmZpZ3VyZShjb25maWc/OiBJQ29uZmlnKTogSUNvbmZpZyB7XG4gICAgaWYgKGNvbmZpZykge1xuICAgICAgRGF0YVRhYmxlTW9kdWxlLkNPTkZJRyA9IGFzc2lnbihEYXRhVGFibGVNb2R1bGUuQ09ORklHLCBjb25maWcpO1xuICAgIH1cbiAgICByZXR1cm4gRGF0YVRhYmxlTW9kdWxlLkNPTkZJRztcbiAgfVxuXG4gIHN0YXRpYyBpbml0KHNjaGVtYTogYW55LCBvcHRzOiBhbnkpIHtcbiAgICBjb25zdCBkYXRhVGFibGVNb2R1bGUgPSBuZXcgRGF0YVRhYmxlTW9kdWxlKHNjaGVtYSk7XG4gICAgc2NoZW1hLnN0YXRpY3MuZGF0YVRhYmxlID0gZnVuY3Rpb24gKHF1ZXJ5OiBJUXVlcnksIG9wdGlvbnM/OiBJT3B0aW9ucykge1xuICAgICAgZGF0YVRhYmxlTW9kdWxlLm1vZGVsID0gdGhpcztcbiAgICAgIHJldHVybiBkYXRhVGFibGVNb2R1bGUuZGF0YVRhYmxlKHF1ZXJ5LCBvcHRpb25zKTtcbiAgICB9O1xuICB9XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBzY2hlbWE6IFNjaGVtYSkgeyB9XG5cbiAgcHJpdmF0ZSBkYXRhVGFibGUocXVlcnk6IElRdWVyeSwgb3B0aW9uczogSU9wdGlvbnMgPSB7fSBhcyBJT3B0aW9ucyk6IFByb21pc2U8SURhdGE+IHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygncXVleTonLCB1dGlsLmluc3BlY3QocXVlcnksIHsgZGVwdGg6IG51bGwgfSkpO1xuICAgIGNvbnN0IGFnZ3JlZ2F0ZTogSUFnZ3JlZ2F0ZU9wdGlvbnMgPSB7XG4gICAgICBwcm9qZWN0aW9uOiBbXSxcbiAgICAgIHBvcHVsYXRlOiBbXSxcbiAgICAgIHNvcnQ6IHRoaXMuYnVpbGRTb3J0KHF1ZXJ5KSxcbiAgICAgIHBhZ2luYXRpb246IHRoaXMucGFnaW5hdGlvbihxdWVyeSlcbiAgICB9O1xuICAgIHRoaXMudXBkYXRlQWdncmVnYXRlT3B0aW9ucyhvcHRpb25zLCBxdWVyeSwgYWdncmVnYXRlKTtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnYWdncmVnYXRlOicsIHV0aWwuaW5zcGVjdChhZ2dyZWdhdGUsIHsgZGVwdGg6IG51bGwgfSkpO1xuICAgIHJldHVybiB0aGlzLnJlY29yZHNUb3RhbChvcHRpb25zKS50aGVuKHJlY29yZHNUb3RhbCA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZWNvcmRzRmlsdGVyZWQob3B0aW9ucywgYWdncmVnYXRlLCByZWNvcmRzVG90YWwpLnRoZW4ocmVjb3Jkc0ZpbHRlcmVkID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YShvcHRpb25zLCBhZ2dyZWdhdGUpLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IGRyYXc6IHF1ZXJ5LmRyYXcsIHJlY29yZHNUb3RhbCwgcmVjb3Jkc0ZpbHRlcmVkLCBkYXRhIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFNvcnQocXVlcnk6IElRdWVyeSk6IElTb3J0IHtcbiAgICBpZiAoIXF1ZXJ5Lm9yZGVyIHx8IHF1ZXJ5Lm9yZGVyLmxlbmd0aCA9PT0gMCkgeyByZXR1cm4gbnVsbDsgfVxuICAgIGNvbnN0IHNvcnQ6IElTb3J0ID0ge307XG4gICAgcXVlcnkub3JkZXIuZm9yRWFjaChvcmRlciA9PiB7XG4gICAgICBjb25zdCBjb2x1bW46IElDb2x1bW4gPSBxdWVyeS5jb2x1bW5zW29yZGVyLmNvbHVtbl07XG4gICAgICBpZiAoIWNvbHVtbiAmJiB0aGlzLmlzRmFsc2UoY29sdW1uLm9yZGVyYWJsZSkpIHsgcmV0dXJuOyB9XG4gICAgICBzb3J0W2NvbHVtbi5kYXRhXSA9IG9yZGVyLmRpciA9PT0gJ2FzYycgPyAxIDogLTE7XG4gICAgfSk7XG4gICAgcmV0dXJuIHNvcnQ7XG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZUFnZ3JlZ2F0ZU9wdGlvbnMob3B0aW9uczogSU9wdGlvbnMsIHF1ZXJ5OiBJUXVlcnksIGFnZ3JlZ2F0ZTogSUFnZ3JlZ2F0ZU9wdGlvbnMpOiB2b2lkIHtcbiAgICBsZXQgc2VhcmNoOiBhbnlbXSA9IFtdLCBjc2VhcmNoOiBhbnlbXSA9IFtdO1xuICAgIGNvbnN0IHByb2plY3Rpb246IGFueSA9IHt9O1xuICAgIGNvbnN0IHBvcHVsYXRlOiAoSUxvb2t1cCB8IElVbndpbmQpW10gPSBbXTtcbiAgICBpZiAocXVlcnkuc2VhcmNoICYmIHF1ZXJ5LnNlYXJjaC52YWx1ZSAhPT0gJycpIHsgcXVlcnkuc2VhcmNoLmNodW5rcyA9IHRoaXMuY2h1bmtTZWFyY2gocXVlcnkuc2VhcmNoLnZhbHVlKTsgfVxuICAgIHF1ZXJ5LmNvbHVtbnMuZm9yRWFjaChjb2x1bW4gPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSB0aGlzLmZldGNoRmllbGQob3B0aW9ucywgcXVlcnksIGNvbHVtbiwgcG9wdWxhdGUpO1xuICAgICAgaWYgKCFmaWVsZCkgeyByZXR1cm47IH1cbiAgICAgIGlmICghdGhpcy5pc1NlbGVjdGFibGUoZmllbGQpKSB7IHJldHVybjsgfVxuICAgICAgaWYgKHRoaXMuaXNUcnVlKGNvbHVtbi5zZWFyY2hhYmxlKSkge1xuICAgICAgICBpZiAoY29sdW1uLnNlYXJjaCAmJiBjb2x1bW4uc2VhcmNoLnZhbHVlICE9PSAnJykgeyBjb2x1bW4uc2VhcmNoLmNodW5rcyA9IHRoaXMuY2h1bmtTZWFyY2goY29sdW1uLnNlYXJjaC52YWx1ZSk7IH1cbiAgICAgICAgY29uc3QgcyA9IHRoaXMuZ2V0U2VhcmNoKG9wdGlvbnMsIHF1ZXJ5LCBjb2x1bW4sIGZpZWxkKTtcbiAgICAgICAgc2VhcmNoID0gc2VhcmNoLmNvbmNhdChzLnNlYXJjaCk7XG4gICAgICAgIGNzZWFyY2ggPSBjc2VhcmNoLmNvbmNhdChzLmNzZWFyY2gpO1xuICAgICAgfVxuICAgICAgcHJvamVjdGlvbltjb2x1bW4uZGF0YV0gPSAxO1xuICAgIH0pO1xuICAgIGlmIChwb3B1bGF0ZS5sZW5ndGggPiAwKSB7IGFnZ3JlZ2F0ZS5wb3B1bGF0ZSA9IHBvcHVsYXRlOyB9XG4gICAgdGhpcy5hZGRQcm9qZWN0aW9uKG9wdGlvbnMsIGFnZ3JlZ2F0ZSwgcHJvamVjdGlvbik7XG4gICAgdGhpcy5hZGRTZWFyY2gob3B0aW9ucywgYWdncmVnYXRlLCBzZWFyY2gsIGNzZWFyY2gpO1xuICB9XG5cbiAgcHJpdmF0ZSBmZXRjaEZpZWxkKG9wdGlvbnM6IElPcHRpb25zLCBxdWVyeTogSVF1ZXJ5LCBjb2x1bW46IElDb2x1bW4sIHBvcHVsYXRlOiAoSUxvb2t1cCB8IElVbndpbmQpW10pOiBhbnkge1xuICAgIGNvbnN0IGdyb3VwOiBhbnlbXSA9IFtdO1xuICAgIGxldCBmaWVsZDogYW55ID0gdGhpcy5zY2hlbWEucGF0aChjb2x1bW4uZGF0YSk7XG4gICAgaWYgKGZpZWxkKSB7IHJldHVybiBmaWVsZDsgfVxuICAgIGxldCBwYXRoID0gY29sdW1uLmRhdGEsIG1vZGVsID0gdGhpcy5tb2RlbCwgc2NoZW1hID0gdGhpcy5zY2hlbWEsIGJhc2UgPSAnJywgaW5BcnJheSA9IGZhbHNlO1xuICAgIHdoaWxlIChwYXRoLmxlbmd0aCkge1xuICAgICAgZmllbGQgPSBzY2hlbWEucGF0aChwYXRoKSB8fCB0aGlzLmdldEZpZWxkKHNjaGVtYSwgcGF0aCk7XG4gICAgICBpZiAoIWZpZWxkKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxvZ2dlci53YXJuKGBmaWVsZCBwYXRoICR7Y29sdW1uLmRhdGF9IG5vdCBmb3VuZCAhYCk7XG4gICAgICB9XG4gICAgICBiYXNlICs9ICgoYmFzZS5sZW5ndGggPyAnLicgOiAnJykgKyBmaWVsZC5wYXRoKTtcbiAgICAgIHBhdGggPSBwYXRoLnN1YnN0cmluZyhmaWVsZC5wYXRoLmxlbmd0aCArIDEpO1xuXG4gICAgICBpZiAoZmllbGQub3B0aW9ucyAmJiBmaWVsZC5vcHRpb25zLnJlZikge1xuICAgICAgICBtb2RlbCA9IG1vZGVsLm1vZGVsKGZpZWxkLm9wdGlvbnMucmVmKTtcbiAgICAgICAgc2NoZW1hID0gbW9kZWwuc2NoZW1hO1xuICAgICAgICBpZiAoIXBvcHVsYXRlLmZpbmQoKGw6IGFueSkgPT4gbC4kbG9va3VwICYmIGwuJGxvb2t1cC5sb2NhbEZpZWxkID09PSBiYXNlKSkge1xuICAgICAgICAgIHBvcHVsYXRlLnB1c2goeyAkbG9va3VwOiB7IGZyb206IG1vZGVsLmNvbGxlY3Rpb24uY29sbGVjdGlvbk5hbWUsIGxvY2FsRmllbGQ6IGJhc2UsIGZvcmVpZ25GaWVsZDogJ19pZCcsIGFzOiBiYXNlIH0gfSk7XG4gICAgICAgICAgcG9wdWxhdGUucHVzaCh7ICR1bndpbmQ6IHsgcGF0aDogYCQke2Jhc2V9YCB9IH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkLmluc3RhbmNlID09PSAnQXJyYXknICYmIGZpZWxkLmNhc3RlciAmJiBmaWVsZC5jYXN0ZXIub3B0aW9ucyAmJiBmaWVsZC5jYXN0ZXIub3B0aW9ucy5yZWYpIHtcbiAgICAgICAgaWYgKGluQXJyYXkpIHtcbiAgICAgICAgICB0aGlzLmxvZ2dlci53YXJuKGBsb29rdXAgb24gc3VibW9kZWwgYXJyYXkgWyR7Y29sdW1uLmRhdGF9XSBub3QgbWFuYWdlZCAhYCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIG1vZGVsID0gbW9kZWwubW9kZWwoZmllbGQuY2FzdGVyLm9wdGlvbnMucmVmKTtcbiAgICAgICAgc2NoZW1hID0gbW9kZWwuc2NoZW1hO1xuICAgICAgICBpZiAoIXBvcHVsYXRlLmZpbmQoKGw6IGFueSkgPT4gbC4kbG9va3VwICYmIGwuJGxvb2t1cC5sb2NhbEZpZWxkID09PSBiYXNlKSkge1xuICAgICAgICAgIHBvcHVsYXRlLnB1c2goeyAkbG9va3VwOiB7IGZyb206IG1vZGVsLmNvbGxlY3Rpb24uY29sbGVjdGlvbk5hbWUsIGxvY2FsRmllbGQ6IGJhc2UsIGZvcmVpZ25GaWVsZDogJ19pZCcsIGFzOiBiYXNlIH0gfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZmllbGQuaW5zdGFuY2UgPT09ICdBcnJheScpIHtcbiAgICAgICAgaW5BcnJheSA9IHRydWU7XG4gICAgICAgIGdyb3VwLnB1c2goYmFzZSk7XG4gICAgICAgIHNjaGVtYSA9IGZpZWxkLnNjaGVtYTtcbiAgICAgIH0gZWxzZSB7IGJyZWFrOyB9XG4gICAgfVxuICAgIGlmICghZmllbGQpIHtcbiAgICAgIHRoaXMubG9nZ2VyLndhcm4oYGZpZWxkIHBhdGggJHtjb2x1bW4uZGF0YX0gbm90IGZvdW5kICFgKTtcbiAgICB9XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRGaWVsZChzY2hlbWE6IGFueSwgcGF0aDogc3RyaW5nKTogU2NoZW1hVHlwZSB7XG4gICAgdmFyIGJhc2VGaWVsZDogYW55LCB0YWlsID0gcGF0aCwgYmFzZTogc3RyaW5nLCBpbmRleFNlcDogbnVtYmVyLCBpbmRleCA9IC0xLCBjb3VudCA9IDA7XG4gICAgd2hpbGUgKChpbmRleFNlcCA9IHRhaWwuaW5kZXhPZignLicpKSAhPSAtMSkge1xuICAgICAgaWYgKCsrY291bnQgPiAxMCkgYnJlYWs7XG4gICAgICBpbmRleCArPSBpbmRleFNlcCArIDE7XG4gICAgICB2YXIgYmFzZSA9IHBhdGguc3Vic3RyaW5nKDAsIGluZGV4KTtcbiAgICAgIGJhc2VGaWVsZCA9IHNjaGVtYS5wYXRoKGJhc2UpO1xuICAgICAgaWYgKGJhc2VGaWVsZCkgeyByZXR1cm4gYmFzZUZpZWxkOyB9XG4gICAgICB0YWlsID0gcGF0aC5zdWJzdHJpbmcoYmFzZS5sZW5ndGggKyAxKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFkZFByb2plY3Rpb24ob3B0aW9uczogSU9wdGlvbnMsIGFnZ3JlZ2F0ZTogSUFnZ3JlZ2F0ZU9wdGlvbnMsIHByb2plY3Rpb246IGFueSkge1xuICAgIGlmIChvcHRpb25zLnNlbGVjdCB8fCBwcm9qZWN0aW9uICE9PSB7fSkge1xuICAgICAgY29uc3Qgc2VsZWN0ID0gdHlwZW9mIG9wdGlvbnMuc2VsZWN0ID09PSAnc3RyaW5nJyA/XG4gICAgICAgIG9wdGlvbnMuc2VsZWN0LnNwbGl0KCcgJykucmVkdWNlKChwOiBhbnksIGM6IHN0cmluZykgPT4gKHBbY10gPSAxLCBwKSwge30pIDpcbiAgICAgICAgQXJyYXkuaXNBcnJheShvcHRpb25zLnNlbGVjdCkgP1xuICAgICAgICAgIG9wdGlvbnMuc2VsZWN0LnJlZHVjZSgocDogYW55LCBjOiBzdHJpbmcpID0+IChwW2NdID0gMSwgcCksIHt9KSA6XG4gICAgICAgICAgb3B0aW9ucy5zZWxlY3Q7XG4gICAgICBhZ2dyZWdhdGUucHJvamVjdGlvbiA9IHVuZmxhdHRlbihtZXJnZShzZWxlY3QsIHByb2plY3Rpb24gfHwge30pLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFkZFNlYXJjaChvcHRpb25zOiBJT3B0aW9ucywgYWdncmVnYXRlOiBJQWdncmVnYXRlT3B0aW9ucywgc2VhcmNoOiBhbnlbXSwgY3NlYXJjaDogYW55W10pIHtcbiAgICBpZiAob3B0aW9ucy5jb25kaXRpb25zIHx8IHNlYXJjaC5sZW5ndGggfHwgY3NlYXJjaC5sZW5ndGgpIHtcbiAgICAgIGFnZ3JlZ2F0ZS5zZWFyY2ggPSB7ICRhbmQ6IFtdIH07XG4gICAgICBpZiAob3B0aW9ucy5jb25kaXRpb25zKSB7IGFnZ3JlZ2F0ZS5zZWFyY2guJGFuZC5wdXNoKG9wdGlvbnMuY29uZGl0aW9ucyk7IH1cbiAgICAgIGlmIChzZWFyY2gubGVuZ3RoKSB7IGFnZ3JlZ2F0ZS5zZWFyY2guJGFuZC5wdXNoKHsgJG9yOiBzZWFyY2ggfSk7IH1cbiAgICAgIGlmIChjc2VhcmNoLmxlbmd0aCkgeyBhZ2dyZWdhdGUuc2VhcmNoLiRhbmQgPSBhZ2dyZWdhdGUuc2VhcmNoLiRhbmQuY29uY2F0KGNzZWFyY2gpOyB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRTZWFyY2gob3B0aW9uczogSU9wdGlvbnMsIHF1ZXJ5OiBJUXVlcnksIGNvbHVtbjogSUNvbHVtbiwgZmllbGQ6IGFueSk6IHsgc2VhcmNoOiBhbnlbXSwgY3NlYXJjaDogYW55W10gfSB7XG4gICAgY29uc3Qgc2VhcmNoID0gW10sIGNzZWFyY2ggPSBbXTtcbiAgICBpZiAocXVlcnkuc2VhcmNoICYmIHF1ZXJ5LnNlYXJjaC52YWx1ZSAhPT0gJycpIHtcbiAgICAgIGNvbnN0IHMgPSB0aGlzLmJ1aWxkQ29sdW1uU2VhcmNoKG9wdGlvbnMsIHF1ZXJ5LCBjb2x1bW4sIGZpZWxkLCBxdWVyeS5zZWFyY2gsIHRydWUpO1xuICAgICAgaWYgKHMpIHsgc2VhcmNoLnB1c2gocyk7IH1cbiAgICB9XG4gICAgaWYgKGNvbHVtbi5zZWFyY2ggJiYgY29sdW1uLnNlYXJjaC52YWx1ZSAhPT0gJycpIHtcbiAgICAgIGNvbnN0IHMgPSB0aGlzLmJ1aWxkQ29sdW1uU2VhcmNoKG9wdGlvbnMsIHF1ZXJ5LCBjb2x1bW4sIGZpZWxkLCBjb2x1bW4uc2VhcmNoLCBmYWxzZSk7XG4gICAgICBpZiAocykgeyBjc2VhcmNoLnB1c2gocyk7IH1cbiAgICB9XG4gICAgcmV0dXJuIHsgc2VhcmNoLCBjc2VhcmNoIH07XG4gIH1cblxuICBwcml2YXRlIGNodW5rU2VhcmNoKHNlYXJjaDogc3RyaW5nKTogc3RyaW5nW10ge1xuICAgIGxldCBjaHVua3M6IHN0cmluZ1tdID0gW107XG4gICAgY2h1bmtzID0gY2h1bmtzLmNvbmNhdChzZWFyY2gucmVwbGFjZSgvKD86XCIoW15cIl0qKVwiKS9nLCAobWF0Y2gsIHdvcmQpID0+IHtcbiAgICAgIGlmICh3b3JkICYmIHdvcmQubGVuZ3RoID4gMCkgeyBjaHVua3MucHVzaCh3b3JkKTsgfVxuICAgICAgcmV0dXJuICcnO1xuICAgIH0pLnNwbGl0KC9bIFxcdF0rLykuZmlsdGVyKHMgPT4gdHJpbShzKSAhPT0gJycpKTtcbiAgICByZXR1cm4gY2h1bmtzO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZENvbHVtblNlYXJjaChvcHRpb25zOiBJT3B0aW9ucywgcXVlcnk6IElRdWVyeSwgY29sdW1uOiBJQ29sdW1uLCBmaWVsZDogYW55LCBzZWFyY2g6IElTZWFyY2gsIGdsb2JhbDogYm9vbGVhbik6IGFueSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ2J1aWxkQ29sdW1uU2VhcmNoOicsIGNvbHVtbi5kYXRhLCBzZWFyY2gpO1xuICAgIGxldCBpbnN0YW5jZSA9IGZpZWxkLmluc3RhbmNlO1xuICAgIGlmIChvcHRpb25zLmhhbmRsZXJzICYmIG9wdGlvbnMuaGFuZGxlcnNbaW5zdGFuY2VdKSB7IHJldHVybiBvcHRpb25zLmhhbmRsZXJzW2luc3RhbmNlXShxdWVyeSwgY29sdW1uLCBmaWVsZCwgc2VhcmNoLCBnbG9iYWwpOyB9XG4gICAgaWYgKHRoaXMuY29uZmlnLmhhbmRsZXJzW2luc3RhbmNlXSkgeyByZXR1cm4gdGhpcy5jb25maWcuaGFuZGxlcnNbaW5zdGFuY2VdKHF1ZXJ5LCBjb2x1bW4sIGZpZWxkLCBzZWFyY2gsIGdsb2JhbCk7IH1cbiAgICBzd2l0Y2ggKGluc3RhbmNlKSB7XG4gICAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgICByZXR1cm4gdGhpcy5idWlsZENvbHVtblNlYXJjaFN0cmluZyhxdWVyeSwgY29sdW1uLCBmaWVsZCwgc2VhcmNoLCBnbG9iYWwpO1xuICAgICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICAgIHJldHVybiB0aGlzLmJ1aWxkQ29sdW1uU2VhcmNoQm9vbGVhbihxdWVyeSwgY29sdW1uLCBmaWVsZCwgc2VhcmNoLCBnbG9iYWwpO1xuICAgICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgICAgcmV0dXJuIHRoaXMuYnVpbGRDb2x1bW5TZWFyY2hOdW1iZXIocXVlcnksIGNvbHVtbiwgZmllbGQsIHNlYXJjaCwgZ2xvYmFsKTtcbiAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICByZXR1cm4gdGhpcy5idWlsZENvbHVtblNlYXJjaERhdGUocXVlcnksIGNvbHVtbiwgZmllbGQsIHNlYXJjaCwgZ2xvYmFsKTtcbiAgICAgIGNhc2UgJ09iamVjdElEJzpcbiAgICAgICAgcmV0dXJuIHRoaXMuYnVpbGRDb2x1bW5TZWFyY2hPYmplY3RJZChxdWVyeSwgY29sdW1uLCBmaWVsZCwgc2VhcmNoLCBnbG9iYWwpO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhpcy5sb2dnZXIud2FybihgYnVpbGRDb2x1bW5TZWFyY2ggY29sdW1uIFske2NvbHVtbi5kYXRhfV0gdHlwZSBbJHtpbnN0YW5jZX1dIG5vdCBtYW5hZ2VkICFgKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ29sdW1uU2VhcmNoU3RyaW5nKHF1ZXJ5OiBJUXVlcnksIGNvbHVtbjogSUNvbHVtbiwgZmllbGQ6IGFueSwgc2VhcmNoOiBJU2VhcmNoLCBnbG9iYWw6IGJvb2xlYW4pOiBhbnkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdidWlsZENvbHVtblNlYXJjaFN0cmluZzonLCBjb2x1bW4uZGF0YSwgc2VhcmNoKTtcbiAgICBpZiAoIWdsb2JhbCAmJiBzZWFyY2gudmFsdWUubWF0Y2goL15cXC8uKlxcLyQvKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29sdW1uU2VhcmNoOiBhbnkgPSB7fTtcbiAgICAgICAgY29sdW1uU2VhcmNoW2NvbHVtbi5kYXRhXSA9IG5ldyBSZWdFeHAoYCR7c2VhcmNoLnZhbHVlLnN1YnN0cmluZygxLCBzZWFyY2gudmFsdWUubGVuZ3RoIC0gMSl9YCwgJ2dpJyk7XG4gICAgICAgIHJldHVybiBjb2x1bW5TZWFyY2g7XG4gICAgICB9IGNhdGNoIChlcnIpIHsgfVxuICAgIH1cbiAgICBjb25zdCBzOiBhbnlbXSA9IFtdO1xuICAgIChzZWFyY2guY2h1bmtzIHx8IFtzZWFyY2gudmFsdWVdKS5mb3JFYWNoKGNodW5rID0+IHtcbiAgICAgIGNvbnN0IGNvbHVtblNlYXJjaDogYW55ID0ge307XG4gICAgICBjb2x1bW5TZWFyY2hbY29sdW1uLmRhdGFdID0gbmV3IFJlZ0V4cChgJHtlc2NhcGVTdHJpbmdSZWdleHAoY2h1bmspfWAsICdnaScpO1xuICAgICAgcy5wdXNoKGNvbHVtblNlYXJjaCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHMubGVuZ3RoID4gMCA/IHsgJG9yOiBzIH0gOiBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZENvbHVtblNlYXJjaEJvb2xlYW4ocXVlcnk6IElRdWVyeSwgY29sdW1uOiBJQ29sdW1uLCBmaWVsZDogYW55LCBzZWFyY2g6IElTZWFyY2gsIGdsb2JhbDogYm9vbGVhbik6IGFueSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ2J1aWxkQ29sdW1uU2VhcmNoU3RyaW5nOicsIGNvbHVtbi5kYXRhLCBzZWFyY2gpO1xuICAgIGlmIChnbG9iYWwpIHsgcmV0dXJuIG51bGw7IH1cbiAgICBjb25zdCB2YWx1ZSA9IGxvd2VyQ2FzZSh0cmltKHNlYXJjaC52YWx1ZSkpXG4gICAgbGV0IGNvbHVtblNlYXJjaDogYW55ID0gbnVsbDtcbiAgICBpZiAodmFsdWUgPT09ICd0cnVlJykge1xuICAgICAgY29sdW1uU2VhcmNoID0ge307XG4gICAgICBjb2x1bW5TZWFyY2hbY29sdW1uLmRhdGFdID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnZmFsc2UnKSB7XG4gICAgICBjb2x1bW5TZWFyY2ggPSB7fTtcbiAgICAgIGNvbHVtblNlYXJjaFtjb2x1bW4uZGF0YV0gPSBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbHVtblNlYXJjaDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRDb2x1bW5TZWFyY2hOdW1iZXIocXVlcnk6IElRdWVyeSwgY29sdW1uOiBJQ29sdW1uLCBmaWVsZDogYW55LCBzZWFyY2g6IElTZWFyY2gsIGdsb2JhbDogYm9vbGVhbik6IGFueSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ2J1aWxkQ29sdW1uU2VhcmNoTnVtYmVyOicsIGNvbHVtbi5kYXRhLCBzZWFyY2gpO1xuICAgIGlmIChnbG9iYWwpIHtcbiAgICAgIGNvbnN0IHM6IGFueVtdID0gW107XG4gICAgICAoc2VhcmNoLmNodW5rcyB8fCBbc2VhcmNoLnZhbHVlXSkuZm9yRWFjaChjaHVuayA9PiB7XG4gICAgICAgIGlmIChpc05hTihjaHVuayBhcyBhbnkpKSB7IHJldHVybjsgfVxuICAgICAgICBjb25zdCBjb2x1bW5TZWFyY2g6IGFueSA9IHt9O1xuICAgICAgICBjb2x1bW5TZWFyY2hbY29sdW1uLmRhdGFdID0gKG5ldyBOdW1iZXIoY2h1bmspKS52YWx1ZU9mKCk7XG4gICAgICAgIHMucHVzaChjb2x1bW5TZWFyY2gpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4geyAkb3I6IHMgfTtcbiAgICB9XG4gICAgaWYgKC9eKD18Pnw+PXw8PXw8fDw+fDw9Pik/KCg/OlswLTldK1suXSk/WzAtOV0rKSg/OiwoKD86WzAtOV0rWy5dKT9bMC05XSspKT8kLy50ZXN0KHNlYXJjaC52YWx1ZSkpIHtcbiAgICAgIGNvbnN0IG9wID0gUmVnRXhwLiQxO1xuICAgICAgY29uc3QgZnJvbSA9IG5ldyBOdW1iZXIoUmVnRXhwLiQyKTtcbiAgICAgIGNvbnN0IHRvID0gbmV3IE51bWJlcihSZWdFeHAuJDMpO1xuICAgICAgY29uc3QgY29sdW1uU2VhcmNoOiBhbnkgPSB7fTtcbiAgICAgIHN3aXRjaCAob3ApIHtcbiAgICAgICAgY2FzZSAnPic6IGNvbHVtblNlYXJjaFtjb2x1bW4uZGF0YV0gPSB7ICRndDogZnJvbS52YWx1ZU9mKCkgfTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJz49JzogY29sdW1uU2VhcmNoW2NvbHVtbi5kYXRhXSA9IHsgJGd0ZTogZnJvbS52YWx1ZU9mKCkgfTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJzwnOiBjb2x1bW5TZWFyY2hbY29sdW1uLmRhdGFdID0geyAkbHQ6IGZyb20udmFsdWVPZigpIH07IGJyZWFrO1xuICAgICAgICBjYXNlICc8PSc6IGNvbHVtblNlYXJjaFtjb2x1bW4uZGF0YV0gPSB7ICRsdGU6IGZyb20udmFsdWVPZigpIH07IGJyZWFrO1xuICAgICAgICBjYXNlICc8Pic6IGNvbHVtblNlYXJjaFtjb2x1bW4uZGF0YV0gPSB7ICRndDogZnJvbS52YWx1ZU9mKCksICRsdDogdG8udmFsdWVPZigpIH07IGJyZWFrO1xuICAgICAgICBjYXNlICc8PT4nOiBjb2x1bW5TZWFyY2hbY29sdW1uLmRhdGFdID0geyAkZ3RlOiBmcm9tLnZhbHVlT2YoKSwgJGx0ZTogdG8udmFsdWVPZigpIH07IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OiBjb2x1bW5TZWFyY2hbY29sdW1uLmRhdGFdID0gZnJvbS52YWx1ZU9mKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gY29sdW1uU2VhcmNoO1xuICAgIH0gZWxzZSB7IHRoaXMubG9nZ2VyLndhcm4oYGJ1aWxkQ29sdW1uU2VhcmNoTnVtYmVyIHVubWFuYWdlZCBzZWFyY2ggdmFsdWUgJyR7c2VhcmNoLnZhbHVlfWApOyB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ29sdW1uU2VhcmNoRGF0ZShxdWVyeTogSVF1ZXJ5LCBjb2x1bW46IElDb2x1bW4sIGZpZWxkOiBhbnksIHNlYXJjaDogSVNlYXJjaCwgZ2xvYmFsOiBib29sZWFuKTogYW55IHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnYnVpbGRDb2x1bW5TZWFyY2hEYXRlOicsIGNvbHVtbi5kYXRhLCBzZWFyY2gpO1xuICAgIGlmIChnbG9iYWwpIHtcbiAgICAgIGNvbnN0IHM6IGFueVtdID0gW107XG4gICAgICAoc2VhcmNoLmNodW5rcyB8fCBbc2VhcmNoLnZhbHVlXSkuZm9yRWFjaChjaHVuayA9PiB7XG4gICAgICAgIGlmIChpc05hTihjaHVuayBhcyBhbnkpKSB7IHJldHVybjsgfVxuICAgICAgICBjb25zdCBjb2x1bW5TZWFyY2g6IGFueSA9IHt9O1xuICAgICAgICBjb2x1bW5TZWFyY2hbY29sdW1uLmRhdGFdID0gKG5ldyBOdW1iZXIoY2h1bmspKS52YWx1ZU9mKCk7XG4gICAgICAgIHMucHVzaChjb2x1bW5TZWFyY2gpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4geyAkb3I6IHMgfTtcbiAgICB9XG4gICAgaWYgKC9eKD18Pnw+PXw8PXw8fDw+fDw9Pik/KFswLTkuXFwvLV0rKSg/OiwoWzAtOS5cXC8tXSspKT8kLy50ZXN0KHNlYXJjaC52YWx1ZSkpIHtcbiAgICAgIGNvbnN0IG9wID0gUmVnRXhwLiQxO1xuICAgICAgY29uc3QgJDIgPSBSZWdFeHAuJDI7XG4gICAgICBjb25zdCBmcm9tID0gaXNOYU4oJDIgYXMgYW55KSA/IG5ldyBEYXRlKCQyKSA6IG5ldyBEYXRlKHBhcnNlSW50KCQyKSk7XG4gICAgICBpZiAoIShmcm9tIGluc3RhbmNlb2YgRGF0ZSkgfHwgaXNOYU4oZnJvbS52YWx1ZU9mKCkpKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxvZ2dlci53YXJuKGBidWlsZENvbHVtblNlYXJjaERhdGUgaW52YWxpZCAnZnJvbScgZGF0ZSBmb3JtYXQgW1lZWVkvTU0vRERdICckeyQyfWApO1xuICAgICAgfVxuICAgICAgY29uc3QgJDMgPSBSZWdFeHAuJDM7XG4gICAgICBjb25zdCB0byA9IGlzTmFOKCQzIGFzIGFueSkgPyBuZXcgRGF0ZSgkMykgOiBuZXcgRGF0ZShwYXJzZUludCgkMykpO1xuICAgICAgaWYgKCQzICE9PSAnJyAmJiAoISh0byBpbnN0YW5jZW9mIERhdGUpIHx8IGlzTmFOKHRvLnZhbHVlT2YoKSkpKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxvZ2dlci53YXJuKGBidWlsZENvbHVtblNlYXJjaERhdGUgaW52YWxpZCAndG8nIGRhdGUgZm9ybWF0IFtZWVlZL01NL0REXSAnJHskM31gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNvbHVtblNlYXJjaDogYW55ID0ge307XG4gICAgICBzd2l0Y2ggKG9wKSB7XG4gICAgICAgIGNhc2UgJz4nOiBjb2x1bW5TZWFyY2hbY29sdW1uLmRhdGFdID0geyAkZ3Q6IGZyb20gfTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJz49JzogY29sdW1uU2VhcmNoW2NvbHVtbi5kYXRhXSA9IHsgJGd0ZTogZnJvbSB9OyBicmVhaztcbiAgICAgICAgY2FzZSAnPCc6IGNvbHVtblNlYXJjaFtjb2x1bW4uZGF0YV0gPSB7ICRsdDogZnJvbSB9OyBicmVhaztcbiAgICAgICAgY2FzZSAnPD0nOiBjb2x1bW5TZWFyY2hbY29sdW1uLmRhdGFdID0geyAkbHRlOiBmcm9tIH07IGJyZWFrO1xuICAgICAgICBjYXNlICc8Pic6IGNvbHVtblNlYXJjaFtjb2x1bW4uZGF0YV0gPSB7ICRndDogZnJvbSwgJGx0OiB0byB9OyBicmVhaztcbiAgICAgICAgY2FzZSAnPD0+JzogY29sdW1uU2VhcmNoW2NvbHVtbi5kYXRhXSA9IHsgJGd0ZTogZnJvbSwgJGx0ZTogdG8gfTsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IGNvbHVtblNlYXJjaFtjb2x1bW4uZGF0YV0gPSBmcm9tO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNvbHVtblNlYXJjaDtcbiAgICB9IGVsc2UgeyB0aGlzLmxvZ2dlci53YXJuKGBidWlsZENvbHVtblNlYXJjaERhdGUgdW5tYW5hZ2VkIHNlYXJjaCB2YWx1ZSAnJHtzZWFyY2gudmFsdWV9YCk7IH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRDb2x1bW5TZWFyY2hPYmplY3RJZChxdWVyeTogSVF1ZXJ5LCBjb2x1bW46IElDb2x1bW4sIGZpZWxkOiBhbnksIHNlYXJjaDogSVNlYXJjaCwgZ2xvYmFsOiBib29sZWFuKTogYW55IHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnYnVpbGRDb2x1bW5TZWFyY2hPYmplY3RJZDonLCBjb2x1bW4uZGF0YSwgc2VhcmNoKTtcbiAgICBpZiAoZ2xvYmFsIHx8ICFzZWFyY2gudmFsdWUubWF0Y2goL15bMC05YS1mQS1GXXsyNH0kLykpIHsgcmV0dXJuIG51bGw7IH1cbiAgICBjb25zdCBjb2x1bW5TZWFyY2g6IGFueSA9IHt9O1xuICAgIGNvbHVtblNlYXJjaFtjb2x1bW4uZGF0YV0gPSBzZWFyY2gudmFsdWU7XG4gICAgcmV0dXJuIGNvbHVtblNlYXJjaFxuICB9XG5cbiAgcHJpdmF0ZSBwYWdpbmF0aW9uKHF1ZXJ5OiBJUXVlcnkpOiBJUGFnaW5hdGlvbiB7XG4gICAgY29uc3Qgc3RhcnQgPSBxdWVyeS5zdGFydCA/IHBhcnNlSW50KHF1ZXJ5LnN0YXJ0LCAxMCkgOiAwO1xuICAgIGNvbnN0IGxlbmd0aCA9IHF1ZXJ5Lmxlbmd0aCA/IHBhcnNlSW50KHF1ZXJ5Lmxlbmd0aCwgMTApIDogdW5kZWZpbmVkO1xuICAgIHJldHVybiB7IHN0YXJ0OiBpc05hTihzdGFydCkgPyAwIDogc3RhcnQsIGxlbmd0aDogaXNOYU4obGVuZ3RoKSA/IHVuZGVmaW5lZCA6IGxlbmd0aCB9O1xuICB9XG5cbiAgcHJpdmF0ZSBpc1RydWUoZGF0YTogc3RyaW5nIHwgYm9vbGVhbik6IGJvb2xlYW4ge1xuICAgIHJldHVybiBkYXRhID09PSB0cnVlIHx8IGRhdGEgPT09ICd0cnVlJztcbiAgfVxuXG4gIHByaXZhdGUgaXNGYWxzZShkYXRhOiBzdHJpbmcgfCBib29sZWFuKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGRhdGEgPT09IGZhbHNlIHx8IGRhdGEgPT09ICdmYWxzZSc7XG4gIH1cblxuICBwcml2YXRlIGlzU2VsZWN0YWJsZShmaWVsZDogYW55KSB7XG4gICAgcmV0dXJuICFmaWVsZC5vcHRpb25zIHx8IChmaWVsZC5vcHRpb25zLnNlbGVjdCAhPT0gZmFsc2UgJiYgZmllbGQub3B0aW9ucy5kYXRhVGFibGVTZWxlY3QgIT09IGZhbHNlKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb3Jkc1RvdGFsKG9wdGlvbnM6IElPcHRpb25zKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICByZXR1cm4gdGhpcy5tb2RlbC5jb3VudERvY3VtZW50cyhvcHRpb25zLmNvbmRpdGlvbnMpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWNvcmRzRmlsdGVyZWQob3B0aW9uczogSU9wdGlvbnMsIGFnZ3JlZ2F0ZU9wdGlvbnM6IElBZ2dyZWdhdGVPcHRpb25zLCByZWNvcmRzVG90YWw6IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgaWYgKCFhZ2dyZWdhdGVPcHRpb25zLnNlYXJjaCkgeyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlY29yZHNUb3RhbCk7IH1cbiAgICBpZiAoIWFnZ3JlZ2F0ZU9wdGlvbnMucG9wdWxhdGUpIHsgcmV0dXJuIHRoaXMubW9kZWwuY291bnREb2N1bWVudHMoYWdncmVnYXRlT3B0aW9ucy5zZWFyY2gpOyB9XG4gICAgY29uc3QgYWdncmVnYXRlOiBhbnlbXSA9IFtdO1xuICAgIGFnZ3JlZ2F0ZU9wdGlvbnMucG9wdWxhdGUuZm9yRWFjaChkYXRhID0+IGFnZ3JlZ2F0ZS5wdXNoKGRhdGEpKTtcbiAgICBhZ2dyZWdhdGUucHVzaCh7ICRtYXRjaDogYWdncmVnYXRlT3B0aW9ucy5zZWFyY2ggfSk7XG4gICAgYWdncmVnYXRlLnB1c2goeyAkY291bnQ6ICdmaWx0ZXJlZCcgfSk7XG4gICAgcmV0dXJuIHRoaXMubW9kZWwuYWdncmVnYXRlKGFnZ3JlZ2F0ZSkudGhlbihkYXRhID0+IGRhdGEubGVuZ3RoID09PSAxID8gZGF0YVswXS5maWx0ZXJlZCA6IDApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkYXRhKG9wdGlvbnM6IElPcHRpb25zLCBhZ2dyZWdhdGVPcHRpb25zOiBJQWdncmVnYXRlT3B0aW9ucyk6IFByb21pc2U8YW55W10+IHtcbiAgICBjb25zdCBhZ2dyZWdhdGU6IGFueVtdID0gW107XG4gICAgaWYgKGFnZ3JlZ2F0ZU9wdGlvbnMucG9wdWxhdGUpIHsgYWdncmVnYXRlT3B0aW9ucy5wb3B1bGF0ZS5mb3JFYWNoKGRhdGEgPT4gYWdncmVnYXRlLnB1c2goZGF0YSkpOyB9XG4gICAgaWYgKGFnZ3JlZ2F0ZU9wdGlvbnMucHJvamVjdGlvbikgeyBhZ2dyZWdhdGUucHVzaCh7ICRwcm9qZWN0OiBhZ2dyZWdhdGVPcHRpb25zLnByb2plY3Rpb24gfSk7IH1cbiAgICBpZiAoYWdncmVnYXRlT3B0aW9ucy5zZWFyY2gpIHsgYWdncmVnYXRlLnB1c2goeyAkbWF0Y2g6IGFnZ3JlZ2F0ZU9wdGlvbnMuc2VhcmNoIH0pOyB9XG4gICAgaWYgKGFnZ3JlZ2F0ZU9wdGlvbnMuc29ydCkgeyBhZ2dyZWdhdGUucHVzaCh7ICRzb3J0OiBhZ2dyZWdhdGVPcHRpb25zLnNvcnQgfSk7IH1cbiAgICBpZiAoYWdncmVnYXRlT3B0aW9ucy5wYWdpbmF0aW9uKSB7XG4gICAgICBpZiAoYWdncmVnYXRlT3B0aW9ucy5wYWdpbmF0aW9uLnN0YXJ0KSB7IGFnZ3JlZ2F0ZS5wdXNoKHsgJHNraXA6IGFnZ3JlZ2F0ZU9wdGlvbnMucGFnaW5hdGlvbi5zdGFydCAqIGFnZ3JlZ2F0ZU9wdGlvbnMucGFnaW5hdGlvbi5sZW5ndGggfSk7IH1cbiAgICAgIGlmIChhZ2dyZWdhdGVPcHRpb25zLnBhZ2luYXRpb24ubGVuZ3RoKSB7IGFnZ3JlZ2F0ZS5wdXNoKHsgJGxpbWl0OiBhZ2dyZWdhdGVPcHRpb25zLnBhZ2luYXRpb24ubGVuZ3RoIH0pOyB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzLm1vZGVsLmFnZ3JlZ2F0ZShhZ2dyZWdhdGUpLmFsbG93RGlza1VzZSh0cnVlKTtcbiAgfVxuXG59XG5cbmV4cG9ydCBkZWZhdWx0IERhdGFUYWJsZU1vZHVsZTtcbiJdfQ==
