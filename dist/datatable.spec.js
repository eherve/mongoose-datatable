"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const datatable_1 = require("./datatable");
const mongoUrl = `mongodb://localhost:4242/test-datatable`;
const mongoose = require('mongoose');
mongoose.plugin(datatable_1.default.init);
const schema = new mongoose.Schema({ first_name: String, last_name: String, position: Number, start_date: Date });
const model = mongoose.model('Test', schema);
chai.use(chaiAsPromised);
const expect = chai.expect;
const query = {
    draw: '2',
    columns: [{
            data: 'first_name',
            name: null,
            searchable: true,
            orderable: true,
            search: { value: null, regex: false }
        },
        {
            data: 'last_name',
            name: null,
            searchable: false,
            orderable: true,
            search: { value: null, regex: false }
        },
        {
            data: 'position',
            name: null,
            searchable: true,
            orderable: true,
            search: { value: null, regex: false }
        },
        {
            data: 'start_date',
            name: null,
            searchable: true,
            orderable: false,
            search: { value: null, regex: false }
        }
    ],
    order: [{ column: 0, dir: 'asc' }],
    start: '0',
    length: '10',
    search: {
        value: null,
        regex: false
    }
};
const nologger = { debug: () => { }, info: () => { }, warn: () => { }, error: () => { } };
describe('Datatable Module', () => {
    describe('configure', () => {
        it(`should exists`, () => {
            expect(datatable_1.default.configure)
                .to.not.be.undefined;
        });
        it(`should set config`, () => {
            let debug = '';
            const logger = { debug: (...data) => debug += data.join(', ') };
            const config = datatable_1.default.configure({ logger });
            expect(config)
                .to.have.property('logger', logger);
            expect(() => config.logger.debug('test'))
                .to.not.throw();
            expect(debug)
                .to.equals('test');
        });
    });
    describe('dataTable', () => {
        before(done => {
            mongoose.connect(mongoUrl, { useNewUrlParser: true });
            mongoose.connection.on('error', done);
            mongoose.connection.on('open', () => {
                model.insertMany([
                    { first_name: 'Clement', last_name: 'Sadler', position: 1, start_date: new Date('2019.01.01') },
                    { first_name: 'Saanvi', last_name: 'Meyers', position: 2, start_date: new Date('2019.01.02') },
                    { first_name: 'Antonia', last_name: 'Watts', position: 3, start_date: new Date('2019.01.03') },
                    { first_name: 'Eman', last_name: 'Pierce', position: 4, start_date: new Date('2019.01.04') },
                    { first_name: 'Israel', last_name: 'Partridge', position: 5, start_date: new Date('2019.01.05') }
                ]).then(() => done()).catch(done);
            });
        });
        it('should list all data', () => __awaiter(this, void 0, void 0, function* () {
            datatable_1.default.configure({ logger: nologger });
            return model.dataTable(query, {}).then((data) => {
                expect(data).to.not.be.null;
                expect(data.draw).to.be.equals('2');
                expect(data.data).to.have.lengthOf(5);
            });
        }));
        after(() => {
            mongoose.connection.close();
        });
    });
});
//# sourceMappingURL=datatable.spec.js.map