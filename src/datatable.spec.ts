import chai = require('chai');
import chaiAsPromised = require('chai-as-promised');
import Datatable, { IQuery } from './datatable';

chai.use(chaiAsPromised);
const expect = chai.expect;

const data: IQuery = {
  'draw': 2,
  'columns': [{
    'data': 'first_name',
    'name': null,
    'searchable': true,
    'orderable': true,
    'search': {
      'value': 'test',
      'regex': false
    }
  },
  {
    'data': 'last_name',
    'name': null,
    'searchable': false,
    'orderable': true,
    'search': {
      'value': null,
      'regex': false
    }
  },
  {
    'data': 'position',
    'name': null,
    'searchable': true,
    'orderable': true,
    'search': {
      'value': null,
      'regex': false
    }
  },
  {
    'data': 'start_date',
    'name': null,
    'searchable': true,
    'orderable': false,
    'search': {
      'value': null,
      'regex': false
    }
  }
  ],
  'order': [{
    'column': 0,
    'dir': 'asc'
  },{
    'column': 1,
    'dir': 'desc'
  },{
    'column': 3,
    'dir': 'desc'
  }],
  'start': 10,
  'length': 10,
  'search': {
    'value': 'test global search',
    'regex': false
  }
};

describe('Datatable Module', function () {
  describe('configure', function () {
    it(`should exists`, function () {
      expect(Datatable.configure)
        .to.not.be.undefined;
    });
    it(`should return config`, function () {
      expect(Datatable.config)
        .to.be.a('object');
    });
    it(`should set config`, function () {
      let debug = '';
      const logger = { debug: (...data: any[]) => debug += data.join(', ') } as any;
      const config = Datatable.configure({ logger });
      expect(config)
        .to.have.property('logger', logger);
      expect(() => config.logger.debug('test'))
        .to.not.throw();
      expect(debug)
        .to.equals('test');
    });
  });
  describe('dataTable', function () {
    Datatable.dataTable(data);
  });
});
