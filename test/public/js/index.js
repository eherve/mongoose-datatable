$(document).ready(function() {
  $('#datatable').dataTable({
    sDom: "<'row-fluid'<'span5'l>f>t<'row-fluid'<'span5'i>p>",
    bFilter: true,
    bServerSide: true,
    sAjaxSource: "/datatable",
    aoColumns: [
      { mData: "str" },
      { mData: "bool" }
    ]
  });
});

