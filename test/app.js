var path = require('path');
var config = require('./config.json');

const mongoUrl = `mongodb://localhost:27017/test-datatable`;

// Database Initialization
var mongoose = require('mongoose');
var DataTable = require('../dist/datatable.js').default;
mongoose.connect(mongoUrl);
mongoose.set('debug', true);
// Add plugins
DataTable.configure();
mongoose.plugin(DataTable.init);
var db = mongoose.connection;
// Error handler
db.on('error', function (err) {
  console.error('DB ERROR:', err);
});
// Connection success handler
db.once('open', function () {
  console.log("Connection to database established !");

  // Load Model
  var Schema = mongoose.Schema;
  var subSchema = new Schema({
    id: {
      type: String,
      unique: true
    },
    description: String
  });
  var subModel = mongoose.model('SubTest', subSchema);
  var subElement = new Schema({
    test: String,
    type: {
      type: Schema.Types.ObjectId,
      ref: 'SubTest'
    },
    types: [{
      type: Schema.Types.ObjectId,
      ref: 'SubTest'
    }]
  });
  var schema = new Schema({
    str: String,
    date: Date,
    bool: Boolean,
    num: Number,
    select_false: {
      type: String,
      select: false
    },
    datatable_select_false: {
      type: String,
      dataTableSelect: false
    },
    type: {
      type: Schema.Types.ObjectId,
      ref: 'SubTest'
    },
    type2: {
      type: Schema.Types.ObjectId,
      ref: 'SubTest'
    },
    types: [subElement],
    messages: [{
      type: Schema.Types.ObjectId,
      ref: 'SubTest'
    }]
  });

  var model = mongoose.model('Test', schema);
  subModel.deleteMany({}, function () {
    model.deleteMany({}, function () {
      subModel.insertMany([{
          id: 'id0',
          description: 'desc0'
        },
        {
          id: 'id1',
          description: 'desc1'
        },
        {
          id: 'id2',
          description: 'desc2'
        },
        {
          id: 'id3',
          description: 'desc3'
        },
        {
          id: 'id4',
          description: 'desc4'
        }
      ]).then(subModels => {
        model.insertMany([{
          str: 'str',
          date: new Date(),
          bool: true,
          num: 42,
          select_false: 'select_false',
          datatable_select_false: 'datatable_select_false',
          type: subModels[0],
          type2: subModels[0],
          types: [{
            test: 'test',
            type: subModels[0],
            types: subModels
          }],
          messages: subModels
        }, {
          str: 'str2',
          date: new Date('1970/01/01'),
          bool: false,
          num: 27,
          select_false: 'select_false',
          datatable_select_false: 'datatable_select_false',
          type: subModels[1],
          type2: subModels[1],
          types: [{
            test: 'test2',
            type: subModels[1],
            types: [subModels[1], subModels[2]]
          }],
          messages: [subModels[1], subModels[2]]
        }]);
      });
    });
  });

  // Start application server
  var express = require('express');
  var app = express();
  // Views
  app.set('views', path.join(__dirname, './views'));
  app.set('view engine', 'jade');
  // Parser & basic options
  app.use(express.favicon());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.compress());
  app.use(express.static(path.join(__dirname, './public')));
  // Routes
  app.get('/', function (req, res) {
    res.render('index');
  });
  app.get('/data', function (req, res, next) {
    var options = {
      select: "bool"
    };
    model.dataTable(req.query, options).then(function (data) {
      console.log('send data...');
      res.send(data);
    }).catch(function (err) {
      return next(err);
    });
  });
  // Start listening
  app.listen(config.port);
  console.log("Application server listening on port:", config.port);
});