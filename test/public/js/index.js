$(document).ready(function() {
  $('#datatable').dataTable({
    bFilter: true,
    bProcessing: true,
    bServerSide: true,
    sAjaxSource: "/data",
    aoColumns: [
      { mData: "str" },
      { mData: "date" },
      { mData: "bool" }
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

