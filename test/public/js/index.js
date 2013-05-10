$(document).ready(function() {
  $('#datatable').dataTable({
    bFilter: true,
    bProcessing: true,
    bServerSide: true,
    sAjaxSource: "/data",
    aoColumns: [
      { mData: "str" },
      { mData: "bool" }
    ]
  }).columnFilter(
    /*{
    aoColumns: [
      { type: "text" },
      { type: null }
    ]
  }*/);
});

