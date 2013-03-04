# mongoose-dataTable

Server side dataTable request support for mongoose.

## Install

    npm install mongoose-datatable

## Loading

    var DataTable = require('mongoose-datatable');
    
## Configuration

    DataTable.configure(options);
    
### Options

Configuration is not mandatory, the default options are: For String column, a like match is performed and for other types, an unknown type message is displayed o the console.

#### Condition handlers

The condition handlers is an object that contains handlers (functions) with for key mongoose schema field type name.
eg. String, Date, Boolean...
These handlers are called when the module try to build the condition on a field and have for arguments:

* locale

    A string representing the local, eg.: us, fr, ... (can be undefined if none given)

* field

    The schema field for which the condition is build.

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
MyModel.dataTable(dataTableQueryParams, function(err, data) {
    if(err) return manageError(err);
    send(data);
});
</pre>
    
