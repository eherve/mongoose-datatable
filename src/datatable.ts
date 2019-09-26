
import * as util from 'util';
import { assign, trim, lowerCase, merge } from 'lodash';
import * as escapeStringRegexp from 'escape-string-regexp';
import { Schema, Model, SchemaType } from 'mongoose';
import { unflatten } from 'flat';

interface ILogger {
  debug: (...data: any) => void;
  info: (...data: any) => void;
  warn: (...data: any) => void;
  error: (...data: any) => void;
}

interface ISort {
  [column: string]: number
}

export interface IColumn {
  data: string;
  name: string;
  searchable: boolean;
  orderable: boolean;
  search: ISearch;
}

interface IOrder {
  column: number;
  dir: string;
}

export interface ISearch {
  value: string;
  regex: boolean;
  chunks?: string[];
}

interface IProjection {
  [key: string]: any;
}

interface ILookup {
  $lookup: {
    from: string;
    localField: string;
    foreignField: string;
    as: string;
  }
}

interface IReplace {
  $replaceRoot: {
    newRoot: {
      $mergeObjects: any[];
    }
  }
}

interface IUnwind {
  $unwind: {
    path: string;
    preserveNullAndEmptyArrays: boolean;
  }
}

interface IPagination {
  start: number;
  length: number;
}

interface IAggregateOptions {
  populate: (ILookup | IUnwind)[];
  projection: IProjection;
  search?: any;
  sort: ISort;
  pagination: IPagination;

}

export interface IQuery {
  draw: string;
  columns: IColumn[];
  order?: IOrder[];
  start: string;
  length: string;
  search: ISearch;
}

export type HandlerType = (query: IQuery, column: IColumn, field: any, search: ISearch, global: boolean) => any;

export interface IOptions {
  logger?: ILogger;
  handlers?: { [type: string]: HandlerType };
  conditions?: any;
  select?: any;
  disableCount?: boolean;
}

export interface IData {
  draw: string;
  recordsTotal: number;
  recordsFiltered: number;
  data: any[];
}

export interface IConfig {
  logger?: ILogger;
  handlers?: { [type: string]: HandlerType };
};

class DataTableModule {

  static CONFIG: IConfig = {
    logger: console,
    handlers: {}
  };

  private _config: IConfig = DataTableModule.CONFIG;
  private get config() { return this._config; }
  private get logger() { return this._config.logger; }
  private model: Model<any, any>;

  static configure(config?: IConfig): IConfig {
    if (config) {
      DataTableModule.CONFIG = assign(DataTableModule.CONFIG, config);
    }
    return DataTableModule.CONFIG;
  }

  static init(schema: any, config?: IConfig) {
    const dataTableModule = new DataTableModule(schema);
    schema.statics.dataTable = function (query: IQuery, options?: IOptions) {
      options = merge(config || {}, options || {});
      dataTableModule.model = this;
      return dataTableModule.dataTable(query, options);
    };
  }

  constructor(private schema: Schema) { }

  private dataTable(query: IQuery, options: IOptions = {} as IOptions): Promise<IData> {
    (options.logger || this.logger).debug('quey:', util.inspect(query, { depth: null }));
    const aggregate: IAggregateOptions = {
      projection: null,
      populate: [],
      sort: this.buildSort(query),
      pagination: this.pagination(query)
    };
    this.updateAggregateOptions(options, query, aggregate);
    (options.logger || this.logger).debug('aggregate:', util.inspect(aggregate, { depth: null }));
    return (options.disableCount === true ? Promise.resolve(-1) : this.recordsTotal(options))
      .then(recordsTotal => {
        return (options.disableCount === true ? Promise.resolve(-1) : this.recordsFiltered(options, aggregate, recordsTotal))
          .then(recordsFiltered => {
            return this.data(options, aggregate).then(data => {
              return Promise.resolve({ draw: query.draw, recordsTotal, recordsFiltered, data });
            });
          });
      });
  }

  private buildSort(query: IQuery): ISort {
    if (!query.order || query.order.length === 0) { return null; }
    const sort: ISort = {};
    query.order.forEach(order => {
      const column: IColumn = query.columns[order.column];
      if (!column && this.isFalse(column.orderable)) { return; }
      sort[column.data] = order.dir === 'asc' ? 1 : -1;
    });
    return sort;
  }

  private updateAggregateOptions(options: IOptions, query: IQuery, aggregate: IAggregateOptions): void {
    let search: any[] = [], csearch: any[] = [];
    const projection: any = {};
    if (query.search && query.search.value && query.search.value !== '') { query.search.chunks = this.chunkSearch(query.search.value); }
    query.columns.forEach(column => {
      const field = this.fetchField(options, query, column, aggregate.populate);
      if (!field) { return; }
      if (!this.isSelectable(field)) { return; }
      if (this.isTrue(column.searchable)) {
        if (column.search && column.search.value && column.search.value !== '') { column.search.chunks = this.chunkSearch(column.search.value); }
        const s = this.getSearch(options, query, column, field);
        search = search.concat(s.search);
        csearch = csearch.concat(s.csearch);
      }
      projection[column.data] = 1;
    });
    this.addProjection(options, aggregate, projection);
    this.addSearch(options, aggregate, search, csearch);
  }

  private fetchField(options: IOptions, query: IQuery, column: IColumn, populate: (ILookup | IUnwind)[]): any {
    const group: any[] = [];
    let field: any = this.schema.path(column.data);
    if (field) { return field; }
    let path = column.data, model = this.model, schema = this.schema, base = '', inArray = false;
    while (path.length) {
      field = schema.path(path) || this.getField(schema, path);
      if (!field) {
        return (options.logger || this.logger).warn(`field path ${column.data} not found !`);
      }
      base += ((base.length ? '.' : '') + field.path);
      path = path.substring(field.path.length + 1);

      if (field.options && field.options.ref) {
        model = model.model(field.options.ref);
        schema = model.schema;
        if (!populate.find((l: any) => l.$lookup && l.$lookup.localField === base)) {
          populate.push({ $lookup: { from: model.collection.collectionName, localField: base, foreignField: '_id', as: base } });
          populate.push({ $unwind: { path: `$${base}`, preserveNullAndEmptyArrays: true } });
        }
      } else if (field.instance === 'Array' && field.caster && field.caster.options && field.caster.options.ref) {
        if (inArray) {
          (options.logger || this.logger).warn(`lookup on submodel array [${column.data}] not managed !`);
          return;
        }
        model = model.model(field.caster.options.ref);
        schema = model.schema;
        if (!populate.find((l: any) => l.$lookup && l.$lookup.localField === base)) {
          populate.push({ $lookup: { from: model.collection.collectionName, localField: base, foreignField: '_id', as: base } });
        }
      } else if (field.instance === 'Array') {
        inArray = true;
        group.push(base);
        schema = field.schema;
      } else { break; }
    }
    if (!field) {
      (options.logger || this.logger).warn(`field path ${column.data} not found !`);
    }
    return field;
  }

  private getField(schema: any, path: string): SchemaType {
    var baseField: any, tail = path, base: string, indexSep: number, index = -1, count = 0;
    while ((indexSep = tail.indexOf('.')) != -1) {
      if (++count > 10) break;
      index += indexSep + 1;
      var base = path.substring(0, index);
      baseField = schema.path(base);
      if (baseField) { return baseField; }
      tail = path.substring(base.length + 1);
    }
  }

  private addProjection(options: IOptions, aggregate: IAggregateOptions, projection: any) {
    if (options.select || projection !== {}) {
      const select = typeof options.select === 'string' ?
        options.select.split(' ').reduce((p: any, c: string) => (p[c] = 1, p), {}) :
        Array.isArray(options.select) ?
          options.select.reduce((p: any, c: string) => (p[c] = 1, p), {}) :
          options.select;
      aggregate.projection = unflatten(merge(select, projection || {}), { overwrite: true });
    }
  }

  private addSearch(options: IOptions, aggregate: IAggregateOptions, search: any[], csearch: any[]) {
    if (options.conditions || search.length || csearch.length) {
      aggregate.search = { $and: [] };
      if (options.conditions) { aggregate.search.$and.push(options.conditions); }
      if (search.length) { aggregate.search.$and.push({ $or: search }); }
      if (csearch.length) { aggregate.search.$and = aggregate.search.$and.concat(csearch); }
    }
  }

  private getSearch(options: IOptions, query: IQuery, column: IColumn, field: any): { search: any[], csearch: any[] } {
    const search = [], csearch = [];
    if (query.search && query.search.value && query.search.value !== '') {
      const s = this.buildColumnSearch(options, query, column, field, query.search, true);
      if (s) { search.push(s); }
    }
    if (column.search && column.search.value && column.search.value !== '') {
      const s = this.buildColumnSearch(options, query, column, field, column.search, false);
      if (s) { csearch.push(s); }
    }
    return { search, csearch };
  }

  private chunkSearch(search: string): string[] {
    let chunks: string[] = [];
    chunks = chunks.concat(search.replace(/(?:"([^"]*)")/g, (match, word) => {
      if (word && word.length > 0) { chunks.push(word); }
      return '';
    }).split(/[ \t]+/).filter(s => trim(s) !== ''));
    return chunks;
  }

  private buildColumnSearch(options: IOptions, query: IQuery, column: IColumn, field: any, search: ISearch, global: boolean): any {
    (options.logger || this.logger).debug('buildColumnSearch:', column.data, search);
    let instance = field.instance;
    if (options.handlers && options.handlers[instance]) { return options.handlers[instance](query, column, field, search, global); }
    if (this.config.handlers[instance]) { return this.config.handlers[instance](query, column, field, search, global); }
    switch (instance) {
      case 'String':
        return this.buildColumnSearchString(options, query, column, field, search, global);
      case 'Boolean':
        return this.buildColumnSearchBoolean(options, query, column, field, search, global);
      case 'Number':
        return this.buildColumnSearchNumber(options, query, column, field, search, global);
      case 'Date':
        return this.buildColumnSearchDate(options, query, column, field, search, global);
      case 'ObjectID':
        return this.buildColumnSearchObjectId(options, query, column, field, search, global);
      default:
        if (options.handlers && options.handlers.default) { return options.handlers.default(query, column, field, search, global); }
        if (this.config.handlers.default) { return this.config.handlers.default(query, column, field, search, global); }
        (options.logger || this.logger).warn(`buildColumnSearch column [${column.data}] type [${instance}] not managed !`);
    }
    return null;
  }

  private buildColumnSearchString(options: IOptions, query: IQuery, column: IColumn, field: any, search: ISearch, global: boolean): any {
    (options.logger || this.logger).debug('buildColumnSearchString:', column.data, search);
    if (!global && search.value.match(/^\/.*\/$/)) {
      try {
        const columnSearch: any = {};
        columnSearch[column.data] = new RegExp(`${search.value.substring(1, search.value.length - 1)}`, 'gi');
        return columnSearch;
      } catch (err) { }
    }
    const s: any[] = [];
    (search.chunks || [search.value]).forEach(chunk => {
      const columnSearch: any = {};
      columnSearch[column.data] = new RegExp(`${escapeStringRegexp(chunk)}`, 'gi');
      s.push(columnSearch);
    });
    return s.length > 0 ? { $or: s } : null;
  }

  private buildColumnSearchBoolean(options: IOptions, query: IQuery, column: IColumn, field: any, search: ISearch, global: boolean): any {
    (options.logger || this.logger).debug('buildColumnSearchString:', column.data, search);
    if (global) { return null; }
    const value = lowerCase(trim(search.value))
    let columnSearch: any = null;
    if (value === 'true') {
      columnSearch = {};
      columnSearch[column.data] = true;
    } else if (value === 'false') {
      columnSearch = {};
      columnSearch[column.data] = false;
    }
    return columnSearch;
  }

  private buildColumnSearchNumber(options: IOptions, query: IQuery, column: IColumn, field: any, search: ISearch, global: boolean): any {
    (options.logger || this.logger).debug('buildColumnSearchNumber:', column.data, search);
    if (global) {
      const s: any[] = [];
      (search.chunks || [search.value]).forEach(chunk => {
        if (isNaN(chunk as any)) { return; }
        const columnSearch: any = {};
        columnSearch[column.data] = (new Number(chunk)).valueOf();
        s.push(columnSearch);
      });
      return s.length > 0 ? { $or: s } : null;
    }
    if (/^(=|>|>=|<=|<|<>|<=>)?((?:[0-9]+[.])?[0-9]+)(?:,((?:[0-9]+[.])?[0-9]+))?$/.test(search.value)) {
      const op = RegExp.$1;
      const from = new Number(RegExp.$2);
      const to = new Number(RegExp.$3);
      const columnSearch: any = {};
      switch (op) {
        case '>': columnSearch[column.data] = { $gt: from.valueOf() }; break;
        case '>=': columnSearch[column.data] = { $gte: from.valueOf() }; break;
        case '<': columnSearch[column.data] = { $lt: from.valueOf() }; break;
        case '<=': columnSearch[column.data] = { $lte: from.valueOf() }; break;
        case '<>': columnSearch[column.data] = { $gt: from.valueOf(), $lt: to.valueOf() }; break;
        case '<=>': columnSearch[column.data] = { $gte: from.valueOf(), $lte: to.valueOf() }; break;
        default: columnSearch[column.data] = from.valueOf();
      }
      return columnSearch;
    } else { (options.logger || this.logger).warn(`buildColumnSearchNumber unmanaged search value '${search.value}`); }
    return null;
  }

  private buildColumnSearchDate(options: IOptions, query: IQuery, column: IColumn, field: any, search: ISearch, global: boolean): any {
    (options.logger || this.logger).debug('buildColumnSearchDate:', column.data, search);
    if (global) {
      const s: any[] = [];
      (search.chunks || [search.value]).forEach(chunk => {
        if (isNaN(chunk as any)) { return; }
        const columnSearch: any = {};
        columnSearch[column.data] = (new Number(chunk)).valueOf();
        s.push(columnSearch);
      });
      return s.length > 0 ? { $or: s } : null;
    }
    if (/^(=|>|>=|<=|<|<>|<=>)?([0-9.\/-]+)(?:,([0-9.\/-]+))?$/.test(search.value)) {
      const op = RegExp.$1;
      const $2 = RegExp.$2;
      const from = isNaN($2 as any) ? new Date($2) : new Date(parseInt($2));
      if (!(from instanceof Date) || isNaN(from.valueOf())) {
        return (options.logger || this.logger).warn(`buildColumnSearchDate invalid 'from' date format [YYYY/MM/DD] '${$2}`);
      }
      const $3 = RegExp.$3;
      const to = isNaN($3 as any) ? new Date($3) : new Date(parseInt($3));
      if ($3 !== '' && (!(to instanceof Date) || isNaN(to.valueOf()))) {
        return (options.logger || this.logger).warn(`buildColumnSearchDate invalid 'to' date format [YYYY/MM/DD] '${$3}`);
      }
      const columnSearch: any = {};
      switch (op) {
        case '>': columnSearch[column.data] = { $gt: from }; break;
        case '>=': columnSearch[column.data] = { $gte: from }; break;
        case '<': columnSearch[column.data] = { $lt: from }; break;
        case '<=': columnSearch[column.data] = { $lte: from }; break;
        case '<>': columnSearch[column.data] = { $gt: from, $lt: to }; break;
        case '<=>': columnSearch[column.data] = { $gte: from, $lte: to }; break;
        default: columnSearch[column.data] = from;
      }
      return columnSearch;
    } else { (options.logger || this.logger).warn(`buildColumnSearchDate unmanaged search value '${search.value}`); }
    return null;
  }

  private buildColumnSearchObjectId(options: IOptions, query: IQuery, column: IColumn, field: any, search: ISearch, global: boolean): any {
    (options.logger || this.logger).debug('buildColumnSearchObjectId:', column.data, search);
    if (global || !search.value.match(/^[0-9a-fA-F]{24}$/)) { return null; }
    const columnSearch: any = {};
    columnSearch[column.data] = search.value;
    return columnSearch
  }

  private pagination(query: IQuery): IPagination {
    const start = query.start ? parseInt(query.start, 10) : 0;
    const length = query.length ? parseInt(query.length, 10) : undefined;
    return { start: isNaN(start) ? 0 : start, length: isNaN(length) ? undefined : length };
  }

  private isTrue(data: string | boolean): boolean {
    return data === true || data === 'true';
  }

  private isFalse(data: string | boolean): boolean {
    return data === false || data === 'false';
  }

  private isSelectable(field: any) {
    return !field.options || (field.options.select !== false && field.options.dataTableSelect !== false);
  }

  private async recordsTotal(options: IOptions): Promise<number> {
    return this.model.countDocuments(options.conditions);
  }

  private async recordsFiltered(options: IOptions, aggregateOptions: IAggregateOptions, recordsTotal: number): Promise<number> {
    if (!aggregateOptions.search) { return Promise.resolve(recordsTotal); }
    if (aggregateOptions.populate.length === 0) { return this.model.countDocuments(aggregateOptions.search); }
    const aggregate: any[] = [];
    aggregateOptions.populate.forEach(data => aggregate.push(data));
    aggregate.push({ $match: aggregateOptions.search });
    aggregate.push({ $count: 'filtered' });
    return this.model.aggregate(aggregate).then(data => data.length === 1 ? data[0].filtered : 0);
  }

  private async data(options: IOptions, aggregateOptions: IAggregateOptions): Promise<any[]> {
    const aggregate: any[] = [];
    aggregateOptions.populate.forEach(data => aggregate.push(data));
    if (aggregateOptions.projection) { aggregate.push({ $project: aggregateOptions.projection }); }
    if (aggregateOptions.search) { aggregate.push({ $match: aggregateOptions.search }); }
    if (aggregateOptions.sort) { aggregate.push({ $sort: aggregateOptions.sort }); }
    if (aggregateOptions.pagination) {
      if (aggregateOptions.pagination.start) { aggregate.push({ $skip: aggregateOptions.pagination.start * aggregateOptions.pagination.length }); }
      if (aggregateOptions.pagination.length) { aggregate.push({ $limit: aggregateOptions.pagination.length }); }
    }
    return this.model.aggregate(aggregate).allowDiskUse(true);
  }

}

export default DataTableModule;
