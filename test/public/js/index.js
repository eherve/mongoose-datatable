$(document).ready(function() {
  $('#datatable').dataTable({
    bFilter: true,
    bProcessing: true,
    bServerSide: true,
    sAjaxSource: "/data",
    aoColumns: [
      { mData: "str" },
      { mData: "date" },
      { sName: 'bool', sDefaultContent: "",
        mRender: function (data, type, full) {
          return full.bool;
        }
      },
      { mData: "num" },
      { mData: "select_false", sDefaultContent: "not fetched" },
      { mData: "datatable_select_false", sDefaultContent: "not fetched" }
    ],
    fnServerParams: function(aoData) {
      aoData.push({ name: "bChunkSearch", value: true }); }
  }).columnFilter();
});

