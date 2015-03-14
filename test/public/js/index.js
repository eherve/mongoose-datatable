$(document).ready(function() {
  $('#datatable').dataTable({
    processing: true,
    serverSide: true,
    ajax: { url: "data" },
    columns: [
      { data: "str", defaultContent: "" },
      { data: "date", defaultContent: "" },
      { name: 'bool', defaultContent: "",
        render: function (data, type, full) {
          return full.bool;
        }
      },
      { data: "num", defaultContent: "" },
      { data: "select_false", defaultContent: "not fetched" },
      { data: "datatable_select_false", defaultContent: "not fetched" },
      { data: "type", defaultContent: "",
        render: function(data, type, full) {
          return data && data._id ? (data.id + " - " + data.description) : "";
        }
      },
      { data: "types.type", defaultContent: "",
        render: function(data, type, full) {
          if (!full.types) { return ""; }
          var str = "";
          for (var i = 0; i < full.types.length; ++i) {
            str += full.types[i].type.id + " - " + full.types[i].type.description + " ";
          }
          return str;
        }
      },
      { data: "elements.type", defaultContent: "", // Does not work
        render: function(data, type, full) {
          if (!full.elements) { return ""; }
          var str = "";
          for (var i = 0; i < full.elements.length; ++i) {
            str += full.elements[i].type.id + " - " + full.elements[i].type.description + " ";
          }
          return str;
        }
      }
    ],
    serverParams: function(data) { data.bChunkSearch = true; }
  });
  //.columnFilter();
});

