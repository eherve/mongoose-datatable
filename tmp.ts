import * as Promise from 'bluebird';
import loggerService from '../services/logger.service';
import { Types, Model } from 'mongoose';
import * as escapeStringRegexp from 'escape-string-regexp';

export interface ITableOption {
  fields?: string | string[];
  search?: string;
  searchFields?: string | string[];
  pageIndex?: number;
  pageSize?: number;
  sort?: string;
  dir?: string;
  filters?: string | any;
  facets: string | string[];
  reduce?: any;
}

export class TableData {

  public total: number;
  public data: any[];
  public facets?: { [key: string]: { _id: string, count: number }[] };

  constructor(table: { total: number, data: any[] }, facets: any) {
    this.total = table ? table.total : 0
    this.data = table ? table.data : [];
    this.facets = facets || [];
  }

}

class MongoTools {

  public buildProjection(fields: string | string[]): any {
    if (fields) {
      if (typeof fields === 'string') { fields = fields.split(','); }
      return fields.reduce((r, c) => {
        const p = c.split(':');
        r[p.length === 2 ? p[1] : c] = p.length === 2 ? `$${p[0]}` : 1;
        return r;
      }, {} as any);
    }
    return undefined;
  }

  public addSearch(options: any, search: string, fields: string | string[]): any {
    if (!search || search.trim().length === 0 || !fields || fields.length === 0) { return options; }
    options.$or = [];
    let sregexp: RegExp;
    if (search.match(/^\/.*\/$/)) {
      try {
        sregexp = new RegExp(`${search.substring(1, search.length - 1)}`, 'gi');
      } catch (err) { sregexp = new RegExp(`${escapeStringRegexp(search)}`, 'gi'); }
    } else {
      sregexp = new RegExp(`${escapeStringRegexp(search)}`, 'gi');
    }
    (typeof fields === 'string' ? fields.split(',') : fields).forEach(field => {
      const s: any = {};
      s[field] = { $regex: sregexp };
      options.$or.push(s);
    });
    return options;
  }

  public addFilters(options: any, filters: string | any): any {
    if (!filters || (typeof filters === 'string' && filters.trim().length === 0)) { return options; }
    const obj = typeof filters !== 'string' ? filters : JSON.parse(filters, (k, v) =>
      /DATE\[.*\]/.test(v) ? new Date(v.substring(5, v.length - 1)) :
        /OBJECTID\[.*\]/.test(v) ? new Types.ObjectId(v.substring(9, v.length - 1)) :
          Array.isArray(v) ? (v.length > 0 ? { $in: v } : undefined) :
            v);
    for (const prop in obj) { if (obj.hasOwnProperty(prop)) { options[prop] = obj[prop]; } }
    return options;
  }

  public addPagination(aggregate: any[], pageIndex?: number, pageSize?: number): any[] {
    if (pageSize !== undefined) {
      if (pageIndex !== undefined) { aggregate.push({ $skip: pageIndex * pageSize }); }
      aggregate.push({ $limit: pageSize });
    }
    return aggregate;
  }

  public table(model: Model<any>, tableOptions: ITableOption, unwind?: string, projection?: any): Promise<TableData> {
    const sortOptions: any = {};
    if (tableOptions.sort && tableOptions.sort.length > 0) {
      sortOptions[tableOptions.sort] = tableOptions.dir === 'asc' ? 1 : -1;
    } else { sortOptions._id = 1 }
    const options: any = {};
    if (tableOptions.searchFields) {
      this.addSearch(options, tableOptions.search, tableOptions.searchFields);
    }
    try { this.addFilters(options, tableOptions.filters); } catch (err) { return Promise.reject(err); }
    const aggregate: any[] = [];
    if (tableOptions.reduce || unwind) {
      const match: any = { $and: [] };
      if (tableOptions.reduce) { match.$and.push(tableOptions.reduce); }
      if (unwind) {
        const munwind: any = {};
        munwind[unwind] = { $exists: 1, $ne: null, $not: { $size: 0 } };
        match.$and.push(munwind);
      }
      aggregate.push({ $match: match });
    }
    if (tableOptions.fields || projection) {
      aggregate.push({ $project: tableOptions.fields ? this.buildProjection(tableOptions.fields) : projection });
    }
    if (unwind) { aggregate.push({ $unwind: `$${unwind}` }); }
    if (options) { aggregate.push({ $match: options }); }
    aggregate.push({ $sort: sortOptions });
    if (unwind) {
      aggregate.push({ $replaceRoot: { newRoot: { $mergeObjects: ['$$ROOT', `$${unwind}`] } } });
      const project: any = {};
      project[unwind] = 0;
      aggregate.push({ $project: project });
    }
    aggregate.push({ $group: { _id: null, data: { $push: '$$ROOT' }, total: { $sum: 1 } } });
    aggregate.push({ $unwind: '$data' });
    this.addPagination(aggregate, tableOptions.pageIndex, tableOptions.pageSize);
    aggregate.push({ $group: { _id: null, data: { $push: '$data' }, total: { $first: '$total' } } });
    return Promise.all([
      model.aggregate(aggregate).allowDiskUse(true).exec(),
      tableOptions.facets ? this.facet(model, tableOptions, options, unwind) : Promise.resolve(null)
    ]).then((d: any[][]) =>
      new TableData(d && d.length >= 1 && d[0] ? d[0][0] : null, d && d.length >= 2 && d[1] ? d[1][0] : null));
  }

  public facet(model: Model<any>, tableOptions: ITableOption, options: any, unwind?: string): Promise<any[]> {
    const aggregate: any[] = []
    if (unwind) {
      const match: any = {};
      match[unwind] = { $exists: 1, $ne: null, $not: { $size: 0 } };
      aggregate.push({ $match: match });
      aggregate.push({ $unwind: `$${unwind}` });
    }
    if (options) { aggregate.push({ $match: options }); }
    const facet: any = {};
    (typeof tableOptions.facets === 'string' ? tableOptions.facets.split(',') : tableOptions.facets)
      .forEach(f => facet[f] = [{ $sortByCount: `$${f}` }]);
    aggregate.push({ $facet: facet });
    return model.aggregate(aggregate).exec();
  }

}

export default new MongoTools();