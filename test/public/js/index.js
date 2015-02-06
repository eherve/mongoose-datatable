$(document).ready(function() {
  $('#datatable').dataTable({
    bFilter: true,
    bProcessing: true,
    bServerSide: true,
    sAjaxSource: "/data",
    aoColumns: [
      { mData: "str", sDefaultContent: "" },
      { mData: "date", sDefaultContent: "" },
      { sName: 'bool', sDefaultContent: "",
        mRender: function (data, type, full) {
          return full.bool;
        }
      },
      { mData: "num", sDefaultContent: "" },
      { mData: "select_false", sDefaultContent: "not fetched" },
      { mData: "datatable_select_false", sDefaultContent: "not fetched" },
      { mData: "type", sDefaultContent: "",
        mRender: function(data, type, full) {
          return data && data._id ? (data.id + " - " + data.description) : "";
        }
      },
      { mData: "types.type", sDefaultContent: "",
        mRender: function(data, type, full) {
          if (!full.types) { return ""; }
          var str = "";
          for (var i = 0; i < full.types.length; ++i) {
            str += full.types[i].type.id + " - " + full.types[i].type.description + " ";
          }
          return str;
        }
      },
      { mData: "elements.type", sDefaultContent: "", // Does not work
        mRender: function(data, type, full) {
          if (!full.elements) { return ""; }
          var str = "";
          for (var i = 0; i < full.elements.length; ++i) {
            str += full.elements[i].type.id + " - " + full.elements[i].type.description + " ";
          }
          return str;
        }
      }
    ],
    fnServerParams: function(aoData) {
      aoData.push({ name: "bChunkSearch", value: true }); }
  }).columnFilter();
});

