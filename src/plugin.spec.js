"use strict";
/** @format */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chai = __importStar(require("chai"));
const chai_as_promised_1 = __importDefault(require("chai-as-promised"));
const mongoose_1 = __importDefault(require("mongoose"));
const public_api_js_1 = require("./public-api.js");
const mongoUrl = `mongodb://localhost:4242/test-datatable`;
mongoose_1.default.set('strictQuery', false);
const subSchema = new mongoose_1.default.Schema({
    code: String,
    description: String,
});
const subModel = mongoose_1.default.model('SubTest', subSchema);
const embededSchema = new mongoose_1.default.Schema({
    code: String,
    sub_schema: { type: mongoose_1.default.Types.ObjectId, ref: 'SubTest' },
});
const schema = new mongoose_1.default.Schema({
    first_name: String,
    last_name: String,
    activated: Boolean,
    position: Number,
    start_date: Date,
    sub_schema: { type: mongoose_1.default.Types.ObjectId, ref: 'SubTest' },
    sub_schema_unknown: { type: mongoose_1.default.Types.ObjectId, ref: 'SubSchemaUnknown' },
    embeded_schema: { type: embededSchema },
    array: [
        {
            code: String,
            embeded_schema: { type: mongoose_1.default.Types.ObjectId, ref: 'SubTest' },
        },
    ],
    embeded_schema_array: [{ type: mongoose_1.default.Types.ObjectId, ref: 'SubTest' }],
    nested_embeded_schema_array: [
        {
            code: String,
            embeded_schema_array: [{ type: mongoose_1.default.Types.ObjectId, ref: 'SubTest' }],
        },
    ],
    nested_nested_array: [
        {
            code: String,
            array: [
                {
                    code: String,
                    embeded_schema: { type: mongoose_1.default.Types.ObjectId, ref: 'SubTest' },
                },
            ],
        },
    ],
});
schema.plugin(public_api_js_1.datatablePlugin);
const model = mongoose_1.default.model('Test', schema);
chai.use(chai_as_promised_1.default);
const expect = chai.expect;
let records;
describe('Datatable Module', () => {
    describe('dataTable', () => {
        let tests;
        before(done => {
            mongoose_1.default.connect(mongoUrl);
            mongoose_1.default.connection.on('error', done);
            mongoose_1.default.connection.on('open', () => seed()
                .then(res => {
                tests = res;
                done();
            })
                .catch(done));
        });
        it('should list all data', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(records.length);
        }));
        it('should list all data event with unknown fields or ref schema', () => __awaiter(void 0, void 0, void 0, function* () {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(records.length);
            expect(data.data[0]).to.have.property('notInModelField', 'test notInModelField');
        }));
        it('should find entry with field containing "Clement"', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(records.filter((d) => d.first_name.includes('Clement')).length);
            expect(data.data[0]).to.have.property('first_name', 'Clement');
        }));
        it('should find entry with first_name "Clement"', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0]).to.have.property('first_name', 'Clement');
        }));
        it('should find entry with first_name matching "/Clement|Saanvi/"', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(records.filter((d) => /Clement|Saanvi/g.test(d.first_name)).length);
            expect(data.data[0]).to.have.property('first_name', 'Clement');
            expect(data.data[1]).to.have.property('first_name', 'Saanvi');
        }));
        it('should find entry with first_name matching value "$in: Clement, Saanvi"', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(records.filter((d) => /Clement|Saanvi/g.test(d.first_name)).length);
            expect(data.data[0]).to.have.property('first_name', 'Clement');
            expect(data.data[1]).to.have.property('first_name', 'Saanvi');
        }));
        it('should find entry with first_name matching array "[Clement, Saanvi]" with $in operator', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(records.filter((d) => ['Clement', 'Saanvi'].includes(d.first_name)).length);
            expect(data.data[0]).to.have.property('first_name', 'Clement');
            expect(data.data[1]).to.have.property('first_name', 'Saanvi');
        }));
        it('should find entry with first_name not matching array "[Clement, Saanvi]" with $nin operator', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(records.filter((d) => !['Clement', 'Saanvi'].includes(d.first_name)).length);
            expect(data.data[0]).to.not.have.property('first_name', 'Clement');
            expect(data.data[1]).to.not.have.property('first_name', 'Saanvi');
        }));
        it('should find entry with _id matching', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0]._id.equals(tests[0]._id)).to.be.true;
        }));
        it('should find entry with activated as true', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(records.filter((d) => d.activated).length);
            data.data.forEach((d) => expect(d).to.have.property('activated', true));
        }));
        it('should find entries with position equal to 2', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
                draw: '2',
                columns: [
                    { data: 'first_name', searchable: true },
                    { data: 'last_name', searchable: false },
                    { data: 'activated', searchable: true },
                    { data: 'position', searchable: true, search: { value: 2 } },
                    { data: 'start_date', searchable: true },
                    { data: 'sub_schema.code', searchable: true },
                ],
                order: [{ column: 3, dir: 'asc' }],
                start: 0,
                length: 10,
            };
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0].position).to.be.equals(2);
        }));
        it('should find entries with position greater than 2', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(records.filter((d) => d.position > 2).length);
            data.data.forEach((d) => expect(d.position).to.be.above(2));
        }));
        it('should find entries with start_date string between 2019-01-02 and 2019-01-04', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            const start = new Date('2019-01-02').getTime();
            const end = new Date('2019-01-04').getTime();
            expect(data.data).to.have.lengthOf(records.filter((d) => d.start_date.getTime() >= start && d.start_date.getTime() <= end).length);
            expect(data.data[0].start_date.toDateString()).to.be.equals(new Date('2019-01-02').toDateString());
            expect(data.data[1].start_date.toDateString()).to.be.equals(new Date('2019-01-03').toDateString());
            expect(data.data[2].start_date.toDateString()).to.be.equals(new Date('2019-01-04').toDateString());
        }));
        it('should find entries with start_date object equals to 2019-01-02', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0].start_date.toDateString()).to.be.equals(new Date('2019-01-02').toDateString());
        }));
        it('should find entries with sub_schema code equals to FR03', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0]).to.have.property('sub_schema');
            expect(data.data[0].sub_schema).to.have.property('code', 'FR03');
        }));
        it('should find entries with embeded_schema.code equals to EMB01', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0]).to.have.property('embeded_schema');
            expect(data.data[0].embeded_schema).to.have.property('code', 'EMB01');
        }));
        it('should find entries with embeded_schema.sub_schema.code equals to FR01', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0]).to.have.property('embeded_schema');
            expect(data.data[0].embeded_schema).to.have.property('sub_schema');
            expect(data.data[0].embeded_schema.sub_schema).to.have.property('code', 'FR01');
        }));
        it('should find entries with array.code equals to ARR01', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0]).to.have.property('array');
            expect(data.data[0].array.filter((a) => a.code === 'ARR01')).to.have.lengthOf(1);
        }));
        it('should find entries with array.embeded_schema.code equals to FR01', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0]).to.have.property('array');
            expect(data.data[0].array).to.have.lengthOf(3);
            expect(data.data[0].array[0]).to.have.property('embeded_schema');
            expect(data.data[0].array[0].embeded_schema).to.have.property('code', 'FR01');
        }));
        it('should find entries with embeded_schema_array.code equals to FR01', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0]).to.have.property('embeded_schema_array');
            expect(data.data[0].embeded_schema_array).to.have.lengthOf(2);
            expect(data.data[0].embeded_schema_array[0]).to.have.property('code', 'FR01');
        }));
        it('should find entries with nested_nested_array.array.embeded_schema.code equals to FR01', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0]).to.have.property('nested_nested_array');
            expect(data.data[0].nested_nested_array).to.have.lengthOf(1);
            expect(data.data[0].nested_nested_array[0]).to.have.property('array');
            expect(data.data[0].nested_nested_array[0].array).to.have.lengthOf(3);
            expect(data.data[0].nested_nested_array[0].array[0]).to.have.property('embeded_schema');
            expect(data.data[0].nested_nested_array[0].array[0].embeded_schema).to.have.property('code', 'FR01');
        }));
        it('should find entries with nested_embeded_schema_array.embeded_schema_array.code equals to FR01', () => __awaiter(void 0, void 0, void 0, function* () {
            const query = {
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
            const data = yield model.datatable(query);
            expect(data).to.not.be.null;
            expect(data.draw).to.be.equals('2');
            expect(data.data).to.have.lengthOf(1);
            expect(data.data[0]).to.have.property('nested_embeded_schema_array');
            expect(data.data[0].nested_embeded_schema_array).to.have.lengthOf(1);
            expect(data.data[0].nested_embeded_schema_array[0]).to.have.property('embeded_schema_array');
            expect(data.data[0].nested_embeded_schema_array[0].embeded_schema_array).to.have.lengthOf(2);
            expect(data.data[0].nested_embeded_schema_array[0].embeded_schema_array[0]).to.have.property('code', 'FR01');
        }));
        after(() => {
            mongoose_1.default.connection.close();
        });
    });
});
function seed() {
    return __awaiter(this, void 0, void 0, function* () {
        const subdata = yield subModel.insertMany([
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
        const res = yield model.insertMany(records);
        yield model.collection.updateOne({ _id: res[0]._id }, { $set: { notInModelField: 'test notInModelField' } });
        return res;
    });
}
//# sourceMappingURL=plugin.spec.js.map