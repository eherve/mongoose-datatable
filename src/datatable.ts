/** @format */

import * as flat from 'flat';
import {assign, clone, concat, each, isArray, isNil, lowerCase, map, merge, set, trim} from 'lodash';
import {Model, Schema, SchemaType, Types} from 'mongoose';
import * as util from 'util';

interface IFetchFieldData {
  populate: PopulateType;
  populated: boolean;
  field: SchemaType;
  path: string;
  model: Model<any>;
  schema: Schema<any>;
  base: string;
  inArray: string | null;
}

interface ILogger {
  debug: (...data: any) => void;
  warn: (...data: any) => void;
}

interface ISort {
  [column: string]: number;
}

export interface IColumn {
  data: string;
  name?: string;
  searchable?: boolean;
  orderable?: boolean;
  search?: ISearch;
  type?: string;
}

interface IOrder {
  column: number;
  dir: string;
}

export interface ISearch {
  value: any;
  regex?: boolean;
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
  };
}

interface IReplace {
  $replaceRoot: {
    newRoot: {
      $mergeObjects: any[];
    };
  };
}

interface IUnwind {
  $unwind: {
    path: string;
    preserveNullAndEmptyArrays: boolean;
  };
}

type PopulateType = (ILookup | IUnwind)[];

interface IPagination {
  start: number;
  length: number;
}

interface IAggregateOptions {
  populate: PopulateType;
  projection: IProjection;
  search?: any;
  afterPopulateSearch?: any;
  sort: ISort;
  pagination: IPagination;
  groupBy?: string[];
}

export interface IQuery {
  draw: string;
  columns: IColumn[];
  order?: IOrder[];
  start: string | number;
  length: string | number;
  search?: ISearch;
  groupBy?: string[];
}

export type HandlerType = (query: IQuery, column: IColumn, field: any, search: ISearch, global: boolean) => any;

export interface IOptions {
  logger?: ILogger;
  handlers?: {[type: string]: HandlerType};
  conditions?: any;
  select?: any;
  disableCount?: boolean;
  unwind?: string[];
  processUnknownFields?: boolean;
}

export interface IData {
  draw: string;
  recordsTotal: number;
  recordsFiltered: number;
  data: any[];
}

export interface IConfig {
  logger?: ILogger;
  handlers?: {[type: string]: HandlerType};
  processUnknownFields?: boolean;
}

export class DataTableModule {
  static CONFIG: IConfig = {
    logger: null,
    handlers: {},
    processUnknownFields: true,
  };

  private _config: IConfig = DataTableModule.CONFIG;

  private get config() {
    return this._config;
  }

  private get logger() {
    return this._config.logger;
  }

  private model: Model<any>;

  static configure(config?: IConfig): IConfig {
    if (config) {
      DataTableModule.CONFIG = assign(DataTableModule.CONFIG, config);
    }
    return DataTableModule.CONFIG;
  }

  static init(schema: any, config?: IConfig) {
    const dataTableModule = new DataTableModule(schema);
    schema.statics.dataTableConfig = merge({}, DataTableModule.CONFIG, config);
    schema.statics.dataTable = function (query: IQuery, options?: IOptions) {
      options = merge({}, schema.statics.dataTableConfig, options);
      dataTableModule.model = this;
      return dataTableModule.dataTable(query, options);
    };
  }

  constructor(private schema: Schema) {}

  private dataTable(query: IQuery, options: IOptions = {} as IOptions): Promise<IData> {
    this.debug(options.logger, 'quey:', util.inspect(query, {depth: null}));
    const aggregate: IAggregateOptions = {
      projection: null,
      populate: [],
      sort: this.buildSort(query),
      pagination: this.pagination(query),
      groupBy: query.groupBy,
    };
    this.updateAggregateOptions(options, query, aggregate);
    return (options.disableCount === true ? Promise.resolve(-1) : this.recordsTotal(options)).then(recordsTotal => {
      return (
        options.disableCount === true ? Promise.resolve(-1) : this.recordsFiltered(options, aggregate, recordsTotal)
      ).then(recordsFiltered => {
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

  private buildSort(query: IQuery): ISort {
    if (!query.order || query.order.length === 0) {
      return null;
    }
    const sort: ISort = {};
    query.order.forEach(order => {
      const column: IColumn = query.columns[order.column];
      if (column) {
        if (this.isFalse(column.orderable)) {
          return;
        }
        sort[column.data] = order.dir === 'asc' ? 1 : -1;
      }
    });
    return !!Object.keys(sort).length ? sort : null;
  }

  private updateAggregateOptions(options: IOptions, query: IQuery, aggregate: IAggregateOptions): void {
    let search: any[] = [],
      csearch: any[] = [],
      psearch: any[] = [];
    const projection: any = {};
    if (query.search && query.search.value !== undefined && query.search.value !== '') {
      query.search.chunks = this.getChunkSearch(query.search.value);
    }
    query.columns.forEach(column => {
      const finfo = this.fetchField(options, query, column, aggregate.populate);
      if (!finfo?.field) return;
      if (!this.isSelectable(finfo.field)) return;
      if (this.isTrue(column.searchable)) {
        if (column.search && column.search.value !== undefined && column.search.value !== '') {
          column.search.chunks = this.getChunkSearch(column.search.value);
        }
        const s = this.getSearch(options, query, column, finfo.field);
        search = search.concat(s.search);
        if (finfo.populated) {
          psearch = psearch.concat(s.csearch);
        } else {
          csearch = csearch.concat(s.csearch);
        }
      }
      projection[column.data] = 1;
    });
    this.addProjection(options, aggregate, projection);
    aggregate.search = this.addSearch(csearch);
    aggregate.afterPopulateSearch = this.addSearch(psearch, search, options.conditions);
  }

  private getModel(base: Model<any>, modelName: string): Model<any> {
    try {
      return base.db.model(modelName);
    } catch (err) {}
    return null;
  }

  private addFieldRef(data: {
    populated: boolean;
    populate: PopulateType;
    model: Model<any>;
    schema: Schema<any>;
    field: any;
    base: string;
  }) {
    data.populated = true;
    data.model = this.getModel(data.model, data.field.options.ref);
    if (!data.model) return;
    data.schema = data.model.schema;
    if (!data.populate.find((l: any) => l.$lookup && l.$lookup.localField === data.base)) {
      data.populate.push({
        $lookup: {
          from: data.model.collection.collectionName,
          localField: data.base,
          foreignField: '_id',
          as: data.base,
        },
      });
      data.populate.push({
        $unwind: {path: `$${data.base}`, preserveNullAndEmptyArrays: true},
      });
    }
  }

  private addFieldArrayRef(data: {
    populated: boolean;
    populate: PopulateType;
    model: Model<any>;
    schema: Schema<any>;
    field: any;
    base: string;
    path: string;
    inArray: string;
  }) {
    data.populated = true;
    data.model = this.getModel(data.model, data.field.options.ref);
    if (!data.model) return;
    data.schema = data.model.schema;
    if (!data.populate.find((l: any) => l.$lookup && l.$lookup.localField === data.base)) {
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
      } as any);
    }
  }

  private fieldNotFound(options: IOptions, column: IColumn, data: IFetchFieldData) {
    if (!data?.model) {
      this.warn(options.logger, `field path ${column.data} refered model ${data.field?.options?.ref} not found !`);
    } else this.warn(options.logger, `field path ${column.data} not found !`);
    if (!options.processUnknownFields) return;
    return {field: {path: column.data}, populated: false};
  }

  private fetchField(
    options: IOptions,
    query: IQuery,
    column: IColumn,
    populate: PopulateType
  ): {field: any; populated: boolean} {
    let populated = false;
    let field: any = this.schema.path(column.data);
    if (field) return {field, populated};
    const data: IFetchFieldData = {
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
      if (!data.field) return this.fieldNotFound(options, column, data);
      data.base += (data.base.length ? '.' : '') + data.field.path;
      data.path = data.path.substring(data.field.path.length + 1);

      // ref field
      if (data.field.options && data.field.options.ref && !data.inArray) {
        this.addFieldRef(data);
        if (!data.model) return this.fieldNotFound(options, column, data);
        continue;
      }

      // ref field in array
      if (data.field.options && data.field.options.ref && !!data.inArray) {
        this.addFieldArrayRef(data);
        if (!data.model) return this.fieldNotFound(options, column, data);
        continue;
      }

      // ref array field ref
      if (
        data.field.instance === 'Array' &&
        (data.field as any).caster &&
        (data.field as any).caster.options &&
        (data.field as any).caster.options.ref
      ) {
        data.populated = true;
        data.model = this.getModel(data.model, (data.field as any).caster.options.ref);
        if (!data.model) {
          this.warn(
            options.logger,
            `field path ${column.data} refered model ${(data.field as any).caster.options.ref} not found !`
          );
          return;
        }
        data.schema = data.model.schema;
        if (!populate.find((l: any) => l.$lookup && l.$lookup.localField === data.base)) {
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
    return {field: data.field, populated: data.populated};
  }

  private getField(schema: any, path: string): SchemaType {
    var baseField: any,
      tail = path,
      base: string,
      indexSep: number,
      index = -1,
      count = 0;
    while ((indexSep = tail.indexOf('.')) != -1) {
      if (++count > 10) break;
      index += indexSep + 1;
      var base = path.substring(0, index);
      baseField = schema.path(base);
      if (baseField) {
        return baseField;
      }
      tail = path.substring(base.length + 1);
    }
  }

  private addProjection(options: IOptions, aggregate: IAggregateOptions, projection: any) {
    if (options.select || Object.keys(projection).length) {
      const select =
        typeof options.select === 'string'
          ? options.select.split(' ').reduce((p: any, c: string) => ((p[c] = 1), p), {})
          : Array.isArray(options.select)
          ? options.select.reduce((p: any, c: string) => ((p[c] = 1), p), {})
          : options.select;
      aggregate.projection = flat.unflatten(merge(select, projection || {}), {
        overwrite: true,
      });
    }
  }

  private addSearch(csearch: any[], search: any[] = [], conditions?: any): any {
    let asearch: any;
    if (conditions || search.length || csearch.length) {
      asearch = {$and: []};
      if (conditions) {
        asearch.$and.push(conditions);
      }
      if (search.length) {
        asearch.$and.push({$or: search});
      }
      if (csearch.length) {
        asearch.$and = asearch.$and.concat(csearch);
      }
    }
    return asearch;
  }

  private getSearch(options: IOptions, query: IQuery, column: IColumn, field: any): {search: any[]; csearch: any[]} {
    const search = [],
      csearch = [];
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
    return {search, csearch};
  }

  private getChunkSearch(search: string): string[] {
    let chunks: string[] = [];
    if (isArray(search)) {
      each(search, s => (chunks = concat(chunks, this.getChunkSearch(s))));
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
      .filter(s => trim(s) !== '');
  }

  private buildColumnSearch(
    options: IOptions,
    query: IQuery,
    column: IColumn,
    field: any,
    search: ISearch,
    global: boolean
  ): any {
    let instance = field.instance;
    if (options.handlers && options.handlers[instance]) {
      return options.handlers[instance](query, column, field, search, global);
    }
    if (this.config.handlers[instance]) {
      return this.config.handlers[instance](query, column, field, search, global);
    }
    if (search.value === null) {
      const columnSearch: any = {};
      return (columnSearch[column.data] = null);
    }
    if (instance === 'Mixed') {
      if (column.type) instance = column.type;
      else instance = this.tryDeductMixedFromValue(search.value);
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

  private tryDeductMixedFromValue(value: any): string {
    if (value instanceof Date) return 'Date';
    switch (typeof value) {
      case 'string':
        if (Types.ObjectId.isValid(value)) {
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

  private buildColumnSearchString(options: IOptions, column: IColumn, search: ISearch, global = false): any {
    this.debug(options.logger, 'buildColumnSearchString:', column.data, search);
    const values = global ? search.chunks : isArray(search.value) ? search.value : [search.value];
    const s: any[] = map(values, val => {
      if (typeof val === 'string' && search.regex) return {[column.data]: new RegExp(`${val}`, 'gi')};
      return {[column.data]: val};
    });
    return s.length > 0 ? (s.length > 1 ? {$or: s} : s[0]) : null;
  }

  private buildColumnSearchBoolean(options: IOptions, column: IColumn, search: ISearch, global = false): any {
    if (global) return;
    this.debug(options.logger, 'buildColumnSearchBoolean:', column.data, search);
    if (['string', 'boolean'].includes(typeof search.value)) {
      const value = typeof search.value === 'boolean' ? search.value : lowerCase(trim(search.value));
      if (value === 'true' || value === true) {
        return {[column.data]: true};
      } else if (value === 'false' || value === false) {
        return {[column.data]: false};
      }
    }
    this.warn(options.logger, `buildColumnSearchBoolean unmanaged search value '${search.value}'`);
  }

  private buildCompare(op: string, from: any, to: any) {
    switch (op) {
      case '>':
        return {$gt: from};
      case '>=':
        return {$gte: from};
      case '<':
        return {$lt: from};
      case '<=':
        return {$lte: from};
      case '<>':
        return {$gt: from, $lt: to};
      case '<=>':
        return {$gte: from, $lte: to};
      case '><=':
        return {$gt: from, $lte: to};
      case '>=<':
        return {$gte: from, $lt: to};
      default:
        return from;
    }
  }

  private buildColumnSearchNumber(options: IOptions, column: IColumn, search: ISearch, global = false): any {
    this.debug(options.logger, 'buildColumnSearchNumber:', column.data, search);
    const values = global ? search.chunks : isArray(search.value) ? search.value : [search.value];
    const s: any[] = [];
    each(values, val => {
      if (typeof val === 'string') {
        const match = val.match(/^(=|>|>=|<=|<|<>|<=>)?((?:[0-9]+[.])?[0-9]+)(?:,((?:[0-9]+[.])?[0-9]+))?$/);
        if (match) {
          const op = match.at(1);
          const from = new Number(match.at(2));
          const to = new Number(match.at(3));
          return s.push({[column.data]: this.buildCompare(op, from.valueOf(), to.valueOf())});
        }
        return this.warn(options.logger, `buildColumnSearchNumber unmanaged search value '${val}'`);
      }
      return s.push({[column.data]: val});
    });
    return s.length > 0 ? (s.length > 1 ? {$or: s} : s[0]) : null;
  }

  private buildColumnSearchDate(options: IOptions, column: IColumn, search: ISearch, global = false): any {
    this.debug(options.logger, 'buildColumnSearchDate:', column.data, search);
    const values = global ? search.chunks : isArray(search.value) ? search.value : [search.value];
    const s: any[] = [];
    each(values, val => {
      let op: string, from: Date, to: Date;
      if (typeof val === 'string') {
        const match = val.match(/^(=|>|>=|<=|<|<>|<=>|><=|>=<)?([0-9.\/-]+)(?:,([0-9.\/-]+))?$/);
        if (!match) return this.warn(options.logger, `buildColumnSearchDate unmanaged search value '${search.value}'`);
        op = match.at(1);
        const $2 = match.at(2);
        from = isNaN($2 as any) ? new Date($2) : new Date(parseInt($2));
        if (!(from instanceof Date) || isNaN(from.valueOf())) {
          return this.warn(options.logger, `buildColumnSearchDate invalid 'from' date format [YYYY/MM/DD] '${$2}'`);
        }
        const $3 = match.at(3);
        to = isNaN($3 as any) ? new Date($3) : new Date(parseInt($3));
        if ($3 !== '' && (!(to instanceof Date) || isNaN(to.valueOf()))) {
          return this.warn(options.logger, `buildColumnSearchDate invalid 'to' date format [YYYY/MM/DD] '${$3}'`);
        }
        return s.push({[column.data]: this.buildCompare(op, from, to)});
      }
      if (val?.from || val?.to) {
        op = val.op || '>=<';
        const fromDate = val?.from ? new Date(val.from) : null;
        if (fromDate && fromDate instanceof Date && !isNaN(fromDate.valueOf())) from = fromDate;
        const toDate = val?.to ? new Date(val.to) : null;
        if (toDate && toDate instanceof Date && !isNaN(toDate.valueOf())) to = toDate;
        return s.push({[column.data]: this.buildCompare(op, from, to)});
      }
      return this.warn(options.logger, `buildColumnSearchDate invalid value '${val}'`);
    });
    return s.length > 0 ? (s.length > 1 ? {$or: s} : s[0]) : null;
  }

  private buildColumnSearchObjectId(options: IOptions, column: IColumn, search: ISearch, global = false): any {
    if (global) return;
    this.debug(options.logger, 'buildColumnSearchObjectId:', column.data, search);
    const values = isArray(search.value) ? search.value : [search.value];
    const s: any[] = [];
    each(values, val => {
      if (Types.ObjectId.isValid(val)) return s.push({[column.data]: new Types.ObjectId(val)});
      this.warn(options.logger, `buildColumnSearchObjectId unmanaged search value '${search.value}'`);
    });
    return s.length > 0 ? (s.length > 1 ? {$or: s} : s[0]) : null;
  }

  private pagination(query: IQuery): IPagination {
    const start = this.parseNumber(query.start, 0);
    const length = this.parseNumber(query.length, undefined);
    return {
      start: isNaN(start) ? 0 : start,
      length: isNaN(length) ? undefined : length,
    };
  }

  private parseNumber(data: string | number, def?: number): number {
    if (isNil(data)) return def;
    if (typeof data === 'string') return parseInt(data, 10);
    if (typeof data === 'number') return data;
    return def;
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
    if (!!options.unwind?.length) {
      const aggregate = [];
      options.unwind.forEach($unwind => aggregate.push({$unwind}));
      aggregate.push({$match: options.conditions});
      // aggregate.push({ $group: { _id: null, count: { $sum: 1 } } });
      // return get(head(await this.model.aggregate(aggregate)), 'count');
      aggregate.push({$count: 'count'});
      return this.model.aggregate(aggregate).then(data => (data.length === 1 ? data[0].count : 0));
    }
    return this.model.countDocuments(options.conditions);
  }

  private async recordsFiltered(
    options: IOptions,
    aggregateOptions: IAggregateOptions,
    recordsTotal: number
  ): Promise<number> {
    if (!aggregateOptions.search && !aggregateOptions.afterPopulateSearch) {
      return Promise.resolve(recordsTotal);
    }
    const aggregate: any[] = [];
    (options.unwind || []).forEach($unwind => aggregate.push({$unwind}));
    if (aggregateOptions.search) aggregate.push({$match: aggregateOptions.search});
    aggregateOptions.populate.forEach(data => aggregate.push(data));
    if (aggregateOptions.afterPopulateSearch) aggregate.push({$match: aggregateOptions.afterPopulateSearch});
    aggregate.push({$count: 'count'});
    return this.model.aggregate(aggregate).then(data => (data.length === 1 ? data[0].count : 0));
  }

  private async data(options: IOptions, aggregateOptions: IAggregateOptions): Promise<any[]> {
    const aggregate: any[] = [];
    (options.unwind || []).forEach($unwind => aggregate.push({$unwind}));
    if (aggregateOptions.search) {
      aggregate.push({$match: aggregateOptions.search});
    }
    aggregateOptions.populate.forEach(data => aggregate.push(data));
    if (aggregateOptions.afterPopulateSearch) {
      aggregate.push({$match: aggregateOptions.afterPopulateSearch});
    }
    if (aggregateOptions.projection) {
      aggregate.push({$project: aggregateOptions.projection});
    }
    if (aggregateOptions.groupBy) {
      this.buildGroupBy(aggregateOptions).forEach(gb => aggregate.push(gb));
    }
    if (aggregateOptions.sort) {
      aggregate.push({$sort: aggregateOptions.sort});
    }
    if (aggregateOptions.pagination) {
      if (aggregateOptions.pagination.start) {
        aggregate.push({
          $skip: aggregateOptions.pagination.start * aggregateOptions.pagination.length,
        });
      }
      if (aggregateOptions.pagination.length) {
        aggregate.push({$limit: aggregateOptions.pagination.length});
      }
    }
    this.debug(options.logger, util.inspect(aggregate, {depth: null}));
    return this.model.aggregate(aggregate).allowDiskUse(true);
  }

  private buildGroupBy(aggregateOptions: IAggregateOptions): any[] {
    const aggregate: any[] = [];
    const _id: any = {};
    let id: any[] = [];
    aggregateOptions.groupBy.forEach((gb, i) => {
      set(_id, gb, `$${gb}`);
      id = id.concat({$toString: `$_id.${gb}`});
      const groupBy: any = {};
      if (i < aggregateOptions.groupBy.length - 1) {
        groupBy[`gb${i}`] = {
          id: {$concat: id},
          count: '$groupByCount',
          field: gb,
          value: `$_id.${gb}`,
        };
      } else {
        groupBy.groupBy = [];
        while (i--) {
          groupBy.groupBy.push(`$data.gb${i}`);
        }
        groupBy.groupBy.push({
          id: {$concat: id},
          count: '$groupByCount',
          field: gb,
          value: `$_id.${gb}`,
        });
      }
      aggregate.push({
        $group: {
          _id: clone(_id),
          groupByCount: {$sum: 1},
          data: {$push: '$$ROOT'},
        },
      });
      aggregate.push({$unwind: '$data'});
      aggregate.push({
        $replaceRoot: {newRoot: {$mergeObjects: ['$data', groupBy]}},
      });
    });
    return aggregate;
  }

  private debug(logger: ILogger, ...args: any) {
    const l = logger || this.logger;
    if (l && l.debug) {
      l.debug.apply(l, args);
    }
  }

  private warn(logger: ILogger, ...args: any) {
    const l = logger || this.logger;
    if (l && l.warn) {
      l.warn.apply(l, args);
    }
  }
}

export default DataTableModule;
