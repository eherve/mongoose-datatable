/** @format */

export type DatatableQuerySearchOperator = '>' | '>=' | '≥' | '<' | '≤' | '<>' | '≤≥' | '><' | '≥≤' | '$in' | '$nin';

export type DatatableQuerySearch = {
  value: any;
  regex?: boolean;
  operator?: DatatableQuerySearchOperator;
};

export type DatatableQueryColumnType = 'string' | 'boolean' | 'number' | 'date' | 'objectid';

export type DatatableQueryColumn = {
  data: string;
  projection?:any;

  searchable?: boolean;
  search?: DatatableQuerySearch;
  type?: DatatableQueryColumnType;
};

export type DatatableQueryOrder = {
  column: number;
  dir: 'asc' | 'desc';
};

export type DatatableQueryFacetOperator = 'count' | ['sum', string] | ['avg', string];
export type DatatableQueryFacet = {
  id: string;
  kind: 'indicator';
  property: string;
  operator: DatatableQueryFacetOperator;
};

export type DatatableQuery = {
  draw: string;
  columns: DatatableQueryColumn[];
  order?: DatatableQueryOrder[];
  start?: number | string; // TODO remove string type
  length?: number | string; // TODO remove string type
  search?: DatatableQuerySearch;

  enableUnfilteredInfo?: boolean;
  facets?: DatatableQueryFacet[];
};
