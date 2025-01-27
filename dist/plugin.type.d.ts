export type DatatableLogger = {
    debug: (...args: any) => any;
    warn: (...args: any) => any;
};
export type DatatableSchemaOptions = {
    logger?: DatatableLogger;
};
export type DatatableOptions = DatatableSchemaOptions & {};
export type DatatableData = {
    draw: string;
    recordsTotal: number;
    recordsFiltered: number;
    data: any[];
};
export type DatatableSort = {
    [property: string]: -1 | 1;
};
