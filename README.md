# mongoose-datatable

Server-side datatable processing for Mongoose using aggregation pipelines.

## Requirements

- Node.js 18 or newer
- Mongoose 8.x (`mongoose` is a peer dependency)

## Install

```bash
npm install mongoose-datatable mongoose
```

## Setup

Register the plugin on a schema or globally:

```ts
import mongoose from 'mongoose';
import { datatablePlugin } from 'mongoose-datatable';

mongoose.plugin(datatablePlugin);
```

The plugin adds the static method `datatable(query, options?)` to Mongoose models. `dataTable` remains a deprecated compatibility alias.

## Request contract

The main query fields are:

- `draw`: request identifier returned unchanged in the response;
- `columns`: requested fields, projection expressions and search metadata;
- `order`: column indexes and `asc` / `desc` direction;
- `start`: page index;
- `length`: page size;
- `search`: optional global search;
- `facets`: optional indicator aggregations;
- `enableUnfilteredInfo`: when `true`, also calculate `recordsTotal`.

Pagination intentionally treats `start` as a page index and converts it to the MongoDB skip offset with `start * length`.

Supported search operators include `=`, `>`, `>=`, `≥`, `<`, `≤`, range operators, `$in` and `$nin`.

## Response contract

```ts
{
  draw,
  recordsFiltered,
  recordsTotal?,
  data,
  facets?,
}
```

`recordsTotal` is only calculated when `enableUnfilteredInfo === true`. `recordsFiltered` always represents the number of records after the datatable filters.

## Options

`model.datatable(query, options)` supports:

- `conditions`: base Mongoose conditions applied before datatable filtering;
- `select`: additional projection fields;
- `unwind`: aggregation unwind stages;
- `logger`: optional debug/warn logger.

Example:

```ts
const result = await Model.datatable(query, {
  conditions: { archived: false },
});
```

## Security hardening

Hardening is opt-in so existing consumers keep their current behavior. Configure it either when registering the plugin or for an individual `datatable()` call.

```ts
const result = await Model.datatable(query, {
  security: {
    validatePaths: true,
    allowObjectSearch: false,
    allowedSearchOperators: ['=', '>', '>=', '≥', '<', '≤', '<>', '≤≥', '><', '≥≤', '$in', '$nin'],
    allowedFacetOperators: ['count', 'sum', 'avg'],
    allowedProjectionOperators: ['$size', '$ifNull'],
    allowedFacetInfoOperators: ['$first'],
    validateSelectableExpressionFields: true,
    validateSelectableFacetFields: true,
  },
});
```

Available controls:

- `validatePaths`: reject unsafe MongoDB paths and reserved object keys such as `$where` or `__proto__`;
- `allowObjectSearch`: when `false`, reject raw object query values while keeping date-range `{ from, to }` values supported;
- `allowedSearchOperators`: allowlist search operators accepted from the request;
- `allowedFacetOperators`: allowlist `count`, `sum` and `avg`;
- `allowedProjectionOperators`: recursively allowlist MongoDB operators used by client-provided projection expressions;
- `allowedFacetInfoOperators`: recursively allowlist MongoDB operators used by facet `info`;
- `validateSelectableExpressionFields`: prevent expressions from reading fields disabled with `select: false`, `dataTableSelect: false` or `datatable.selectabled: false`;
- `validateSelectableFacetFields`: prevent facet keys and `sum` / `avg` source fields from reading fields disabled by the same schema selection rules.

If a security option is omitted, that specific restriction is not enabled. Schema-level and per-call security options are merged, with per-call values taking precedence.

## Schema field selection

A field is not exposed by the datatable when one of the following schema options disables selection:

```ts
select: false
```

or the historical options:

```ts
dataTableSelect: false
```

```ts
datatable: { selectabled: false }
```

## Facets

Indicator facets support `count`, `sum` and `avg` operations. A facet may also expose an `info` aggregation value used by the frontend to render richer indicators.

## Development

```bash
npm test
npm run build
```

The test command starts a temporary MongoDB 8 Docker container, runs the compiled Mocha suite with coverage, and cleans the container when it finishes.
