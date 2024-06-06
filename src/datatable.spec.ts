/** @format */

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import {clone} from 'lodash';
import * as mongoose from 'mongoose';
import DataTableModule, {IData, IOptions, IQuery} from './datatable.js';

const mongoUrl = `mongodb://localhost:4242/test-datatable`;
mongoose.plugin(DataTableModule.init);
const subSchema = new mongoose.Schema({
  code: String,
  description: String,
});
const subModel = mongoose.model('SubTest', subSchema);
const embededSchema = new mongoose.Schema({
  code: String,
  sub_schema: {type: mongoose.Types.ObjectId, ref: 'SubTest'},
});
const schema = new mongoose.Schema({
  first_name: String,
  last_name: String,
  activated: Boolean,
  position: Number,
  start_date: Date,
  sub_schema: {type: mongoose.Types.ObjectId, ref: 'SubTest'},
  sub_schema_unknown: {type: mongoose.Types.ObjectId, ref: 'SubSchemaUnknown'},
  embeded_schema: {type: embededSchema},
  array: [
    {
      code: String,
      embeded_schema: {type: mongoose.Types.ObjectId, ref: 'SubTest'},
    },
  ],
  embeded_schema_array: [{type: mongoose.Types.ObjectId, ref: 'SubTest'}],
});

interface IModel extends mongoose.Model<any> {
  dataTable: (query: IQuery, options?: IOptions) => Promise<IData>;
}
const model: IModel = mongoose.model('Test', schema) as any;

chai.use(chaiAsPromised);
const expect = chai.expect;

const logger = {debug: () => {}, warn: () => {}};

let records: any[];

const query: IQuery = {
  draw: '2',
  columns: [
    {data: '_id', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'first_name', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'last_name', searchable: false, orderable: true, search: {value: null, regex: false}},
    {data: 'activated', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'position', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'start_date', searchable: true, orderable: false, search: {value: null, regex: false}},
    {data: 'sub_schema.code', searchable: true, orderable: false, search: {value: null, regex: false}},
    {data: 'embeded_schema', searchable: true, orderable: false, search: {value: null, regex: false}},
    {data: 'array', searchable: true, orderable: false, search: {value: null, regex: false}},
  ],
  order: [{column: 3, dir: 'asc'}],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

const sQuery: IQuery = {
  draw: '2',
  columns: [
    {data: 'first_name', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'last_name', searchable: false, orderable: true, search: {value: null, regex: false}},
    {data: 'activated', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'position', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'start_date', searchable: true, orderable: false, search: {value: null, regex: false}},
    {data: 'sub_schema.code', searchable: true, orderable: false, search: {value: null, regex: false}},
  ],
  order: [{column: 3, dir: 'asc'}],
  start: '0',
  length: '10',
  search: {value: 'Clement', regex: false},
};

const firstNameClementQuery: IQuery = {
  draw: '2',
  columns: [
    {
      data: 'first_name',
      searchable: true,
      orderable: true,
      search: {value: 'Clement'},
    },
    {data: 'last_name', searchable: false, orderable: true, search: {value: null, regex: false}},
    {data: 'activated', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'position', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'start_date', searchable: true, orderable: false, search: {value: null, regex: false}},
    {data: 'sub_schema.code', searchable: true, orderable: false, search: {value: null, regex: false}},
  ],
  order: [{column: 3, dir: 'asc'}],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

const firstNameQuery: IQuery = {
  draw: '2',
  columns: [
    {
      data: 'first_name',
      searchable: true,
      orderable: true,
      search: {value: 'Clement|Saanvi', regex: true},
    },
    {data: 'last_name', searchable: false, orderable: true, search: {value: null, regex: false}},
    {data: 'activated', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'position', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'start_date', searchable: true, orderable: false, search: {value: null, regex: false}},
    {data: 'sub_schema.code', searchable: true, orderable: false, search: {value: null, regex: false}},
  ],
  order: [{column: 3, dir: 'asc'}],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

const firstNameFilterQuery: IQuery = {
  draw: '2',
  columns: [
    {
      data: 'first_name',
      searchable: true,
      orderable: true,
      search: {value: {$in: ['Clement', 'Saanvi']}, regex: false},
    },
    {data: 'last_name', searchable: false, orderable: true, search: {value: null, regex: false}},
    {data: 'activated', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'position', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'start_date', searchable: true, orderable: false, search: {value: null, regex: false}},
    {data: 'sub_schema.code', searchable: true, orderable: false, search: {value: null, regex: false}},
  ],
  order: [{column: 3, dir: 'asc'}],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

const firstNameArrayQuery: IQuery = {
  draw: '2',
  columns: [
    {
      data: 'first_name',
      searchable: true,
      orderable: true,
      search: {value: ['Clement', 'Saanvi'], regex: false},
    },
    {data: 'last_name', searchable: false, orderable: true, search: {value: null, regex: false}},
    {data: 'activated', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'position', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'start_date', searchable: true, orderable: false, search: {value: null, regex: false}},
    {data: 'sub_schema.code', searchable: true, orderable: false, search: {value: null, regex: false}},
  ],
  order: [{column: 3, dir: 'asc'}],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

const activatedQuery: IQuery = {
  draw: '2',
  columns: [
    {data: 'first_name', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'last_name', searchable: false, orderable: true, search: {value: null, regex: false}},
    {data: 'activated', searchable: true, orderable: true, search: {value: 'true', regex: false}},
    {data: 'position', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'start_date', searchable: true, orderable: false, search: {value: null, regex: false}},
    {data: 'sub_schema.code', searchable: true, orderable: false, search: {value: null, regex: false}},
  ],
  order: [{column: 3, dir: 'asc'}],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

const posEq2Query: IQuery = {
  draw: '2',
  columns: [
    {data: 'first_name', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'last_name', searchable: false, orderable: true, search: {value: null, regex: false}},
    {data: 'activated', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'position', searchable: true, orderable: true, search: {value: 2, regex: false}},
    {data: 'start_date', searchable: true, orderable: false, search: {value: null, regex: false}},
    {data: 'sub_schema.code', searchable: true, orderable: false, search: {value: null, regex: false}},
  ],
  order: [{column: 3, dir: 'asc'}],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

const posGt2Query: IQuery = {
  draw: '2',
  columns: [
    {data: 'first_name', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'last_name', searchable: false, orderable: true, search: {value: null, regex: false}},
    {data: 'activated', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'position', searchable: true, orderable: true, search: {value: '>2', regex: false}},
    {data: 'start_date', searchable: true, orderable: false, search: {value: null, regex: false}},
    {data: 'sub_schema.code', searchable: true, orderable: false, search: {value: null, regex: false}},
  ],
  order: [{column: 3, dir: 'asc'}],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

const dateStringQuery: IQuery = {
  draw: '2',
  columns: [
    {data: 'first_name', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'last_name', searchable: false, orderable: true, search: {value: null, regex: false}},
    {data: 'activated', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'position', searchable: true, orderable: true, search: {value: null, regex: false}},
    {
      data: 'start_date',

      searchable: true,
      orderable: false,
      search: {value: '<=>2019-01-02,2019-01-04', regex: false},
    },
    {data: 'sub_schema.code', searchable: true, orderable: false, search: {value: null, regex: false}},
  ],
  order: [{column: 4, dir: 'asc'}],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

const dateQuery: IQuery = {
  draw: '2',
  columns: [
    {data: 'first_name', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'last_name', searchable: false, orderable: true, search: {value: null, regex: false}},
    {data: 'activated', searchable: true, orderable: true, search: {value: null, regex: false}},
    {data: 'position', searchable: true, orderable: true, search: {value: null, regex: false}},
    {
      data: 'start_date',

      searchable: true,
      orderable: false,
      search: {value: {from: '2019-01-02', to: new Date('2019.01.04'), op: '>=<'}},
    },
    {data: 'sub_schema.code', searchable: true, orderable: false, search: {value: null, regex: false}},
  ],
  order: [{column: 4, dir: 'asc'}],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

const embededSchemaQuery: IQuery = {
  draw: '2',
  columns: [
    {
      data: 'embeded_schema.code',

      searchable: true,
      orderable: true,
      search: {value: 'EMB01', regex: false},
    },
  ],
  order: [],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

const embededSubSchemaQuery: IQuery = {
  draw: '2',
  columns: [
    {
      data: 'embeded_schema.sub_schema.code',

      searchable: true,
      orderable: true,
      search: {value: 'FR01', regex: false},
    },
  ],
  order: [],
  start: '0',
  length: '10',
  search: {value: null, regex: false},
};

describe('Datatable Module', () => {
  describe('configure', () => {
    it(`should exists`, () => {
      expect(DataTableModule.configure).to.not.be.undefined;
    });

    it(`should set config`, () => {
      let debug = '';
      const logger = {debug: (...data: any[]) => (debug += data.join(', '))} as any;
      const config = DataTableModule.configure({logger});
      expect(config).to.have.property('logger', logger);
      expect(() => config.logger!.debug('test')).to.not.throw();
      expect(debug).to.equals('test');
    });
  });

  describe('dataTable', () => {
    let tests: any[];

    before(done => {
      DataTableModule.configure({logger});
      mongoose.connect(mongoUrl);
      mongoose.connection.on('error', done);
      mongoose.connection.on('open', () =>
        seed()
          .then(res => {
            tests = res;
            done();
          })
          .catch(done)
      );
    });

    it('should list all data', async () => {
      return model.dataTable(query).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(records.length);
      });
    });

    it('should list all data event with unknown fields or ref schema', async () => {
      return model
        .dataTable({
          draw: '2',
          start: '0',
          length: '10',
          order: [],
          search: {value: null, regex: false},
          columns: [{data: '_id'}, {data: 'unknownField'}, {data: 'sub_schema_unknown._id'}],
        })
        .then((data: any) => {
          expect(data).to.not.be.null;
          expect(data.draw).to.be.equals('2');
          expect(data.data).to.have.lengthOf(records.length);
        });
    });

    it('should find entry with field containing "Clement"', async () => {
      return model.dataTable(sQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(records.filter((d: any) => d.first_name.includes('Clement')).length);
        expect(data.data[0]).to.have.property('first_name', 'Clement');
      });
    });

    it('should find entry with first_name "Clement"', async () => {
      return model.dataTable(firstNameClementQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(1);
        expect(data.data[0]).to.have.property('first_name', 'Clement');
      });
    });

    it('should find entry with first_name matching "/Clement|Saanvi/"', async () => {
      return model.dataTable(firstNameQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(records.filter((d: any) => /Clement|Saanvi/g.test(d.first_name)).length);
        expect(data.data[0]).to.have.property('first_name', 'Clement');
        expect(data.data[1]).to.have.property('first_name', 'Saanvi');
      });
    });

    it('should find entry with first_name matching "$in: Clement, Saanvi"', async () => {
      return model.dataTable(firstNameFilterQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(records.filter((d: any) => /Clement|Saanvi/g.test(d.first_name)).length);
        expect(data.data[0]).to.have.property('first_name', 'Clement');
        expect(data.data[1]).to.have.property('first_name', 'Saanvi');
      });
    });

    it('should find entry with first_name matching array "[Clement, Saanvi]"', async () => {
      return model.dataTable(firstNameArrayQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(
          records.filter((d: any) => ['Clement', 'Saanvi'].includes(d.first_name)).length
        );
        expect(data.data[0]).to.have.property('first_name', 'Clement');
        expect(data.data[1]).to.have.property('first_name', 'Saanvi');
      });
    });

    it('should find entry with _id matching', async () => {
      const q = clone(query);
      q.columns[0].search = {value: tests[0]._id.toString(), regex: false};
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
        expect(data.data).to.have.lengthOf(records.filter((d: any) => d.activated).length);
        data.data.forEach((d: any) => expect(d).to.have.property('activated', true));
      });
    });

    it('should find entries with position equal to 2', async () => {
      return model.dataTable(posEq2Query).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(1);
        expect(data.data[0].position).to.be.equals(2);
      });
    });

    it('should find entries with position greater than 2', async () => {
      return model.dataTable(posGt2Query).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(records.filter((d: any) => d.position > 2).length);
        data.data.forEach((d: any) => expect(d.position).to.be.above(2));
      });
    });

    it('should find entries with start_date string between 2019-01-02 and 2019-01-04', async () => {
      return model.dataTable(dateStringQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        const start = new Date('2019-01-02').getTime();
        const end = new Date('2019-01-04').getTime();
        expect(data.data).to.have.lengthOf(
          records.filter((d: any) => d.start_date.getTime() >= start && d.start_date.getTime() <= end).length
        );
        expect((data.data[0].start_date as Date).toDateString()).to.be.equals(new Date('2019-01-02').toDateString());
        expect((data.data[1].start_date as Date).toDateString()).to.be.equals(new Date('2019-01-03').toDateString());
        expect((data.data[2].start_date as Date).toDateString()).to.be.equals(new Date('2019-01-04').toDateString());
      });
    });

    it('should find entries with start_date object between 2019-01-02 and 2019-01-04', async () => {
      return model.dataTable(dateQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        const start = new Date('2019-01-02').getTime();
        const end = new Date('2019-01-04').getTime();
        expect(data.data).to.have.lengthOf(
          records.filter((d: any) => d.start_date.getTime() >= start && d.start_date.getTime() < end).length
        );
        expect((data.data[0].start_date as Date).toDateString()).to.be.equals(new Date('2019-01-02').toDateString());
        expect((data.data[1].start_date as Date).toDateString()).to.be.equals(new Date('2019-01-03').toDateString());
      });
    });

    it('should find entries with sub_schema code equals to FR03', async () => {
      return model
        .dataTable({
          draw: '2',
          start: '0',
          length: '10',
          order: [],
          search: {value: null, regex: false},
          columns: [
            {
              data: 'sub_schema.code',

              searchable: true,
              orderable: false,
              search: {value: 'FR03', regex: false},
            },
          ],
        })
        .then((data: any) => {
          expect(data).to.not.be.null;
          expect(data.draw).to.be.equals('2');
          expect(data.data).to.have.lengthOf(1);
          expect(data.data[0]).to.have.property('sub_schema');
          expect(data.data[0].sub_schema).to.have.property('code', 'FR03');
        });
    });

    it('should find entries with embeded_schema.code equals to EMB01', async () => {
      return model.dataTable(embededSchemaQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(1);
        expect(data.data[0]).to.have.property('embeded_schema');
        expect(data.data[0].embeded_schema).to.have.property('code', 'EMB01');
      });
    });

    it('should find entries with embeded_schema.sub_schema.code equals to FR01', async () => {
      return model.dataTable(embededSubSchemaQuery).then((data: any) => {
        expect(data).to.not.be.null;
        expect(data.draw).to.be.equals('2');
        expect(data.data).to.have.lengthOf(1);
        expect(data.data[0]).to.have.property('embeded_schema');
        expect(data.data[0].embeded_schema).to.have.property('sub_schema');
        expect(data.data[0].embeded_schema.sub_schema).to.have.property('code', 'FR01');
      });
    });

    it('should find entries with array.code equals to ARR01', async () => {
      return model
        .dataTable({
          draw: '2',
          order: [],
          start: '0',
          length: '10',
          search: {value: null, regex: false},
          columns: [
            {
              data: 'array.code',

              searchable: true,
              orderable: true,
              search: {value: 'ARR01', regex: false},
            },
          ],
        })
        .then((data: any) => {
          expect(data).to.not.be.null;
          expect(data.draw).to.be.equals('2');
          expect(data.data).to.have.lengthOf(1);
          expect(data.data[0]).to.have.property('array');
          expect(data.data[0].array.filter((a: any) => a.code === 'ARR01')).to.have.lengthOf(1);
        });
    });

    it('should find entries with array.embeded_schema.code equals to FR01', async () => {
      return model
        .dataTable({
          draw: '2',
          order: [],
          start: '0',
          length: '10',
          search: {value: null, regex: false},
          columns: [
            {data: 'array.code', searchable: true, orderable: true},
            {
              data: 'array.embeded_schema.code',

              searchable: true,
              orderable: true,
              search: {value: 'FR01', regex: false},
            },
          ],
        })
        .then((data: any) => {
          expect(data).to.not.be.null;
          expect(data.draw).to.be.equals('2');
          expect(data.data).to.have.lengthOf(1);
          expect(data.data[0]).to.have.property('array');
          expect(data.data[0].array).to.have.lengthOf(3);
          expect(data.data[0].array[0]).to.have.property('embeded_schema');
          expect(data.data[0].array[0].embeded_schema).to.have.property('code', 'FR01');
        });
    });

    it('should find entries with embeded_schema_array.code equals to FR01', async () => {
      return model
        .dataTable({
          draw: '2',
          order: [],
          start: '0',
          length: '10',
          search: {value: null, regex: false},
          columns: [
            {
              data: 'embeded_schema_array.code',

              searchable: true,
              orderable: true,
              search: {value: 'FR01', regex: false},
            },
          ],
        })
        .then((data: any) => {
          expect(data).to.not.be.null;
          expect(data.draw).to.be.equals('2');
          expect(data.data).to.have.lengthOf(1);
          expect(data.data[0]).to.have.property('embeded_schema_array');
          expect(data.data[0].embeded_schema_array).to.have.lengthOf(2);
          expect(data.data[0].embeded_schema_array[0]).to.have.property('code', 'FR01');
        });
    });

    after(() => {
      mongoose.connection.close();
    });
  });
});

async function seed(): Promise<any[]> {
  const subdata = await subModel.insertMany([
    {code: 'FR01', description: 'code FR01'},
    {code: 'FR02', description: 'code FR02'},
    {code: 'FR03', description: 'code FR03'},
    {code: 'FR04', description: 'code FR04'},
    {code: 'FR05', description: 'code FR05'},
    {code: 'FR06', description: 'code FR06'},
  ]);
  records = [
    {
      first_name: 'Clement',
      last_name: 'Sadler',
      activated: true,
      position: 1,
      start_date: new Date('2019-01-01'),
      sub_schema: subdata[0],
      array: [{code: 'ARR01'}, {code: 'ARR02'}, {code: 'ARR03'}],
    },
    {
      first_name: 'Saanvi',
      last_name: 'Meyers',
      activated: false,
      position: 2,
      start_date: new Date('2019-01-02'),
      sub_schema: subdata[1],
      array: [
        {code: 'ARR04', embeded_schema: subdata[0]},
        {code: 'ARR05', embeded_schema: subdata[1]},
        {code: 'ARR06'},
      ],
    },
    {
      first_name: 'Antonia',
      last_name: 'Watts',
      activated: true,
      position: 3,
      start_date: new Date('2019-01-03'),
      sub_schema: subdata[2],
      embeded_schema_array: [subdata[0], subdata[1]],
    },
    {
      first_name: 'Eman',
      last_name: 'Watts',
      activated: false,
      position: 4,
      start_date: new Date('2019-01-04'),
      sub_schema: subdata[3],
      embeded_schema_array: [subdata[2], subdata[3]],
    },
    {
      first_name: 'Eman',
      last_name: 'Partridge',
      activated: true,
      position: 5,
      start_date: new Date('2019-01-05'),
      sub_schema: subdata[4],
    },
    {
      first_name: 'Ben',
      last_name: 'Snider',
      activated: false,
      position: 6,
      start_date: new Date('2020-01-05'),
      sub_schema: subdata[5],
      embeded_schema: {
        code: 'EMB01',
        sub_schema: subdata[0],
      },
    },
  ];
  const res = await model.insertMany(records);
  return res;
}
