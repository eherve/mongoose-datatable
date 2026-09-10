/** @format */

import * as lodash from 'lodash';
import { FilterQuery, Model, PipelineStage, Schema, SchemaType, Types } from 'mongoose';
import { inspect } from 'node:util';
import {
  DatatableData,
  DatatableOptions,
  DatatableSchemaOptions,
  DatatableSecurityOptions,
  DatatableSort,
} from './plugin.type.js';
import {
  DatatableQuery,
  DatatableQueryColumn,
  DatatableQueryFacet,
  DatatableQuerySearch,
  DatatableQuerySearchOperator,
} from './query.type.js';

type FieldInfo = {
  path: string;
  instance: string;
  ref?: string;
  selectabled?: boolean;
  array?: string[];
};

export function datatablePlugin(schema: Schema, options?: DatatableSchemaOptions): void {
  schema.statics.datatableOptions = () => options;
  schema.statics.datatable = function (query: DatatableQuery, opts?: DatatableOptions) {
    return datatable.call(this, query, mergeDatatableOptions(options, opts));
  };
  // TODO remove in later version
  schema.statics.dataTable = function (query: DatatableQuery, opts?: DatatableOptions) {
    console.warn('DEPRECATED use model.datatable');
    return datatable.call(this, query, mergeDatatableOptions(options, opts));
  };
}

function mergeDatatableOptions(
  schemaOptions: DatatableSchemaOptions | undefined,
  callOptions: DatatableOptions | undefined,
): DatatableOptions {
  const security =
    schemaOptions?.security || callOptions?.security ? { ...schemaOptions?.security, ...callOptions?.security } : undefined;
  return { ...schemaOptions, ...callOptions, security };
}

async function datatable(this: Model<any>, query: DatatableQuery, options?: DatatableOptions): Promise<DatatableData> {
  validateQuerySecurity(this, query, options);
  options?.logger?.debug('query', inspect(query, false, null, false));

  const pipeline = await buildPipeline(this, query, options);
  const dataPipeline: PipelineStage.FacetPipelineStage[] = [...pipeline];
  const $sort = buildSort(query);
  if ($sort) dataPipeline.push({ $sort });
  const pagination = buildPagination(query);
  dataPipeline.push({ $skip: pagination.start });
  if (pagination?.length) dataPipeline.push({ $limit: pagination.length });

  const $facet: Record<string, PipelineStage.FacetPipelineStage[]> = {
    recordsFiltered: [...pipeline, { $group: { _id: null, value: { $sum: 1 } } }],
    data: dataPipeline,
  };
  addUnfilteredInfoFacet($facet, query);
  lodash.each(query.facets, facet => ($facet[facet.id] = [...pipeline, ...getQueryFacet(facet)]));

  const $project: PipelineStage.Project['$project'] = {
    recordsFiltered: { $first: '$recordsFiltered.value' },
    data: '$data',
  };
  if (query.enableUnfilteredInfo === true) $project.recordsTotal = { $first: '$recordsTotal.value' };
  const aggregation: PipelineStage[] = [{ $facet }, { $project }];
  if (options?.conditions) aggregation.splice(0, 0, { $match: options.conditions });
  if (options?.unwind?.length) aggregation.splice(0, 0, ...options.unwind.map($unwind => ({ $unwind })));
  lodash.each(query.facets, facet => ($project[facet.id] = `$${facet.id}`));

  options?.logger?.debug('aggregation', inspect(aggregation, false, null, false));
  return buildData(query, (await this.aggregate(aggregation))[0]);
}

const RESERVED_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function validateQuerySecurity(model: Model<any>, query: DatatableQuery, options?: DatatableOptions): void {
  const security = options?.security;
  if (!security) return;

  validateSearchSecurity(query.search, 'search', security);

  query.columns.forEach((column, index) => {
    if (security.validatePaths) validateMongoPath(column.data, `columns[${index}].data`);
    validateSearchSecurity(column.search, `columns[${index}].search`, security);
    if (column.projection !== undefined) {
      validateExpressionSecurity(
        model,
        column.projection,
        security.allowedProjectionOperators,
        security,
        options,
        `columns[${index}].projection`,
      );
    }
  });

  query.facets?.forEach((facet, index) => {
    if (security.validatePaths) {
      validateFacetId(facet.id, `facets[${index}].id`);
      validateMongoPath(facet.property, `facets[${index}].property`);
      if (Array.isArray(facet.operator)) validateMongoPath(facet.operator[1], `facets[${index}].operator[1]`);
    }
    if (security.validateSelectableFacetFields) {
      validateSelectableExpressionField(model, facet.property, options, `facets[${index}].property`);
      if (Array.isArray(facet.operator)) {
        validateSelectableExpressionField(model, facet.operator[1], options, `facets[${index}].operator[1]`);
      }
    }

    const operator = Array.isArray(facet.operator) ? facet.operator[0] : facet.operator;
    if (security.allowedFacetOperators && !security.allowedFacetOperators.includes(operator)) {
      throwSecurityError(`facets[${index}].operator`, `operator ${operator} is not allowed`);
    }

    if (facet.info !== undefined) {
      validateExpressionSecurity(
        model,
        facet.info,
        security.allowedFacetInfoOperators,
        security,
        options,
        `facets[${index}].info`,
      );
    }
  });
}

function validateSearchSecurity(
  search: DatatableQuerySearch | undefined,
  context: string,
  security: DatatableSecurityOptions,
): void {
  if (!search) return;

  if (search.operator && security.allowedSearchOperators && !security.allowedSearchOperators.includes(search.operator)) {
    throwSecurityError(`${context}.operator`, `operator ${search.operator} is not allowed`);
  }

  if (security.allowObjectSearch !== false || !isRestrictedSearchObject(search.value)) return;
  throwSecurityError(`${context}.value`, 'raw object search values are not allowed');
}

function isRestrictedSearchObject(value: any): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value) || value instanceof Date || value instanceof Types.ObjectId) return false;
  return !isDateRangeSearchValue(value);
}

function isDateRangeSearchValue(value: any): boolean {
  const keys = Object.keys(value);
  if (!keys.length || keys.some(key => key !== 'from' && key !== 'to')) return false;
  return keys.every(key => {
    const item = value[key];
    return item === null || item === undefined || typeof item === 'string' || typeof item === 'number' || item instanceof Date;
  });
}

function validateExpressionSecurity(
  model: Model<any>,
  value: any,
  allowedOperators: string[] | undefined,
  security: DatatableSecurityOptions,
  options: DatatableOptions | undefined,
  context: string,
): void {
  if (typeof value === 'string' && value.startsWith('$') && !value.startsWith('$$')) {
    const path = value.substring(1);
    if (security.validatePaths) validateMongoPath(path, `${context} field reference`);
    if (security.validateSelectableExpressionFields) validateSelectableExpressionField(model, path, options, context);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateExpressionSecurity(model, item, allowedOperators, security, options, `${context}[${index}]`);
    });
    return;
  }

  if (!lodash.isPlainObject(value)) return;

  Object.entries(value).forEach(([key, nestedValue]) => {
    if (RESERVED_PATH_SEGMENTS.has(key) || key.includes('\0')) {
      throwSecurityError(context, `unsafe expression key ${key}`);
    }
    if (key.startsWith('$') && allowedOperators && !allowedOperators.includes(key)) {
      throwSecurityError(context, `operator ${key} is not allowed`);
    }
    validateExpressionSecurity(model, nestedValue, allowedOperators, security, options, `${context}.${key}`);
  });
}

function validateSelectableExpressionField(
  model: Model<any>,
  path: string,
  options: DatatableOptions | undefined,
  context: string,
): void {
  const fields = getSchemaFieldInfo(model, path, options);
  if (fields?.length && !isSelectable(fields)) {
    throwSecurityError(context, `field ${path} is not selectable`);
  }
}

function validateMongoPath(path: string, context: string): void {
  if (typeof path !== 'string' || !path.length) throwSecurityError(context, 'path is empty or invalid');
  const segments = path.split('.');
  const unsafe = segments.some(
    segment => !segment.length || segment.includes('$') || segment.includes('\0') || RESERVED_PATH_SEGMENTS.has(segment),
  );
  if (unsafe) throwSecurityError(context, `unsafe path ${path}`);
}

function validateFacetId(id: string, context: string): void {
  if (typeof id !== 'string' || !id.length || id.includes('.') || id.includes('$') || id.includes('\0') || RESERVED_PATH_SEGMENTS.has(id)) {
    throwSecurityError(context, `unsafe facet id ${id}`);
  }
}

function throwSecurityError(context: string, reason: string): never {
  throw new Error(`Datatable security validation failed for ${context}: ${reason}`);
}

function getQueryFacet(facet: DatatableQueryFacet): PipelineStage.Group[] {
  const operator = Array.isArray(facet.operator) ? facet.operator[0] : facet.operator;
  const property = Array.isArray(facet.operator) ? facet.operator[1] : null;
  const stage: PipelineStage.Group = { $group: { _id: `$${facet.property}` } };
  if (facet.info) stage.$group['info'] = facet.info;
  switch (operator) {
    case 'count':
      stage.$group['value'] = { $sum: 1 };
      break;
    case 'sum':
      stage.$group['value'] = { $sum: `$${property}` };
      break;
    case 'avg':
      stage.$group['value'] = { $avg: `$${property}` };
      break;
  }
  return [stage];
}

function addUnfilteredInfoFacet($facet: Record<string, PipelineStage.FacetPipelineStage[]>, query: DatatableQuery) {
  if (query.enableUnfilteredInfo !== true) return;
  const recordsTotalPipeline: PipelineStage.FacetPipelineStage[] = [{ $group: { _id: null, value: { $sum: 1 } } }];
  $facet.recordsTotal = recordsTotalPipeline;
}

function buildData(
  query: DatatableQuery,
  res: { recordsTotal: number; recordsFiltered: number; data: any[] } & {
    [facetId: string]: { _id: any; value: any }[];
  },
): DatatableData {
  const data: DatatableData = {
    draw: query.draw,
    recordsFiltered: res ? res.recordsFiltered : 0,
    data: res ? res.data : [],
  };
  if (query.enableUnfilteredInfo === true) data.recordsTotal = res ? res.recordsTotal : 0;
  if (query.facets?.length) {
    data.facets = {};
    lodash.each(query.facets, facet => (data.facets![facet.id] = res[facet.id]));
  }
  return data;
}

async function buildPipeline(
  model: Model<any>,
  query: DatatableQuery,
  options: DatatableOptions | undefined,
): Promise<PipelineStage.FacetPipelineStage[]> {
  const project: any = getOptionsProject(options);
  lodash.each(query.facets, facet => {
    project[facet.property] = 1;
    if (Array.isArray(facet.operator)) project[facet.operator[1]] = 1;
  });

  const $or: FilterQuery<any>[] = [];
  const $and: FilterQuery<any>[] = [];
  const lookups: PipelineStage.FacetPipelineStage[] = [];
  const populatedPaths = new Set<string>();
  const pipeline: PipelineStage.FacetPipelineStage[] = [];

  query.columns.forEach(column => {
    const path = column.data.trim();
    if (!path.length) return;

    const fields = getSchemaFieldInfo(model, path, options);
    if (fields?.length && !isSelectable(fields)) return;

    project[path] = column.projection ?? 1;

    const globalFilter = getSearch(column, query.search, fields?.length ? fields[fields.length - 1] : undefined);
    $or.push(...globalFilter);
    const columnFilter = getSearch(column, column.search, fields?.length ? fields[fields.length - 1] : undefined);

    if (fields?.length) {
      if (fields.length === 1) {
        $and?.push(...columnFilter);
        return;
      }

      fields.forEach((field, index) => {
        if (!index) return;
        const previousField = fields[index - 1];
        const from = getFieldRefModel(model, fields[index - 1], options)!.collection.name;
        const localField = fields.slice(0, index).reduce((pv, cv, i) => (!i ? cv.path : (pv += `.${cv.path}`)), '');
        const lookupKey = `${from}:${localField}`;
        if (populatedPaths.has(lookupKey)) return;
        populatedPaths.add(lookupKey);
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
            { $unwind: { path: `$${localField}`, preserveNullAndEmptyArrays: true } },
          );
          previousField.array.forEach((_, index) => {
            const path: string = previousField.array!.slice(0, previousField.array!.length - index).join('.');
            const data = {};
            lodash.set(data, path, '$data');
            lookups.push(
              { $group: { _id: '$_id', root: { $first: '$$ROOT' }, data: { $push: `$${path}` } } },
              { $replaceRoot: { newRoot: { $mergeObjects: ['$root', data] } } },
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
  const consolidatedProject = consolidateProject(project);
  if (!Object.keys(consolidatedProject).length) consolidatedProject._id = 1;
  pipeline.push({ $project: consolidatedProject });

  return pipeline;
}

function consolidateProject(project: any): any {
  const consolidated = {};
  Object.keys(project)
    .sort((p1, p2) => p1.length - p2.length)
    .forEach(key => {
      if (!Object.keys(consolidated).find(k => key.startsWith(`${k}.`))) {
        consolidated[key] = project[key];
        Object.keys(consolidated).forEach(k => {
          if (k.startsWith(`${key}.`)) delete consolidated[k];
        });
      }
    });
  return consolidated;
}

function getOptionsProject(options: DatatableOptions | undefined): { [field: string]: any } {
  if (!options?.select) return {};
  return (
    typeof options.select === 'string' ? options.select.split(' ').reduce((p: any, c: string) => ((p[c] = 1), p), {})
    : Array.isArray(options.select) ? options.select.reduce((p: any, c: string) => ((p[c] = 1), p), {})
    : options.select
  );
}

function getSearch(column: DatatableQueryColumn, search?: DatatableQuerySearch, field?: FieldInfo): FilterQuery<any>[] {
  if (column.searchable === false) return [];
  if (!search) return [];
  const filters: FilterQuery<any>[] = [];
  const type = column.type?.toLowerCase() ?? field?.instance?.toLowerCase();
  switch (type) {
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
    default:
      const filter = buildFilter(column.data, search.operator, search.value, search.regex);
      if (filter) filters.push(filter);
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
  } else if (typeof search.value === 'object')
    value = search.value; // TODO allow disable for security reason
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
  } else if (typeof search.value === 'object')
    value = search.value; // TODO allow disable for security reason
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
  else if (typeof search.value === 'object')
    value = search.value; // TODO allow disable for security reason
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
    value =
      stringValue === 'true' ? true
      : stringValue === 'false' ? false
      : undefined;
  } else if (typeof search.value === 'boolean') value = search.value;
  else if (typeof search.value === 'object')
    value = search.value; // TODO allow disable for security reason
  else if (search.value === null) value = null;

  const filter = buildFilter(column.data, search.operator, value);
  if (filter) filters.push(filter);

  return filters;
}

function getStringSearch(column: DatatableQueryColumn, search: DatatableQuerySearch): FilterQuery<any>[] {
  const filters: FilterQuery<any>[] = [];
  let value: any;
  if (typeof search.value === 'string') value = search.value;
  else if (typeof search.value === 'object')
    value = search.value; // TODO allow disable for security reason
  else if (search.value === null) value = null;
  const filter = buildFilter(column.data, search.operator, value, search.regex);
  if (filter) filters.push(filter);
  return filters;
}

function buildFilter(
  property: string,
  op: DatatableQuerySearchOperator | undefined,
  value: any,
  regex: boolean = false,
): FilterQuery<any> | undefined {
  if (value === undefined) return;
  if (value === null) return { [property]: null };
  const value1 = Array.isArray(value) && value.length >= 1 ? value[0] : value;
  const value2 = Array.isArray(value) && value.length >= 2 ? value[1] : undefined;
  switch (op) {
    case '>':
      return { [property]: { $gt: value1 } };
    case '>=':
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
      if (regex) return { [property]: new RegExp(value1, 'gi') };
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
  options: DatatableOptions | undefined,
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
    selectabled:
      field.options?.select !== false &&
      field.options?.dataTableSelect !== false &&
      field.options?.datatable?.selectabled !== false,
    array,
  };
}

function getFieldRefModel(
  model: Model<any>,
  field: FieldInfo,
  options: DatatableOptions | undefined,
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
  if (isNaN(start)) start = 0;

  let length: number | undefined = undefined;
  if (typeof query.length === 'string') length = parseInt(query.length);
  else if (typeof query.length === 'number') length = query.length;
  if (length !== undefined && isNaN(length)) length = undefined;

  if (length !== undefined) start = start * length;

  return { start, length };
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
