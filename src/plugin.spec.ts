/** @format */

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import mongoose from 'mongoose';
import { DatatableData, DatatableOptions, datatablePlugin, DatatableQuery } from './public-api.js';

const mongoUrl = `mongodb://localhost:27017/test-datatable`;
mongoose.set('strictQuery', false);
const subSchema = new mongoose.Schema({
  code: String,
  description: String,
});
const subModel = mongoose.model('SubTest', subSchema);
const embededSchema = new mongoose.Schema({
  code: String,
  sub_schema: { type: mongoose.Types.ObjectId, ref: 'SubTest' },
});
const schema = new mongoose.Schema({
  first_name: String,
  last_name: String,
  activated: Boolean,
  position: Number,
  private_value: { type: String, select: false },
  start_date: Date,
  sub_schema: { type: mongoose.Types.ObjectId, ref: 'SubTest' },
  sub_schema_unknown: { type: mongoose.Types.ObjectId, ref: 'SubSchemaUnknown' },
  embeded_schema: { type: embededSchema },
  array: [
    {
      code: String,
      embeded_schema: { type: mongoose.Types.ObjectId, ref: 'SubTest' },
    },
  ],
  embeded_schema_array: [{ type: mongoose.Types.ObjectId, ref: 'SubTest' }],
  nested_embeded_schema_array: [
    {
      code: String,
      embeded_schema_array: [{ type: mongoose.Types.ObjectId, ref: 'SubTest' }],
    },
  ],
  nested_nested_array: [
    {
      code: String,
      array: [
        {
          code: String,
          embeded_schema: { type: mongoose.Types.ObjectId, ref: 'SubTest' },
        },
      ],
    },
  ],
});

schema.plugin(datatablePlugin);

interface IModel extends mongoose.Model<any> {
  dataTable: (query: DatatableQuery, options?: DatatableOptions) => Promise<DatatableData>;
  datatable: (query: DatatableQuery, options?: DatatableOptions) => Promise<DatatableData>;
}
const model: IModel = mongoose.model('Test', schema) as any;

chai.use(chaiAsPromised);
const expect = chai.expect;

let records: any[];

describe('Datatable Module', () => {
  describe('dataTable', () => {
    let tests: any[];

    before(done => {
      mongoose.connect(mongoUrl);
      mongoose.connection.on('error', done);
      mongoose.connection.on('open', () =>
        seed()
          .then(res => ((tests = res), done()))
          .catch(done)
      );
    });

    it('should list all data', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: '_id', searchable: true },
          { data: 'first_name', searchable: true },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
          { data: 'embeded_schema', searchable: true },
          { data: 'array', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: '0',
        length: '10',
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(records.length);
    });


    it('should support a query without projected columns', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data.data).to.have.lengthOf(records.length);
      expect(data.data[0]).to.have.property('_id');
      expect(data.data[0]).to.not.have.property('private_value');
    });

    it('should return recordsTotal when unfiltered info is explicitly enabled', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [{ data: 'first_name', searchable: true }],
        start: 0,
        length: 10,
        enableUnfilteredInfo: true,
      };
      const data = await model.datatable(query);
      expect(data.recordsTotal).to.be.equals(records.length);
      expect(data.recordsFiltered).to.be.equals(records.length);
    });

    it('should reject unsafe column paths when security path validation is enabled', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [{ data: '$where', searchable: true, search: { value: 'true' } }],
        start: 0,
        length: 10,
      };

      await expect(
        model.datatable(query, {
          security: { validatePaths: true },
        }),
      ).to.be.rejectedWith('Datatable security validation failed for columns[0].data: unsafe path $where');
    });

    it('should reject raw object search values when object search is disabled', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [{ data: 'first_name', searchable: true, search: { value: { $ne: '' } } }],
        start: 0,
        length: 10,
      };

      await expect(
        model.datatable(query, {
          security: { allowObjectSearch: false },
        }),
      ).to.be.rejectedWith('raw object search values are not allowed');
    });

    it('should allow date range search values when raw object search is disabled', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          {
            data: 'start_date',
            searchable: true,
            search: { operator: '≤≥', value: { from: new Date('2019-01-02'), to: new Date('2019-01-04') } },
          },
        ],
        start: 0,
        length: 10,
      };

      const data = await model.datatable(query, {
        security: { allowObjectSearch: false },
      });

      expect(data.data).to.have.lengthOf(3);
    });

    it('should reject search operators outside the security allowlist', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [{ data: 'position', searchable: true, search: { value: 2, operator: '>' } }],
        start: 0,
        length: 10,
      };

      await expect(
        model.datatable(query, {
          security: { allowedSearchOperators: ['=', '$in', '$nin'] },
        }),
      ).to.be.rejectedWith('operator > is not allowed');
    });

    it('should reject facet operators outside the security allowlist', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [{ data: 'activated' }],
        facets: [{ id: 'positionSum', kind: 'indicator', property: 'activated', operator: ['sum', 'position'] }],
        start: 0,
        length: 10,
      };

      await expect(
        model.datatable(query, {
          security: { allowedFacetOperators: ['count'] },
        }),
      ).to.be.rejectedWith('operator sum is not allowed');
    });

    it('should allow explicitly approved projection operators', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          {
            data: 'arrayCount',
            projection: { $size: { $ifNull: ['$array', []] } },
          },
        ],
        start: 0,
        length: 10,
      };

      const data = await model.datatable(query, {
        security: {
          validatePaths: true,
          allowedProjectionOperators: ['$size', '$ifNull'],
          validateSelectableExpressionFields: true,
        },
      });

      expect(data.data[0]).to.have.property('arrayCount', 3);
    });

    it('should reject non-selectable fields referenced by projection expressions', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          {
            data: 'privateAlias',
            projection: { $ifNull: ['$private_value', null] },
          },
        ],
        start: 0,
        length: 10,
      };

      await expect(
        model.datatable(query, {
          security: {
            allowedProjectionOperators: ['$ifNull'],
            validateSelectableExpressionFields: true,
          },
        }),
      ).to.be.rejectedWith('field private_value is not selectable');
    });

    it('should reject non-selectable facet fields when selectable facet validation is enabled', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [{ data: 'first_name' }],
        facets: [{ id: 'private', kind: 'indicator', property: 'private_value', operator: 'count' }],
        start: 0,
        length: 10,
      };

      await expect(
        model.datatable(query, {
          security: { validateSelectableFacetFields: true },
        }),
      ).to.be.rejectedWith('field private_value is not selectable');
    });

    it('should reject facet info operators outside the security allowlist', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [{ data: 'activated' }],
        facets: [
          {
            id: 'activated',
            kind: 'indicator',
            property: 'activated',
            operator: 'count',
            info: { $push: '$first_name' },
          },
        ],
        start: 0,
        length: 10,
      };

      await expect(
        model.datatable(query, {
          security: { allowedFacetInfoOperators: ['$first'] },
        }),
      ).to.be.rejectedWith('operator $push is not allowed');
    });

    it('should list all data event with unknown fields or ref schema', async () => {
      const query = {
        draw: '2',
        start: 0,
        length: 10,
        order: [],
        columns: [
          { data: '_id' },
          { data: 'unknownField' },
          { data: 'sub_schema_unknown._id' },
          { data: 'notInModelField' },
        ],
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(records.length);
      expect(data.data[0]).to.have.property('notInModelField', 'test notInModelField');
    });

    it('should find entry with field containing "Clement"', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: 'first_name', searchable: true },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: 0,
        length: 10,
        search: { value: 'Clement', regex: false },
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(records.filter((d: any) => d.first_name.includes('Clement')).length);
      expect(data.data[0]).to.have.property('first_name', 'Clement');
    });

    it('should find entry with first_name "Clement"', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: 'first_name', searchable: true, search: { value: 'Clement' } },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect(data.data[0]).to.have.property('first_name', 'Clement');
    });

    it('should find entry with first_name matching "/Clement|Saanvi/"', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          {
            data: 'first_name',
            searchable: true,
            search: { value: 'Clement|Saanvi', regex: true },
          },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(records.filter((d: any) => /Clement|Saanvi/g.test(d.first_name)).length);
      expect(data.data[0]).to.have.property('first_name', 'Clement');
      expect(data.data[1]).to.have.property('first_name', 'Saanvi');
    });

    it('should find entry with first_name matching value "$in: Clement, Saanvi"', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          {
            data: 'first_name',
            searchable: true,
            search: { value: { $in: ['Clement', 'Saanvi'] } },
            // search: { value: ['Clement', 'Saanvi'], operator: '$in', },
          },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(records.filter((d: any) => /Clement|Saanvi/g.test(d.first_name)).length);
      expect(data.data[0]).to.have.property('first_name', 'Clement');
      expect(data.data[1]).to.have.property('first_name', 'Saanvi');
    });

    it('should find entry with first_name matching array "[Clement, Saanvi]" with $in operator', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          {
            data: 'first_name',
            searchable: true,
            search: { value: ['Clement', 'Saanvi'], operator: '$in' },
          },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(
        records.filter((d: any) => ['Clement', 'Saanvi'].includes(d.first_name)).length
      );
      expect(data.data[0]).to.have.property('first_name', 'Clement');
      expect(data.data[1]).to.have.property('first_name', 'Saanvi');
    });

    it('should find entry with first_name not matching array "[Clement, Saanvi]" with $nin operator', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          {
            data: 'first_name',
            searchable: true,
            search: { value: ['Clement', 'Saanvi'], operator: '$nin' },
          },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(
        records.filter((d: any) => !['Clement', 'Saanvi'].includes(d.first_name)).length
      );
      expect(data.data[0]).to.not.have.property('first_name', 'Clement');
      expect(data.data[1]).to.not.have.property('first_name', 'Saanvi');
    });

    it('should find entry with _id matching', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: '_id', searchable: true, search: { value: tests[0]._id.toString() } },
          { data: 'first_name', searchable: true },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
          { data: 'embeded_schema', searchable: true },
          { data: 'array', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect(data.data[0]._id.equals(tests[0]._id)).to.be.true;
    });

    it('should find entry with activated as true', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: 'first_name', searchable: true },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true, search: { value: 'true' } },
          { data: 'position', searchable: true },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(records.filter((d: any) => d.activated).length);
      data.data.forEach((d: any) => expect(d).to.have.property('activated', true));
    });

    it('should find entries with position equal to 2', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: 'first_name', searchable: true },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true, search: { operator: '=', value: 2 } },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect(data.data[0].position).to.be.equals(2);
    });

    it('should find entries with position greater than 2', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: 'first_name', searchable: true },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true, search: { operator: '>', value: '2' } },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(records.filter((d: any) => d.position > 2).length);
      data.data.forEach((d: any) => expect(d.position).to.be.above(2));
    });

    it('should find entries with position greater than or equal to 3', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: 'first_name', searchable: true },
          { data: 'position', searchable: true, search: { operator: '>=', value: '3' } },
        ],
        order: [{ column: 1, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.data).to.have.lengthOf(4);
      expect(data.data.map((entry: any) => entry.position)).to.deep.equal([3, 4, 5, 6]);
    });

    it('should not expose fields configured with select false', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: 'first_name', searchable: true },
          { data: 'private_value', searchable: true },
        ],
        order: [],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.data).to.have.lengthOf(records.length);
      data.data.forEach((entry: any) => expect(entry).to.not.have.property('private_value'));
    });

    it('should populate a shared reference only once for multiple columns', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: 'first_name', searchable: true },
          { data: 'sub_schema.code', searchable: true },
          { data: 'sub_schema.description', searchable: true },
        ],
        order: [{ column: 0, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.data).to.have.lengthOf(records.length);
      data.data.forEach((entry: any) => {
        expect(entry.sub_schema).to.have.property('code');
        expect(entry.sub_schema).to.have.property('description');
      });
    });

    it('should find entries with start_date string between 2019-01-02 and 2019-01-04', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: 'first_name', searchable: true },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true },
          {
            data: 'start_date',

            searchable: true,

            search: { operator: '≤≥', value: { from: new Date('2019-01-02'), to: new Date('2019-01-04') } },
          },
          { data: 'sub_schema.code', searchable: true },
        ],
        order: [{ column: 4, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
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

    it('should find entries with start_date object equals to 2019-01-02', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: 'first_name', searchable: true },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true },
          {
            data: 'start_date',
            searchable: true,

            search: { value: new Date('2019-01-02') },
          },
          { data: 'sub_schema.code', searchable: true },
        ],
        order: [{ column: 4, dir: 'asc' }],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect((data.data[0].start_date as Date).toDateString()).to.be.equals(new Date('2019-01-02').toDateString());
    });

    it('should find entries with sub_schema code equals to FR03', async () => {
      const query: DatatableQuery = {
        draw: '2',
        start: 0,
        length: 10,
        order: [],
        columns: [
          {
            data: 'sub_schema.code',

            searchable: true,
            search: { value: 'FR03' },
          },
        ],
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect(data.data[0]).to.have.property('sub_schema');
      expect(data.data[0].sub_schema).to.have.property('code', 'FR03');
    });

    it('should find entries with embeded_schema.code equals to EMB01', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          {
            data: 'embeded_schema.code',
            searchable: true,
            search: { value: 'EMB01' },
          },
        ],
        order: [],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect(data.data[0]).to.have.property('embeded_schema');
      expect(data.data[0].embeded_schema).to.have.property('code', 'EMB01');
    });

    it('should find entries with embeded_schema.sub_schema.code equals to FR01', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          {
            data: 'embeded_schema.sub_schema.code',
            searchable: true,
            search: { value: 'FR01' },
          },
        ],
        order: [],
        start: 0,
        length: 10,
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect(data.data[0]).to.have.property('embeded_schema');
      expect(data.data[0].embeded_schema).to.have.property('sub_schema');
      expect(data.data[0].embeded_schema.sub_schema).to.have.property('code', 'FR01');
    });

    it('should find entries with array.code equals to ARR01', async () => {
      const query: DatatableQuery = {
        draw: '2',
        order: [],
        start: 0,
        length: 10,
        columns: [
          {
            data: 'array.code',
            searchable: true,
            search: { value: 'ARR01' },
          },
        ],
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect(data.data[0]).to.have.property('array');
      expect(data.data[0].array.filter((a: any) => a.code === 'ARR01')).to.have.lengthOf(1);
    });

    it('should find entries with array.embeded_schema.code equals to FR01', async () => {
      const query: DatatableQuery = {
        draw: '2',
        order: [],
        start: 0,
        length: 10,
        columns: [
          { data: 'array.code', searchable: true },
          {
            data: 'array.embeded_schema.code',
            searchable: true,
            search: { value: 'FR01' },
          },
        ],
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect(data.data[0]).to.have.property('array');
      expect(data.data[0].array).to.have.lengthOf(3);
      expect(data.data[0].array[0]).to.have.property('embeded_schema');
      expect(data.data[0].array[0].embeded_schema).to.have.property('code', 'FR01');
    });

    it('should find entries with embeded_schema_array.code equals to FR01', async () => {
      const query: DatatableQuery = {
        draw: '2',
        order: [],
        start: 0,
        length: 10,
        columns: [
          {
            data: 'embeded_schema_array.code',
            searchable: true,
            search: { value: 'FR01' },
          },
        ],
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect(data.data[0]).to.have.property('embeded_schema_array');
      expect(data.data[0].embeded_schema_array).to.have.lengthOf(2);
      expect(data.data[0].embeded_schema_array[0]).to.have.property('code', 'FR01');
    });

    it('should find entries with nested_nested_array.array.embeded_schema.code equals to FR01', async () => {
      const query: DatatableQuery = {
        draw: '2',
        order: [],
        start: 0,
        length: 10,
        columns: [
          {
            data: 'nested_nested_array.array.embeded_schema.code',
            searchable: true,
            search: { value: 'FR01' },
          },
        ],
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect(data.data[0]).to.have.property('nested_nested_array');
      expect(data.data[0].nested_nested_array).to.have.lengthOf(1);
      expect(data.data[0].nested_nested_array[0]).to.have.property('array');
      expect(data.data[0].nested_nested_array[0].array).to.have.lengthOf(3);
      expect(data.data[0].nested_nested_array[0].array[0]).to.have.property('embeded_schema');
      expect(data.data[0].nested_nested_array[0].array[0].embeded_schema).to.have.property('code', 'FR01');
    });

    it('should find entries with nested_embeded_schema_array.embeded_schema_array.code equals to FR01', async () => {
      const query: DatatableQuery = {
        draw: '2',
        order: [],
        start: 0,
        length: 10,
        columns: [
          {
            data: 'nested_embeded_schema_array.embeded_schema_array.code',
            searchable: true,
            // search: { value: 'FR01' },
          },
        ],
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(1);
      expect(data.data[0]).to.have.property('nested_embeded_schema_array');
      expect(data.data[0].nested_embeded_schema_array).to.have.lengthOf(1);
      expect(data.data[0].nested_embeded_schema_array[0]).to.have.property('embeded_schema_array');
      expect(data.data[0].nested_embeded_schema_array[0].embeded_schema_array).to.have.lengthOf(2);
      expect(data.data[0].nested_embeded_schema_array[0].embeded_schema_array[0]).to.have.property('code', 'FR01');
    });

    it('should keep aggregation fields required by sum and avg facets', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [{ data: '_id', searchable: true }],
        order: [],
        start: 0,
        length: 10,
        facets: [
          { id: 'positionSum', kind: 'indicator', property: 'activated', operator: ['sum', 'position'] },
          { id: 'positionAvg', kind: 'indicator', property: 'activated', operator: ['avg', 'position'] },
        ],
      };
      const data = await model.datatable(query);
      expect(data.facets).to.not.be.undefined;

      const trueSum = data.facets!.positionSum.find((facet: any) => facet._id === true);
      const falseSum = data.facets!.positionSum.find((facet: any) => facet._id === false);
      const trueAvg = data.facets!.positionAvg.find((facet: any) => facet._id === true);
      const falseAvg = data.facets!.positionAvg.find((facet: any) => facet._id === false);

      expect(trueSum?.value).to.equal(9);
      expect(falseSum?.value).to.equal(12);
      expect(trueAvg?.value).to.equal(3);
      expect(falseAvg?.value).to.equal(4);
    });

    it('facet', async () => {
      const query: DatatableQuery = {
        draw: '2',
        columns: [
          { data: '_id', searchable: true },
          { data: 'first_name', searchable: true },
          { data: 'last_name', searchable: false },
          { data: 'activated', searchable: true },
          { data: 'position', searchable: true },
          { data: 'start_date', searchable: true },
          { data: 'sub_schema.code', searchable: true },
          { data: 'embeded_schema', searchable: true },
          { data: 'array', searchable: true },
        ],
        order: [{ column: 3, dir: 'asc' }],
        start: '0',
        length: '10',
        facets: [{ id: 'activated', kind: 'indicator', property: 'activated', operator: 'count' }],
      };
      const data = await model.datatable(query);
      expect(data).to.not.be.null;
      expect(data.draw).to.be.equals('2');
      expect(data.data).to.have.lengthOf(records.length);
      expect(data.facets).to.not.be.null;
      expect(data.facets!.activated).to.have.lengthOf(2);
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
    { code: 'FR06', description: 'code FR06' },
  ]);
  records = [
    {
      first_name: 'Clement',
      private_value: 'private-clement',
      last_name: 'Sadler',
      activated: true,
      position: 1,
      start_date: new Date('2019-01-01'),
      sub_schema: subdata[0],
      array: [{ code: 'ARR01' }, { code: 'ARR02' }, { code: 'ARR03' }],
      nested_nested_array: [
        {
          code: 'ARR03',
          array: [
            { code: 'ARR04', embeded_schema: subdata[0] },
            { code: 'ARR05', embeded_schema: subdata[1] },
            { code: 'ARR06' },
          ],
        },
      ],
    },
    {
      first_name: 'Saanvi',
      private_value: 'private-saanvi',
      last_name: 'Meyers',
      activated: false,
      position: 2,
      start_date: new Date('2019-01-02'),
      sub_schema: subdata[1],
      array: [
        { code: 'ARR04', embeded_schema: subdata[0] },
        { code: 'ARR05', embeded_schema: subdata[1] },
        { code: 'ARR06' },
      ],
      nested_embeded_schema_array: [{ embeded_schema_array: [subdata[0], subdata[1]] }],
    },
    {
      first_name: 'Antonia',
      private_value: 'private-antonia',
      last_name: 'Watts',
      activated: true,
      position: 3,
      start_date: new Date('2019-01-03'),
      sub_schema: subdata[2],
      embeded_schema_array: [subdata[0], subdata[1]],
    },
    {
      first_name: 'Eman',
      private_value: 'private-eman',
      last_name: 'Watts',
      activated: false,
      position: 4,
      start_date: new Date('2019-01-04'),
      sub_schema: subdata[3],
      embeded_schema_array: [subdata[2], subdata[3]],
    },
    {
      first_name: 'Eman',
      private_value: 'private-eman',
      last_name: 'Partridge',
      activated: true,
      position: 5,
      start_date: new Date('2019-01-05'),
      sub_schema: subdata[4],
    },
    {
      first_name: 'Ben',
      private_value: 'private-ben',
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
  await model.collection.updateOne({ _id: res[0]._id }, { $set: { notInModelField: 'test notInModelField' } });
  return res;
}
