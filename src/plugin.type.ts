/** @format */

import { FilterQuery } from 'mongoose';
import type { DatatableQuerySearchOperator } from './query.type.js';

export type DatatableLogger = {
  debug: (...args: any) => any;
  warn: (...args: any) => any;
};

export type DatatableSecurityOptions = {
  validatePaths?: boolean;
  allowObjectSearch?: boolean;
  allowedSearchOperators?: DatatableQuerySearchOperator[];
  allowedFacetOperators?: ('count' | 'sum' | 'avg')[];
  allowedProjectionOperators?: string[];
  allowedFacetInfoOperators?: string[];
  validateSelectableExpressionFields?: boolean;
  validateSelectableFacetFields?: boolean;
};

export type DatatableSchemaOptions = {
  logger?: DatatableLogger;
  security?: DatatableSecurityOptions;
};
export type DatatableOptions = DatatableSchemaOptions & {
  conditions?: FilterQuery<any>;
  unwind?: (string | { path: string; includeArrayIndex?: string; preserveNullAndEmptyArrays?: boolean })[];
  select?: string | string[] | { [key: string]: any };
};

export type DatatableData = {
  draw: string;
  recordsFiltered: number;
  data: any[];
  recordsTotal?: number;
  facets?: { [id: string]: { _id: any; value: any; info?: any }[] };
};

export type DatatableSort = { [property: string]: -1 | 1 };
