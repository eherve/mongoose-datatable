$(document).ready(function () {
  $('#datatable tfoot th').each(function () {
    var title = $('#example thead th').eq($(this).index()).text();
    $(this).html('<input type="text" placeholder="Search ' + title + '" />');
  });
  $('#datatable').DataTable({
    processing: true,
    serverSide: true,
    ajax: {
      url: "data"
    },
    columns: [{
        data: "str",
        defaultContent: ""
      },
      {
        data: "date",
        defaultContent: ""
      },
      {
        name: 'bool',
        defaultContent: "",
        render: function (data, type, full) {
          return full.bool;
        }
      },
      {
        data: "num",
        defaultContent: ""
      },
      {
        data: "select_false",
        defaultContent: "not fetched"
      },
      {
        data: "datatable_select_false",
        defaultContent: "not fetched"
      },
      {
        data: "type",
        defaultContent: ""
      },
      {
        data: "type2.id",
        defaultContent: ""
      },
      {
        data: "types.test",
        defaultContent: "",
        render: function (data, type, full) {
          return full.types.map(t => t.test);
        }
      },
      {
        data: "messages.id",
        defaultContent: "",
        render: function (data, type, full) {
          return full.messages.map(m => m.id)
        }
      },
      {
        data: "messages.description",
        defaultContent: "",
        render: function (data, type, full) {
          return full.messages.map(m => m.description)
        }
      }
    ],
    serverParams: function (data) {
      data.bChunkSearch = true;
    }
  }).columns().every(function () {
    var that = this;

    $('input', this.footer()).on('keyup change', function () {
      if (that.search() !== this.value) {
        that
          .search(this.value, true)
          .draw();
      }
    });
  });
});