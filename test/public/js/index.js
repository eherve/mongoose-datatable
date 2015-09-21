$(document).ready(function() {
  $('#datatable').dataTable({
    processing: true,
    serverSide: true,
    ajax: { url: "data" },
    columns: [
      { data: "str", defaultContent: "" },
      { data: "date", defaultContent: "" },
      { data: 'bool', defaultContent: "",
        render: function (data, type, full) {
          return full.bool;
        }
      },
      { data: "num", defaultContent: "" },
      { data: "select_false", defaultContent: "not fetched" },
      { data: "datatable_select_false", defaultContent: "not fetched" },
      { data: "type", defaultContent: "" },
			{ data: "type.id", defaultContent: "" },
      { data: "types.types.id", defaultContent: "",
        render: function(data, type, full) {
					return JSON.stringify(full.types); }
      },
      { data: "messages.type.id", defaultContent: "", // Does not work
			 	render: function(data, type, full) {
			 		return JSON.stringify(full.messages); }
      }
    ],
    serverParams: function(data) { data.bChunkSearch = true; }
  });
  //.columnFilter();
});

