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
      { mData: "num" }
    ],
    fnServerParams: function(aoData) {
      aoData.push({ name: "bChunkSearch", value: true }); }
  }).columnFilter(
    /*{
    aoColumns: [
      { type: "text" },
      { type: null }
    ]
  }*/);
});

