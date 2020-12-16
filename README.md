# mongoose-dataTable

*Version 3.0.0*

Server side dataTable request support for mongoose.

Support mongoose version >= 3.8.0

Support mongoDB version >= 2.4

Support DataTable >= 1.10

## New Functionnalities

* Population of ref sub-document or ref sub-documents are done with $lookup in aggregation
* Filter and sort are possible on populated sub-documents
* add regex search on string fields

## Migration

### v1.x.x

```javascript
var DataTable = require('mongoose-datatable');
var options = { debug: true, verbose: true };
DataTable.configure(options);
mongoose.plugin(Datatable.init);

...

model.dataTable(query, {}, function(err, data) {
  if (err) { return manageError(err); }
  console.log('send data...');
  res.send(data);
});
```

### v2.x.x [typescript]

```typescript
import Datatable from './datatable';
const nologger = { debug: () => { }, info: () => { }, warn: () => { }, error: () => { } } as any;
var options = { logger: nologger };
Datatable.configure(options);
mongoose.plugin(Datatable.init);

...

model.dataTable(query)
  .then((data: any) =>  res.send(data))
  .catch(err => manageError(err))
```

## Install

    npm install mongoose-datatable

## Loading

    import Datatable from './datatable';
    
## Configuration

    DataTable.configure(options);
    
### Options

Configuration is not mandatory, the default options contains only the default handlers, for other types, an unknown type message is displayed on the console.

#### Logger

*option key: logger*
If the options contains a logger [key: logger]: ILogger, the default logger <i>console</i> is override by it.
It allows to use an application specific logger.
```typescript
interface ILogger {
  debug: (...data: any) => void;
  info: (...data: any) => void;
  warn: (...data: any) => void;
  error: (...data: any) => void;
}
```

#### Condition handlers

*option key: handlers*
The condition handlers is an object that contains handlers (functions) with for key, mongoose schema field type name.
eg. String, Date, Boolean...
It is possible to declare a default handler (key: default) that will be used if no handler found for a specific type.
To not do any search the function should return null.
These handlers are called when the module try to build the condition on a field. They can return a condition object for the field to match ( eg.: { $in: [...] } ) and have for arguments:

* options: IOptions

    The options passed to the model database call.

* query: IQuery

    The query passed to the model database call.

* column: IColumn

    The jquery column data.

* field: any

    The field against the condition is build. This is the mongoose FieldType.

* search: ISearch

    The search data to build the condition.

* global: boolean

    If true, the search condition is from jquery global search; if false, it's a specific search on thie field.

##### Default condition handlers

* String
  * global\
    Match anywere in the string in case insensitive mode.

  * specific\
    If the search string is a regex (match: */^\/.*\/$/*) then the regex is used\
    Else match anywere in the string in case insensitive mode.

* Boolean
  * global\
    No search done

  * specific\
    Match <i>true</i> or <i>false</i> in case insensitive mode.
    
* Date
  * global\
    No search done

  * specific\
    The date search is composed in three parts, the <i>type</i> of the match, the <i>from</i> value and the <i>to</i> value.
    The <i>from</i> and <i>to</i> value are String dates and the <i>to</i> value is only needed when the <i>type</i> is "<>" or "<=>".
    The <i>type</i> can be "=" (same as no <i>type</i>), ">", ">=", "<", "<=", "<>", "<=>" meaning respectively equals, greater than, greater or equal than, less than, less or equal than, between and between equals.

* Number
  * global\
    No search done

  * specific\
    The number search is composed in three parts, the <i>type</i> of the match, the <i>from</i> value and the <i>to</i> value.
    The <i>from</i> and <i>to</i> value are number and the <i>to</i> value is only needed when the <i>type</i> is "<>" or "<=>".
    The <i>type</i> can be "=" (same as no <i>type</i>), ">", ">=", "<", "<=", "<>", "<=>" meaning respectively equals, greater than, greater or equal than, less than, less or equal than, between and between equals.

##### eg.

<pre>
options: {
  handlers: {
    String: StringHandler,
    Boolean: booleanHandler,
    Date: dateHandler,
    default: defaultHandler
  }
}
</pre>
    
## Initialization

``` typescript
const mongoose = require('mongoose');
mongoose.plugin(DataTable.init);
```

## Fields

If a mongoose schema field is marked as not selectable with the option "_select: false_". Or if the option _dataTableSelect_ is present and set to false: "_dataTableSelect: false_". Then the field will not be selected even if it was requested by the dataTable client.

## Usage

The method <i>datatable </i> was added to all the schema as static method. The method has for parameters:

* query

    The query parameters send by the dataTable client

* options

    Options pass to the condition handlers. OPTIONAL parameter.

    * handlers

        Handlers can be given to override the overall behavior of condition builder handlers.
        The field options.handlers is an object with for keys either a field type (like String, Boolean,,,) or a field path (like username, name.firstName) and for values, functions like the condition handler functions.

    * conditions

        Conditions is an object as the mongoose find conditions. This conditions filter the dataTable data returned and the counts, it is applied as the first conjunction condition.

    * select

        Select is an object, a string or an array as the mongoose query select argument. The select is applied on the find query that return the displayed entities.

* callback

    The callback called in case of error or when the data have been retrieved.

``` typescript
model.dataTable(query, options)
  .then((data: any) =>  res.send(data))
  .catch(err => manageError(err))
```

## Chunk Search

```diff
- Not implemented yet
```

## Change log]

* v2.1.0
  * null search value are now intepreted as search for null value on field