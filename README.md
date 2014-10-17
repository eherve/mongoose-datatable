# mongoose-dataTable

Server side dataTable request support for mongoose.

Support mongoose version >= 3.8.0

Support mongoDB version >= 2.4

## Install

    npm install mongoose-datatable

## Loading

    var DataTable = require('mongoose-datatable');
    
## Configuration

    DataTable.configure(options);
    
### Options

Configuration is not mandatory, the default options contains only the default handlers, for other types, an unknown type message is displayed on the console (see verbose option).

#### Debug

If the debug option is set to true (default false), the module will print the query from the dataTable and all the fields, conditions, sort and data retrieve.
This can be set also via the method <i>enableDebug(true)</i>.

#### Verbose

If the verbose option is set to true (default false), the module will print on the console when the condition builder has no handler for a field type.
In the default configuration, only the String condition builder exist, all other field type will trigger the log on the console of an unknown handler type.
This can be set also via the method <i>enableVerbose(true)</i>.

#### Logger

If the options contains a logger [key: logger, value: function(level, args)], the default logger <i>console.log</i> is override by it.
It allows to use an application specific logger.

#### Condition handlers

The condition handlers is an object that contains handlers (functions) with for key, mongoose schema field type name.
eg. String, Date, Boolean...
It is possible to declare a default handler (key: default) that will be used if no handler found for a specific type.
These handlers are called when the module try to build the condition on a field. They can return a condition object for the field to match ( eg.: { $in: [...] } ) and have for arguments:

* field

    The field for which the condition is build. The field has several properties that can be used to decide what kind of condition should be build.
Properties:

    * index

        The column index (from 0) of the field in the table.

    * path

        The path (name) of the field used to specify it on the client side.

    * searchable

        A boolean specifying if the field is searchable.

    * search

        An array containing the search value applied on the field (undefined if no search value apllied).

    * sortable

        A boolean specifying if the field is sortable.

    * sort

        An object containing the sort direction and the sort precedence (undefined if not sorted).

    * selectable

        A boolean specifying if the field is selectable.

    * type

        A string representing the type of the field.

    * ref

        A string representing the referenced model if the field is a RefId field.

    * refType

        A string representing the reference key type if the field is a RefId field.

    * arrayType

        A string representing the underlying type if the field is an array.

    * arrayPath

        A string representing the base path of an array of subdocuments.

    * base
  
        An array of base referenced model if the field is a field of a referenced model (containd a list of base if the field go through several referenced models).

* search

    An array containing the search strings or regular expressions for which the condition has to be built.

* options

    An object given to the dataTable method on the schema. This options object can be used to pass information to the condition handlers, like the locale if needed.

##### Default condition handlers

* String

    Match anywere in the string in case insensitive mode.

* Boolean

    Match <i>true</i> or <i>false</i> in case insensitive mode.
    
* Date

    The date search is composed in three parts, the <i>type</i> of the match, the <i>from</i> value and the <i>to</i> value.
    The <i>from</i> and <i>to</i> value are String dates and the <i>to</i> value is only needed when the <i>type</i> is "<>".
    The <i>type</i> can be "=" (same as no <i>type</i>), ">", "<" or "<>" meaning respectively equals, greater than, less than or between.

* Number

    The date search is composed in three parts, the <i>type</i> of the match, the <i>from</i> value and the <i>to</i> value.
    The <i>from</i> and <i>to</i> value are (String) numbers and the <i>to</i> value is only needed when the <i>type</i> is "<>".
    The <i>type</i> can be "=" (same as no <i>type</i>), ">", "<" or "<>" meaning respectively equals, greater than, less than or between.

##### eg.

<pre>
conditionHandlers: {
    String: StringHandler,
    Boolean: booleanHandler,
    Date: dateHandler,
    default: defaultHandler
}
</pre>
    
## Initialization

    var mongoose = require('mongoose');
    mongoose.plugin(DataTable.init);

## Fields

If a mongoose schema field is marked as not selectable with the option "_select: false_". Or if the option _dataTableSelect_ is present and set to false: "_dataTableSelect: false_". Then the field will not be selected even if it was requested by the dataTable client.

## Usage

The method <i>datatable </i> was added to all the schema as static method. The method has for parameters:

* dataTableQuery

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

<pre>
var MyModel = require('mongoose').model('MyModel');
MyModel.dataTable(dataTableQueryParams, options, function(err, data) {
    if(err) return manageError(err);
    send(data);
});
</pre>

## Chunk Search

If the dataTable on the client side is parametrized to send in the query the field <i>bChunkSearch</i> with for value 'true', the chunk search is activated.
The chunk search allows the user to specify in a the general search field specific field search.

### eg.

Add the condition for the value "test" on the username field.
<pre>@username:test</pre>

Add the condition for the value "Mr Arthur Dent" on the name field.
<pre>@name:"Mr Arthur Dent"</pre>

Add the condition for the value "test" or "admin" on the username field.
<pre>@username:test @username:admin</pre>

## Support

<a href="http://www.it-tweaks.com/" target="_blank">it-tweaks</a>

## Example with Node

<a href="http://intertherabbithole.wordpress.com/2014/01/24/using-jquery-datatables-with-nodejs-and-mongodb-using-mongoose-datatables/" target="_blank">Example using Node</a>

<a href="https://github.com/lepazmino/mongoose-datatable-demo" target="_blank">Demo Repository</a>
