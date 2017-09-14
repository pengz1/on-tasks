'use strict';

var uuid = require('node-uuid'),
    // events = require('events'),
    waterline = {},
    sandbox = sinon.sandbox.create(),
    ucsJob,
    ucsTool,
    data = {
        config: {
            command: 'ucs.powerthermal'
        },
        workItemId: 'testworkitemid',
        node: '12345678'
    },
    obmConfig = {
        config: {
            dn: 'sys/chassis-1/blade-2'
        }
    },
    ucsResponseData = {
        "memoryUnitEnvStats": [{
                "child_action": null,
                "dn": "sys/chassis-1/blade-2/board/memarray-1/mem-1/dimm-env-stats",
                "intervals": "58982460",
                "rn": "dimm-env-stats"
            },
            {
                "child_action": null,
                "dn": "sys/chassis-1/blade-2/board/memarray-1/mem-4/dimm-env-stats",
                "intervals": "58982460",
                "rn": "dimm-env-stats"
            }
        ],
        "processorEnvStats": [{
                "child_action": null,
                "dn": "sys/chassis-1/blade-2/board/cpu-1/env-stats"
            },
            {
                "child_action": null,
                "dn": "sys/chassis-1/blade-2/board/cpu-2/env-stats"
            }
        ]
    };

describe('Job.Ucs', function() {
    var base = require('./base-spec');

    base.before(function(context) {
        helper.setupInjector([
            helper.require('/spec/mocks/logger.js'),
            helper.requireGlob('/lib/services/*.js'),
            helper.require('/lib/jobs/base-job.js'),
            helper.require('/lib/jobs/ucs-job.js'),
            helper.require('/lib/utils/job-utils/ucs-tool.js'),
            helper.di.simpleWrapper(waterline, 'Services.Waterline')
        ]);
        context.Jobclass = helper.injector.get('Job.Ucs');
    });

    describe('Base', function() {
        base.examples();
    });

    describe('ucs-job', function() {
        // var testEmitter = new events.EventEmitter();
        beforeEach(function() {
            waterline.workitems = {
                update: sandbox.stub().resolves(),
                findOne: sandbox.stub().resolves(),
                setSucceeded: sandbox.stub().resolves()
            };

            waterline.obms = {
                findByNode: sandbox.stub().resolves(obmConfig)
            };

            var graphId = uuid.v4();
            ucsJob = new this.Jobclass({}, {
                graphId: graphId
            }, uuid.v4());

            ucsTool = {
                clientRequest: sandbox.stub().resolves({
                    body: ucsResponseData
                })
            };
            ucsJob._initUcsTool = sandbox.stub().returns(ucsTool);
            ucsJob._publishUcsCommandResult = sandbox.stub().resolves();
        });

        afterEach(function() {
            sandbox.reset();
        });

        it("should invoke ucsTool.clientRequest function to get ucs data from service.",
            function() {
                return ucsJob._subscribeUcsCallback(data)
                    .then(function() {
                        expect(ucsTool.clientRequest).to.have.been.calledOnce;
                    });
            });

        it("should reach upper limit of concurrent request pool and cannot add new one.",
            function() {
                var spy = sandbox.spy(ucsJob, 'addConcurrentRequest');
                ucsJob.maxConcurrent = -1;
                return ucsJob._subscribeUcsCallback(data)
                    .then(function() {
                        expect(spy).to.have.not.been.called;
                    });
            });

        it("should listen for ucs.powerthermal command requests", function() {
            ucsJob._subscribeUcsCommand = sandbox.stub();
            return ucsJob._run()
                .then(function() {
                    expect(waterline.workitems.update).to.have.been.calledOnce;
                    expect(ucsJob._subscribeUcsCommand).to.have.been.calledOnce;
                });
        });

        it("should not be allowed to exceed the concurrent of maximum limit.", function() {
            expect(ucsJob.concurrentRequests('node', 'type')).to.be.false;
            ucsJob.addConcurrentRequest('node', 'type');
            ucsJob.addConcurrentRequest('node', 'type');
            expect(ucsJob.concurrent.node.type).to.equal(2);
            expect(ucsJob.concurrentRequests('node', 'type')).to.be.true;
            ucsJob.removeConcurrentRequest('node', 'type');
            expect(ucsJob.concurrent.node.type).to.equal(1);
        });
    });
});
