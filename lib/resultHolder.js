var util = require('util');

// Query fields
var QUERY_ECHO = 'draw'; // 'sEcho';

// Data fields
var DATA_ECHO = 'draw'; // 'sEcho';
var DATA_TOTAL_RECORDS = 'recordsTotal';
var DATA_TOTAL_FILTERED_RECORDS = 'recordsFiltered';
var DATA_RECORDS = 'data'; // 'aaData';

module.exports = function ResultHolder(query) {
  var data = {};
  data[DATA_ECHO] = query[QUERY_ECHO];

  Object.defineProperty(this, "totalRecords", {
    enumerable: true,
    get: function() { return data[DATA_TOTAL_RECORDS]; },
    set: function(value) { data[DATA_TOTAL_RECORDS] = value; }
  });

  Object.defineProperty(this, "totalFilteredRecords", {
    enumerable: true,
    get: function() { return data[DATA_TOTAL_FILTERD_RECORDS]; },
    set: function(value) { data[DATA_TOTAL_FILTERED_RECORDS] = value; }
  });

  Object.defineProperty(this, "records", {
    enumerable: true,
    get: function() { return data[DATA_RECORDS]; },
    set: function(value) { data[DATA_RECORDS] = value; }
  });

  Object.defineProperty(this, "data", {
    writable: false,
    enumerable: true,
    value: data
  });

  Object.defineProperty(this, "toString", {
    enumerable: false,
    value: function() {
      return util.inspect(this.data, false, null, true);
    }
  });

}
