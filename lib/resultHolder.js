var util = require('util');

// Query fields
var QUERY_ECHO = 'sEcho';

// Data fields
var DATA_ECHO = 'sEcho';
var DATA_TOTAL_RECORDS = 'iTotalRecords';
var DATA_TOTAL_FILTERED_RECORDS = 'iTotalDisplayRecords';
var DATA_RECORDS = 'aaData';

module.exports = function(query) {
  var data = {};
  data[DATA_ECHO] = query[QUERY_ECHO];
  return {
    get totalRecords() {
      return data[DATA_TOTAL_RECORDS];
    },
    set totalRecords(count) {
      data[DATA_TOTAL_RECORDS] = count;
    },
    get totalFilteredRecords() {
      return data[DATA_TOTAL_FILTERD_RECORDS];
    },
    set totalFilteredRecords(count) {
      data[DATA_TOTAL_FILTERED_RECORDS] = count;
    },
    get records() {
      return data[DATA_RECORDS];
    },
    set records(records) {
      data[DATA_RECORDS] = records;
    },
    get data() {
      return data;
    },
    toString: function() {
      return util.inspect(this.data, false, null, true);
    }
  }
}
