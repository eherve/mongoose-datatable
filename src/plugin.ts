/** @format */

import { FilterQuery, Model, PipelineStage, Schema, SchemaType, Types } from 'mongoose';
import { inspect } from 'util';
import { DatatableData, DatatableOptions, DatatableSchemaOptions, DatatableSort } from './plugin.type.js';
import {
  DatatableQuery,
  DatatableQueryColumn,
  DatatableQuerySearch,
  DatatableQuerySearchOperator,
} from './query.type.js';
import * as lodash from 'lodash';

type FieldInfo = {
  path: string;
  instance: string;
  ref?: string;
  selectabled?: boolean;
  array?: string[];
};

export function datatablePlugin(schema: Schema, options?: DatatableSchemaOptions) {
  schema.statics.datatableOptions = () => options;
  schema.statics.datatable = datatable;
  // TODO remove in later version
  schema.statics.dataTable = function (query: DatatableQuery, options?: DatatableOptions) {
    console.warn('DEPRECATED use model.datatable');
    return datatable.call(this, query, options);
  };
}

async function datatable(this: Model<any>, query: DatatableQuery, options?: DatatableOptions): Promise<DatatableData> {
  const pipeline = await buildPipeline(this, query, options);

  const recordsTotalPipeline: PipelineStage.FacetPipelineStage[] = [{ $group: { _id: null, value: { $sum: 1 } } }];
  const recordsFilteredPipeline: PipelineStage.FacetPipelineStage[] = [
    ...pipeline,
    { $group: { _id: null, value: { $sum: 1 } } },
  ];

  const dataPipeline: PipelineStage.FacetPipelineStage[] = [...pipeline];
  const $sort = buildSort(query);
  if ($sort) dataPipeline.push({ $sort });
  const pagination = buildPagination(query);
  dataPipeline.push({ $skip: pagination.start });
  if (pagination?.length) dataPipeline.push({ $limit: pagination.length });

  options?.logger?.debug(inspect(dataPipeline, false, null, true));

  const aggregation: PipelineStage[] = [
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
  ];
  if (options?.unwind?.length) aggregation.splice(0, 0, ...options.unwind.map($unwind => ({ $unwind })));
  if (options?.conditions) aggregation.splice(0, 0, { $match: options.conditions });

  const res: { recordsTotal: number; recordsFiltered: number; data: any[] }[] = await this.aggregate(aggregation);

  return {
    draw: query.draw,
    recordsTotal: res ? res[0].recordsTotal : 0,
    recordsFiltered: res ? res[0].recordsFiltered : 0,
    data: res ? res[0].data : [],
  };
}

async function buildPipeline(
  model: Model<any>,
  query: DatatableQuery,
  options: DatatableOptions | undefined
): Promise<PipelineStage.FacetPipelineStage[]> {
  const project: any = getOptionsProject(options);
  const $or: FilterQuery<any>[] = [];
  const $and: FilterQuery<any>[] = [];
  const lookups: PipelineStage.FacetPipelineStage[] = [];
  const pipeline: PipelineStage.FacetPipelineStage[] = [];

  query.columns.forEach(column => {
    const path = column.data.trim();
    if (!path.length) return;
    project[path] = 1;
    const fields = getSchemaFieldInfo(model, path, options);
    const globalFilter = getSearch(column, query.search, fields?.length ? fields[fields.length - 1] : undefined);
    $or.push(...globalFilter);
    const columnFilter = getSearch(column, column.search, fields?.length ? fields[fields.length - 1] : undefined);

    if (fields?.length) {
      if (!isSelectable(fields)) return;
      if (fields.length === 1) {
        $and?.push(...columnFilter);
        return;
      }

      fields.forEach((field, index) => {
        if (!index) return;
        const previousField = fields[index - 1];
        const from = getFieldRefModel(model, fields[index - 1], options)!.collection.name;
        const localField = fields.slice(0, index).reduce((pv, cv, i) => (!i ? cv.path : (pv += `.${cv.path}`)), '');
        if (!previousField.array?.length) {
          lookups.push({ $lookup: { from, localField, foreignField: '_id', as: localField } });
          if (previousField.instance !== 'Array') {
            lookups.push({ $unwind: { path: `$${localField}`, preserveNullAndEmptyArrays: true } });
          }
        } else {
          previousField.array.forEach((_, index) => {
            const path = previousField.array!.slice(0, index + 1).join('.');
            lookups.push({ $unwind: `$${path}` });
          });
          lookups.push(
            { $lookup: { from, localField, foreignField: '_id', as: localField } },
            { $unwind: { path: `$${localField}`, preserveNullAndEmptyArrays: true } }
          );
          previousField.array.forEach((_, index) => {
            const path: string = previousField.array!.slice(0, previousField.array!.length - index).join('.');
            const data = {};
            lodash.set(data, path, '$data');
            lookups.push(
              { $group: { _id: '$_id', root: { $first: '$$ROOT' }, data: { $push: `$${path}` } } },
              { $replaceRoot: { newRoot: { $mergeObjects: ['$root', data] } } }
            );
          });
        }
      });
      if (columnFilter.length) lookups.push({ $match: { $and: columnFilter } });
    }
  });

  if ($and.length) pipeline.push({ $match: { $and } });
  pipeline.push(...lookups);
  if ($or.length) pipeline.push({ $match: { $or } });
  pipeline.push({ $project: consolidateProject(project) });

  return pipeline;
}

function consolidateProject(project: any): any {
  const consolidated = {};
  Object.keys(project)
    .sort((p1, p2) => p1.length - p2.length)
    .forEach(key => {
      if (!Object.keys(consolidated).find(k => key.startsWith(k))) {
        consolidated[key] = project[key];
      }
    });
  return consolidated;
}

function getOptionsProject(options: DatatableOptions | undefined): { [field: string]: any } {
  if (!options?.select) return {};
  return typeof options.select === 'string'
    ? options.select.split(' ').reduce((p: any, c: string) => ((p[c] = 1), p), {})
    : Array.isArray(options.select)
    ? options.select.reduce((p: any, c: string) => ((p[c] = 1), p), {})
    : options.select;
}

function getSearch(column: DatatableQueryColumn, search?: DatatableQuerySearch, field?: FieldInfo): FilterQuery<any>[] {
  if (column.searchable === false) return [];
  if (!search) return [];
  const filters: FilterQuery<any>[] = [];
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

function getObjectIdSearch(column: DatatableQueryColumn, search: DatatableQuerySearch): FilterQuery<any>[] {
  const filters: FilterQuery<any>[] = [];
  let value: any;
  if (typeof search.value === 'string' && Types.ObjectId.isValid(search.value)) {
    value = Types.ObjectId.createFromHexString(search.value);
  } else if (typeof search.value === 'number' && Types.ObjectId.isValid(search.value)) {
    value = Types.ObjectId.createFromTime(search.value);
  } else if (typeof search.value === 'object') value = search.value; // TODO allow disable for security reason
  else if (search.value === null) value = null;
  const filter = buildFilter(column.data, search.operator, value);
  if (filter) filters.push(filter);
  return filters;
}

function getDateSearch(column: DatatableQueryColumn, search: DatatableQuerySearch): FilterQuery<any>[] {
  const filters: FilterQuery<any>[] = [];
  let value: any;
  if (typeof search.value === 'string') {
    value = search.value
      .split(';')
      .map(value => new Date(value))
      .filter(value => !isNaN(value.valueOf()));
  } else if (typeof search.value === 'number') value = new Date(search.value);
  else if (search.value instanceof Date) value = search.value;
  else if (search.value?.from || search.value?.to) {
    const from = search.value?.from ? new Date(search.value.from) : undefined;
    if (from && !isNaN(from.valueOf())) value = [...(value || []), from];
    const to = search.value?.to ? new Date(search.value.to) : undefined;
    if (to && !isNaN(to.valueOf())) value = [...(value || []), to];
  } else if (typeof search.value === 'object') value = search.value; // TODO allow disable for security reason
  else if (search.value === null) value = null;
  const filter = buildFilter(column.data, search.operator, value);
  if (filter) filters.push(filter);
  return filters;
}

function getNumberSearch(column: DatatableQueryColumn, search: DatatableQuerySearch): FilterQuery<any>[] {
  const filters: FilterQuery<any>[] = [];
  let value: any;
  if (typeof search.value === 'string') {
    value = search.value
      .split(';')
      .map(value => parseFloat(value))
      .filter(value => !isNaN(value));
  } else if (typeof search.value === 'number') value = search.value;
  else if (typeof search.value === 'object') value = search.value; // TODO allow disable for security reason
  else if (search.value === null) value = null;
  const filter = buildFilter(column.data, search.operator, value);
  if (filter) filters.push(filter);
  return filters;
}

function getBooleanSearch(column: DatatableQueryColumn, search: DatatableQuerySearch): FilterQuery<any>[] {
  const filters: FilterQuery<any>[] = [];
  let value: any;
  if (typeof search.value === 'string') {
    const stringValue = search.value.trim().toLowerCase();
    value = stringValue === 'true' ? true : stringValue === 'false' ? false : undefined;
  } else if (typeof search.value === 'boolean') value = search.value;
  else if (typeof search.value === 'object') value = search.value; // TODO allow disable for security reason
  else if (search.value === null) value = null;

  const filter = buildFilter(column.data, search.operator, value);
  if (filter) filters.push(filter);

  return filters;
}

function getStringSearch(column: DatatableQueryColumn, search: DatatableQuerySearch): FilterQuery<any>[] {
  const filters: FilterQuery<any>[] = [];
  let value: any;
  if (typeof search.value === 'string') value = search.value;
  else if (typeof search.value === 'object') value = search.value; // TODO allow disable for security reason
  else if (search.value === null) value = null;
  const filter = buildFilter(column.data, search.operator, value, search.regex);
  if (filter) filters.push(filter);
  return filters;
}

function buildFilter(
  property: string,
  op: DatatableQuerySearchOperator | undefined,
  value: any,
  regex: boolean = false
): FilterQuery<any> | undefined {
  if (value === undefined) return;
  if (value === null) return { [property]: null };
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
      if (regex) return { [property]: new RegExp(value1) };
      return { [property]: value1 };
  }
}

function isSelectable(fields: FieldInfo[]): boolean {
  for (let field of fields) {
    if (field.selectabled === false) return false;
  }
  return true;
}

function getSchemaFieldInfo(
  model: Model<any>,
  path: string,
  options: DatatableOptions | undefined
): FieldInfo[] | undefined {
  const field = model.schema.path(path);
  if (field) return [buildFieldInfo(path, field)];
  const fields: FieldInfo[] = [];
  let base = path.substring(0, path.lastIndexOf('.'));
  path = path.substring(base.length + 1);
  while (path.length) {
    const baseField = model.schema.path(base);
    if (baseField) {
      const info = buildFieldInfo(base, baseField);
      fields.push(info);
      const pathModel = getFieldRefModel(model, info, options);
      if (!pathModel) return;
      const pathFields = getSchemaFieldInfo(pathModel, path, options);
      if (!pathFields?.length) return;
      fields.push(...pathFields);
      break;
    } else {
      base = path.substring(0, path.lastIndexOf('.'));
      path = path.substring(base.length + 1);
    }
  }
  return fields;
}

function buildFieldInfo(path: string, field: SchemaType): FieldInfo {
  let array: string[] = [];
  let schemaType: any =
    field.instance === 'Array' ? (field as any).$embeddedSchemaType : (field as any).$parentSchemaDocArray;
  while (schemaType) {
    array.splice(0, 0, schemaType.path);
    schemaType = schemaType.$parentSchemaDocArray;
  }
  let ref = field.options?.ref;
  if (field.instance === 'Array') ref = field.options?.type[0]?.ref;
  return {
    path,
    instance: field.instance,
    ref,
    selectabled: field.options?.datatable?.selectabled,
    array,
  };
}

function getFieldRefModel(
  model: Model<any>,
  field: FieldInfo,
  options: DatatableOptions | undefined
): Model<any> | undefined {
  try {
    if (field.ref) return model.db.model(field.ref);
  } catch (err) {
    options?.logger?.warn(err);
  }
}

function buildPagination(query: DatatableQuery): { start: number; length?: number } {
  let start: number = 0;
  if (typeof query.start === 'string') start = parseInt(query.start);
  else if (typeof query.start === 'number') start = query.start;
  else start = 0;

  let length: number | undefined = undefined;
  if (typeof query.length === 'string') length = parseInt(query.length);
  else if (typeof query.length === 'number') length = query.length;

  return {
    start: !isNaN(start) ? start : 0,
    length: length !== undefined && !isNaN(length) ? length : undefined,
  };
}

function buildSort(query: DatatableQuery): DatatableSort | undefined {
  if (!query.order?.length) return;
  const sort: DatatableSort = {};
  query.order.forEach(order => {
    const column = query.columns[order.column];
    if (!column) return;
    sort[column.data] = order.dir == 'asc' ? 1 : -1;
  });
  if (!!Object.keys(sort).length) return sort;
  console.warn(`invalid order provided`);
}
