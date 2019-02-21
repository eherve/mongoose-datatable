"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const datatable_1 = require("./datatable");
chai.use(chaiAsPromised);
const expect = chai.expect;
const data = {
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
        }, {
            'column': 1,
            'dir': 'desc'
        }, {
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
            expect(datatable_1.default.configure)
                .to.not.be.undefined;
        });
        it(`should return config`, function () {
            expect(datatable_1.default.config)
                .to.be.a('object');
        });
        it(`should set config`, function () {
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
    describe('dataTable', function () {
        datatable_1.default.dataTable(data);
    });
});

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q0FBQyxDQUFDO1lBQ3RDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztpQkFDdEMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNsQixNQUFNLENBQUMsS0FBSyxDQUFDO2lCQUNWLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdkIsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUNILFFBQVEsQ0FBQyxXQUFXLEVBQUU7UUFDcEIsbUJBQVMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUIsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsImZpbGUiOiJkYXRhdGFibGUuc3BlYy5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBjaGFpID0gcmVxdWlyZSgnY2hhaScpO1xuaW1wb3J0IGNoYWlBc1Byb21pc2VkID0gcmVxdWlyZSgnY2hhaS1hcy1wcm9taXNlZCcpO1xuaW1wb3J0IERhdGF0YWJsZSwgeyBJUXVlcnkgfSBmcm9tICcuL2RhdGF0YWJsZSc7XG5cbmNoYWkudXNlKGNoYWlBc1Byb21pc2VkKTtcbmNvbnN0IGV4cGVjdCA9IGNoYWkuZXhwZWN0O1xuXG5jb25zdCBkYXRhOiBJUXVlcnkgPSB7XG4gICdkcmF3JzogMixcbiAgJ2NvbHVtbnMnOiBbe1xuICAgICdkYXRhJzogJ2ZpcnN0X25hbWUnLFxuICAgICduYW1lJzogbnVsbCxcbiAgICAnc2VhcmNoYWJsZSc6IHRydWUsXG4gICAgJ29yZGVyYWJsZSc6IHRydWUsXG4gICAgJ3NlYXJjaCc6IHtcbiAgICAgICd2YWx1ZSc6ICd0ZXN0JyxcbiAgICAgICdyZWdleCc6IGZhbHNlXG4gICAgfVxuICB9LFxuICB7XG4gICAgJ2RhdGEnOiAnbGFzdF9uYW1lJyxcbiAgICAnbmFtZSc6IG51bGwsXG4gICAgJ3NlYXJjaGFibGUnOiBmYWxzZSxcbiAgICAnb3JkZXJhYmxlJzogdHJ1ZSxcbiAgICAnc2VhcmNoJzoge1xuICAgICAgJ3ZhbHVlJzogbnVsbCxcbiAgICAgICdyZWdleCc6IGZhbHNlXG4gICAgfVxuICB9LFxuICB7XG4gICAgJ2RhdGEnOiAncG9zaXRpb24nLFxuICAgICduYW1lJzogbnVsbCxcbiAgICAnc2VhcmNoYWJsZSc6IHRydWUsXG4gICAgJ29yZGVyYWJsZSc6IHRydWUsXG4gICAgJ3NlYXJjaCc6IHtcbiAgICAgICd2YWx1ZSc6IG51bGwsXG4gICAgICAncmVnZXgnOiBmYWxzZVxuICAgIH1cbiAgfSxcbiAge1xuICAgICdkYXRhJzogJ3N0YXJ0X2RhdGUnLFxuICAgICduYW1lJzogbnVsbCxcbiAgICAnc2VhcmNoYWJsZSc6IHRydWUsXG4gICAgJ29yZGVyYWJsZSc6IGZhbHNlLFxuICAgICdzZWFyY2gnOiB7XG4gICAgICAndmFsdWUnOiBudWxsLFxuICAgICAgJ3JlZ2V4JzogZmFsc2VcbiAgICB9XG4gIH1cbiAgXSxcbiAgJ29yZGVyJzogW3tcbiAgICAnY29sdW1uJzogMCxcbiAgICAnZGlyJzogJ2FzYydcbiAgfSx7XG4gICAgJ2NvbHVtbic6IDEsXG4gICAgJ2Rpcic6ICdkZXNjJ1xuICB9LHtcbiAgICAnY29sdW1uJzogMyxcbiAgICAnZGlyJzogJ2Rlc2MnXG4gIH1dLFxuICAnc3RhcnQnOiAxMCxcbiAgJ2xlbmd0aCc6IDEwLFxuICAnc2VhcmNoJzoge1xuICAgICd2YWx1ZSc6ICd0ZXN0IGdsb2JhbCBzZWFyY2gnLFxuICAgICdyZWdleCc6IGZhbHNlXG4gIH1cbn07XG5cbmRlc2NyaWJlKCdEYXRhdGFibGUgTW9kdWxlJywgZnVuY3Rpb24gKCkge1xuICBkZXNjcmliZSgnY29uZmlndXJlJywgZnVuY3Rpb24gKCkge1xuICAgIGl0KGBzaG91bGQgZXhpc3RzYCwgZnVuY3Rpb24gKCkge1xuICAgICAgZXhwZWN0KERhdGF0YWJsZS5jb25maWd1cmUpXG4gICAgICAgIC50by5ub3QuYmUudW5kZWZpbmVkO1xuICAgIH0pO1xuICAgIGl0KGBzaG91bGQgcmV0dXJuIGNvbmZpZ2AsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGV4cGVjdChEYXRhdGFibGUuY29uZmlnKVxuICAgICAgICAudG8uYmUuYSgnb2JqZWN0Jyk7XG4gICAgfSk7XG4gICAgaXQoYHNob3VsZCBzZXQgY29uZmlnYCwgZnVuY3Rpb24gKCkge1xuICAgICAgbGV0IGRlYnVnID0gJyc7XG4gICAgICBjb25zdCBsb2dnZXIgPSB7IGRlYnVnOiAoLi4uZGF0YTogYW55W10pID0+IGRlYnVnICs9IGRhdGEuam9pbignLCAnKSB9IGFzIGFueTtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IERhdGF0YWJsZS5jb25maWd1cmUoeyBsb2dnZXIgfSk7XG4gICAgICBleHBlY3QoY29uZmlnKVxuICAgICAgICAudG8uaGF2ZS5wcm9wZXJ0eSgnbG9nZ2VyJywgbG9nZ2VyKTtcbiAgICAgIGV4cGVjdCgoKSA9PiBjb25maWcubG9nZ2VyLmRlYnVnKCd0ZXN0JykpXG4gICAgICAgIC50by5ub3QudGhyb3coKTtcbiAgICAgIGV4cGVjdChkZWJ1ZylcbiAgICAgICAgLnRvLmVxdWFscygndGVzdCcpO1xuICAgIH0pO1xuICB9KTtcbiAgZGVzY3JpYmUoJ2RhdGFUYWJsZScsIGZ1bmN0aW9uICgpIHtcbiAgICBEYXRhdGFibGUuZGF0YVRhYmxlKGRhdGEpO1xuICB9KTtcbn0pO1xuIl19
