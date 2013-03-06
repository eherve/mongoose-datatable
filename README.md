# mongoose-dataTable

Server side dataTable request support for mongoose.

## Install

    npm install mongoose-datatable

## Loading

    var DataTable = require('mongoose-datatable');
    
## Configuration

    DataTable.configure(options);
    
### Options

Configuration is not mandatory, the default options contains only the String column handler, a like match is performed.
For other types, an unknown type message is displayed on the console (see verbose option).

#### Debug

If the debug option is set to true (default false), the module will print the query from the dataTable and all the fields, conditions, sort and data retrieve.

#### Verbose

If the verbose option is set to true (default false), the module will print on the console when the condition builder has no handler for a field type. In the default configuration, only the String condition builder exist, all other field type will trigger the loggin of an unknown handler type.

#### Condition handlers

The condition handlers is an object that contains handlers (functions) with for key mongoose schema field type name.
eg. String, Date, Boolean...
These handlers are called when the module try to build the condition on a field and have for arguments:

* locale

    A string representing the local, eg.: us, fr, ... (can be undefined if none given)

* field

    The schema field for which the condition is build. If the field is marked as not selectable in the schema (select: false) or if the option <i>dataTableSelect</i> on the field exist and is set to false (dataTableSelect: false) then the field will not be selected even if it was requested by the dataTable client.

* search

    The search string sent by the data table on the client side regarding the specific field.

* regexp

    A boolean sent by the data table on the client side saying if the search ctring is a regular expression or not.

* options

    The object options specified in the condition options (see next section).

##### eg.

<pre>
conditionHandler: {
    String: buildStringCondition,
    Boolean: buildBooleanCondition,
    Date: buildDateCondition,
    default: buildDefaultCondition
}
</pre>
    
## Initialization

    var mongoose = require('mongoose');
    mongoose.plugin(DataTable.init);

## Usage

The method <i>datatable </i> was added to all the schema as static method. The method has for parameters:

* dataTableQuery

    The query parameters send by the dataTable client

* locale

    The local of the request/connected client. This parameter is not mandatory and can be omitted.

* callback

    The callback called in case of error or when the data have been retrieved.

<pre>
var MyModel = require('mongoose').model('MyModel');
MyModel.dataTable(dataTableQueryParams, locale, function(err, data) {
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
