import chai = require('chai');
import chaiAsPromised = require('chai-as-promised');
import Datatable, { IQuery } from './datatable';
import { clone } from 'lodash';

const mongoUrl = `mongodb://localhost:4242/test-datatable`;
const mongoose = require('mongoose');
mongoose.plugin(Datatable.init);
const subSchema = new mongoose.Schema({ code: String, description: String });
const subModel = mongoose.model('SubTest', subSchema);
const schema = new mongoose.Schema({ first_name: String, last_name: String, activated: Boolean, position: Number, start_date: Date, sub_schema: { type: 'ObjectId', ref: 'SubTest' } });
const model = mongoose.model('Test', schema);

chai.use(chaiAsPromised);
const expect = chai.expect;

const query: IQuery = {
  draw: '2',
  columns: [
    { data: '_id', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'first_name', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'last_name', name: null, searchable: false, orderable: true, search: { value: null, regex: false } },
    { data: 'activated', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'position', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'start_date', name: null, searchable: true, orderable: false, search: { value: null, regex: false } },
    { data: 'sub_schema.code', name: null, searchable: true, orderable: false, search: { value: null, regex: false } }
  ],
  order: [{ column: 3, dir: 'asc' }],
  start: '0',
  length: '10',
  search: { value: null, regex: false }
};

const sQuery: IQuery = {
  draw: '2',
  columns: [
    { data: 'first_name', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'last_name', name: null, searchable: false, orderable: true, search: { value: null, regex: false } },
    { data: 'activated', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'position', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'start_date', name: null, searchable: true, orderable: false, search: { value: null, regex: false } },
    { data: 'sub_schema.code', name: null, searchable: true, orderable: false, search: { value: null, regex: false } }
  ],
  order: [{ column: 3, dir: 'asc' }],
  start: '0',
  length: '10',
  search: { value: 'Clement', regex: false }
};

const firstNmeQuery: IQuery = {
  draw: '2',
  columns: [
    { data: 'first_name', name: null, searchable: true, orderable: true, search: { value: '/Clement|Saanvi/', regex: false } },
    { data: 'last_name', name: null, searchable: false, orderable: true, search: { value: null, regex: false } },
    { data: 'activated', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'position', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'start_date', name: null, searchable: true, orderable: false, search: { value: null, regex: false } },
    { data: 'sub_schema.code', name: null, searchable: true, orderable: false, search: { value: null, regex: false } }
  ],
  order: [{ column: 3, dir: 'asc' }],
  start: '0',
  length: '10',
  search: { value: null, regex: false }
};

const activatedQuery: IQuery = {
  draw: '2',
  columns: [
    { data: 'first_name', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'last_name', name: null, searchable: false, orderable: true, search: { value: null, regex: false } },
    { data: 'activated', name: null, searchable: true, orderable: true, search: { value: 'true', regex: false } },
    { data: 'position', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'start_date', name: null, searchable: true, orderable: false, search: { value: null, regex: false } },
    { data: 'sub_schema.code', name: null, searchable: true, orderable: false, search: { value: null, regex: false } }
  ],
  order: [{ column: 3, dir: 'asc' }],
  start: '0',
  length: '10',
  search: { value: null, regex: false }
};

const posQuery: IQuery = {
  draw: '2',
  columns: [
    { data: 'first_name', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'last_name', name: null, searchable: false, orderable: true, search: { value: null, regex: false } },
    { data: 'activated', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'position', name: null, searchable: true, orderable: true, search: { value: '>2', regex: false } },
    { data: 'start_date', name: null, searchable: true, orderable: false, search: { value: null, regex: false } },
    { data: 'sub_schema.code', name: null, searchable: true, orderable: false, search: { value: null, regex: false } }
  ],
  order: [{ column: 3, dir: 'asc' }],
  start: '0',
  length: '10',
  search: { value: null, regex: false }
};

const dateQuery: IQuery = {
  draw: '2',
  columns: [
    { data: 'first_name', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'last_name', name: null, searchable: false, orderable: true, search: { value: null, regex: false } },
    { data: 'activated', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'position', name: null, searchable: true, orderable: true, search: { value: null, regex: false } },
    { data: 'start_date', name: null, searchable: true, orderable: false, search: { value: '<=>2019.01.02,2019.01.04', regex: false } },
    { data: 'sub_schema.code', name: null, searchable: true, orderable: false, search: { value: null, regex: false } }
  ],
  order: [{ column: 3, dir: 'asc' }],
  start: '0',
  length: '10',
  search: { value: null, regex: false }
};

const nologger = { debug: () => { }, info: () => { }, warn: () => { }, error: () => { } } as any;

describe('Datatable Module', () => {

  describe('configure', () => {

    it(`should exists`, () => {
      expect(Datatable.configure)
        .to.not.be.undefined;
    });

    it(`should set config`, () => {
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

  describe('dataTable', () => {

    let tests: any[];

    before(done => {
      Datatable.configure({ logger: nologger });
      mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
      mongoose.connection.on('error', done);
      mongoose.connection.on('open', () => seed().then((res) => {
        tests = res;
        done();
      }).catch(done));
    });

    it('should list all data', async () => {
      return model.dataTable(query).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(5);
      });
    });

    it('should find entry with field containing "Clement"', async () => {
      return model.dataTable(sQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(1);
        expect(data.data[0]).to.have.property('first_name', 'Clement');
      });
    });

    it('should find entry with first_name matching "/Clement|Saanvi/"', async () => {
      return model.dataTable(firstNmeQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(2);
        expect(data.data[0]).to.have.property('first_name', 'Clement');
        expect(data.data[1]).to.have.property('first_name', 'Saanvi');
      });
    });

    it('should find entry with _id matching', async () => {
      const q = clone(query);
      q.columns[0].search = { value: tests[0]._id.toString(), regex: false };
      return model.dataTable(q).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(1);
        expect(data.data[0]._id.equals(tests[0]._id)).to.be.true;
      });
    });

    it('should find entry with activated as true', async () => {
      return model.dataTable(activatedQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(3);
        expect(data.data[0]).to.have.property('activated', true);
        expect(data.data[1]).to.have.property('activated', true);
        expect(data.data[2]).to.have.property('activated', true);
      });
    });

    it('should find entries with position greater than 2', async () => {
      return model.dataTable(posQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(3);
        expect(data.data[0]).to.have.property('position', 3);
        expect(data.data[1]).to.have.property('position', 4);
        expect(data.data[2]).to.have.property('position', 5);
      });
    });

    it('should find entries with start_date between 2019.01.02 and 2019.01.04', async () => {
      return model.dataTable(dateQuery, { logger: nologger }).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(3);
        expect((data.data[0].start_date as Date).toDateString()).to.be.equals((new Date('2019.01.02').toDateString()));
        expect((data.data[1].start_date as Date).toDateString()).to.be.equals((new Date('2019.01.03').toDateString()));
        expect((data.data[2].start_date as Date).toDateString()).to.be.equals((new Date('2019.01.04').toDateString()));
      });
    });

    after(() => {
      mongoose.connection.close();
    });

  });

});


async function seed(): Promise<any[]> {
  const subdata = await subModel.insertMany([
    { code: 'FR01', description: 'code FR01' },
    { code: 'FR02', description: 'code FR02' },
    { code: 'FR03', description: 'code FR03' },
    { code: 'FR04', description: 'code FR04' },
    { code: 'FR05', description: 'code FR05' },
  ]);
  const res = await model.insertMany([
    { first_name: 'Clement', last_name: 'Sadler', activated: true, position: 1, start_date: new Date('2019.01.01'), sub_schema: subdata[0] },
    { first_name: 'Saanvi', last_name: 'Meyers', activated: false, position: 2, start_date: new Date('2019.01.02'), sub_schema: subdata[1] },
    { first_name: 'Antonia', last_name: 'Watts', activated: true, position: 3, start_date: new Date('2019.01.03'), sub_schema: subdata[2] },
    { first_name: 'Eman', last_name: 'Watts', activated: false, position: 4, start_date: new Date('2019.01.04'), sub_schema: subdata[3] },
    { first_name: 'Eman', last_name: 'Partridge', activated: true, position: 5, start_date: new Date('2019.01.05'), sub_schema: subdata[4] }
  ]);
  return res;
};
