# mongoose-dataTable

Server side dataTable request support for mongoose.
In construction...

## Install

    npm install mongoose-datatable

## Loading

    var DataTable = require('mongoose-datatable');
    
## Configuration

    DataTable.configure(options);
    
### Options

#### Condition handlers

The condition handlers is an object that contains handlers (functions) with for key mongoose schema field type name.
eg. String, Date, Boolean...
These handlers are called when the module try to build the condition on a field and have for arguments:
* locale

    A string representing the local, eg.: us, fr, ...

* field

    The schema field for which the condition is build.

* search

    The search string sent by the data table on the client side regarding the specific field.

* regexp

    A boolean sent by the data table on the client side saying if the search ctring is a regular expression or not.

* options

    The object options specified in the condition options (see next section).

##### eg.
    <pre>conditionHandler: {
        String: buildStringCondition,
        Boolean: buildBooleanCondition,
        Date: buildDateCondition
    }</pre>
    
#### Condition Options

The condition options is an object containing options with for keys the mongoose schema field type name.
These options are passed to the condition handlers and help it for building the condition.

The prededfined handler for Boolean uses the options to determine the language:
    <pre>conditionOptions: {
        Boolean: {
            fr: { True: /^vrai$/i, False: /^faux$/i },
            default: { True: /^true$/i, False: /^false$/i }
        }
    }</pre>

## Initialization

    var mongoose = require('mongoose');
    mongoose.plugin(DataTable.init);
