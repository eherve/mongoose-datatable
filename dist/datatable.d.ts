/** @format */
import { Schema } from 'mongoose';
interface ILogger {
    debug: (...data: any) => void;
    warn: (...data: any) => void;
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
export type SearchOperator = '>' | '>=' | '≥' | '<' | '≤' | '<>' | '≤≥' | '><' | '≥≤';
export interface ISearch {
    value: any;
    regex?: boolean;
    operator?: SearchOperator;
    chunks?: string[];
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
    handlers?: {
        [type: string]: HandlerType;
    };
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
    handlers?: {
        [type: string]: HandlerType;
    };
    processUnknownFields?: boolean;
}
export declare class DataTableModule {
    private schema;
    static CONFIG: IConfig;
    private _config;
    private get config();
    private get logger();
    private model;
    static configure(config?: IConfig): IConfig;
    static init(schema: any, config?: IConfig): void;
    constructor(schema: Schema);
    private dataTable;
    private buildSort;
    private updateAggregateOptions;
    private getModel;
    private addFieldRef;
    private addFieldArrayRef;
    private fieldNotFound;
    private fetchField;
    private getField;
    private addProjection;
    private addSearch;
    private getSearch;
    private getChunkSearch;
    private buildColumnSearch;
    private tryDeductMixedFromValue;
    private buildColumnSearchString;
    private buildColumnSearchBoolean;
    private buildCompare;
    private buildColumnSearchNumber;
    private getNumberStringValues;
    private buildColumnSearchDate;
    private getDateStringValues;
    private buildColumnSearchObjectId;
    private pagination;
    private parseNumber;
    private isTrue;
    private isFalse;
    private isSelectable;
    private recordsTotal;
    private recordsFiltered;
    private data;
    private buildGroupBy;
    private debug;
    private warn;
}
export default DataTableModule;
