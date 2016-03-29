// Copyright 2015, EMC, Inc.
/* jshint node:true */
'use strict';

describe("Task", function () {
    var Task;
    var taskData;
    var noopTask;
    var baseNoopTask;
    var noopDefinition;
    var Promise;
    var Constants;
    var taskProtocol = {};
    var _;

    function literalCompare(objA, objB) {
        _.forEach(objA, function(v, k) {
            if (_.contains(['renderContext', 'subscriptions' ,'_events', '_cancellable'], k)) {
                return;
            }
            if (typeof v === 'object') {
                literalCompare(v, objB[k]);
            } else {
                expect(v).to.deep.equal(objB[k]);
            }
        });
    }

    before('task-spec before', function() {
        this.timeout(5000);
        var taskModule = helper.require('/index');
        helper.setupInjector([
            taskModule.injectables,
            helper.di.simpleWrapper({}, 'Protocol.Events'),
            helper.di.simpleWrapper(taskProtocol, 'Protocol.Task')
        ]);
        Constants = helper.injector.get('Constants');
        Promise = helper.injector.get('Promise');
        var Logger = helper.injector.get('Logger');
        Logger.prototype.log = sinon.spy();
        Task = helper.injector.get('Task.Task');
        _ = helper.injector.get('_');
        taskData = helper.injector.get('Task.taskLibrary');

        _.forEach(taskData, function(definition) {
            if (definition.injectableName === 'Task.noop') {
                noopTask = definition;
            } else if (definition.injectableName === 'Task.Base.noop') {
                baseNoopTask = definition;
            }
        });

        expect(noopTask).to.not.be.empty;
        expect(baseNoopTask).to.not.be.empty;

        noopDefinition = _.merge(noopTask, baseNoopTask);
    });

    beforeEach('task-spec beforeEach', function() {
        this.sandbox = sinon.sandbox.create();
    });

    afterEach('task-spec beforeEach', function() {
        this.sandbox.restore();
    });

    describe("option rendering", function() {
        var definition;

        before(function() {
            definition = _.cloneDeep(noopDefinition);
        });

        beforeEach(function() {
            definition.options = null;
        });

        it("should render definition options", function() {
            definition.options = {
                testRenderVal: 'test rendered',
                toRenderVal: 'val: {{ options.testRenderVal }}'
            };
            var task = Task.create(definition, {}, {});
            return task.run().then(function() {
                expect(task.options.toRenderVal).to.equal(
                    'val: ' + definition.options.testRenderVal);
            });
        });

        it("should render options using the '|' helper encapsulated by spaces", function() {
            definition.options = {
                toRenderVal: 'val: {{ options.doesNotExist | DEFAULT }}'
            };
            var task = Task.create(definition, {}, {});
            return task.run().then(function() {
                expect(task.options.toRenderVal).to.equal('val: DEFAULT');
            });
        });

        it("should render options using the '||' helper", function() {
            definition.options = {
                toRenderVal: 'val: {{ options.doesNotExist || DEFAULT }}'
            };
            var task = Task.create(definition, {}, {});
            return task.run().then(function () {
                expect(task.options.toRenderVal).to.equal('val: DEFAULT');
            });
        });

        it("should render options using the '|' helper not encapsulated by spaces", function() {
            definition.options = {
                toRenderVal: 'val: {{ options.doesNotExist|DEFAULT }}'
            };
            var task = Task.create(definition, {}, {});
            return task.run().then(function() {
                expect(task.options.toRenderVal).to.equal('val: DEFAULT');
            });
        });

        it("should render options with multiple '|' helpers", function() {
            definition.options = {
                toRenderVal: 'val: {{ options.doesNotExist | options.stillNotThere | DEFAULT }}'
            };
            var task = Task.create(definition, {}, {});
            return task.run().then(function() {
                expect(task.options.toRenderVal).to.equal('val: DEFAULT');
            });
        });

        it("should render options with multiple '|' helpers, spaces, and newlines", function() {
            definition.options = {
                toRenderVal: 'val: {{ ' +
                'options.doesNotExist | ' +
                'options.stillNotThere | ' +
                'DEFAULT }}'
            };
            var task = Task.create(definition, {}, {});
            return task.run().then(function() {
                expect(task.options.toRenderVal).to.equal('val: DEFAULT');
            });
        });

        it("should render values from a nested option definition", function() {
            definition.options = {
                renderOptions: {
                    testRenderVal: 'test rendered'
                },
                toRenderVal: 'val: {{ options.renderOptions.testRenderVal }}'
            };
            var task = Task.create(definition, {}, {});
            return task.run().then(function() {
                expect(task.options.toRenderVal)
                    .to.equal('val: ' + definition.options.renderOptions.testRenderVal);
            });
        });

        it("should render values from an array", function() {
            definition.options = {
                testRenderVal1: 'test rendered 1',
                testRenderVal2: 'test rendered 2',
                toRenderVal: [
                    'val1: {{ options.testRenderVal1 }}',
                    'val2: {{ options.testRenderVal2 }}'
                ]
            };
            var task = Task.create(definition, {}, {});
            return task.run().then(function() {
                expect(task.options.toRenderVal).to.deep.equal([
                    'val1: ' + definition.options.testRenderVal1,
                    'val2: ' + definition.options.testRenderVal2
                ]);
            });
        });

        it("should render values within a nested option definition", function() {
            definition.options = {
                testRenderVal1: 'test rendered 1',
                testRenderVal2: 'test rendered 2',
                toRenderObject: {
                    toRenderArray: [
                        'val1: {{ options.testRenderVal1 }}',
                        'val2: {{ options.testRenderVal2 }}'
                    ],
                    toRenderVal: {
                        toRenderValNested: '{{ options.testRenderVal1 }}'
                    }
                }
            };
            var task = Task.create(definition, {}, {});
            return task.run().then(function() {
                expect(task.options.toRenderObject.toRenderArray).to.deep.equal([
                    'val1: ' + definition.options.testRenderVal1,
                    'val2: ' + definition.options.testRenderVal2
                ]);
                expect(task.options.toRenderObject.toRenderVal.toRenderValNested)
                    .to.equal(definition.options.testRenderVal1);
            });
        });

        it("should render own instance values", function() {
            definition.options = {
                instanceId: '{{ task.instanceId }}',
                nodeId: '{{ task.nodeId }}'
            };
            var env = helper.injector.get('Services.Environment');
            var task = Task.create(definition, {}, { target: 'testnodeid' });
            var getSkuId = this.sandbox.stub(task,'getSkuId');
            var subscription = {dispose: this.sandbox.stub()};
            taskProtocol.subscribeActiveTaskExists = this.sandbox.stub().resolves(subscription);
            getSkuId.resolves();
            this.sandbox.stub(env,'get').withArgs(
                'config',{},['global']).resolves();
            return task.run().then(function() {
                expect(task.options.instanceId).to.be.ok.and.to.equal(task.instanceId);
                expect(task.options.nodeId).to.be.ok.and.to.equal(task.nodeId);
            });
        });

        it("should render api and server values", function() {
            Task.configCache = {
                testConfigValue: 'test config value',
                apiServerAddress: '10.1.1.1',
                apiServerPort: '80'
            };

            var server = 'http://%s:%s'.format(
                Task.configCache.apiServerAddress,
                Task.configCache.apiServerPort
            );

            definition.options = {
                server: '{{ api.server }}',
                baseRoute: '{{ api.base }}',
                filesRoute: '{{ api.files }}',
                nodesRoute: '{{ api.nodes }}',
                testConfigValue: 'test: {{ server.testConfigValue }}'
            };
            var task = Task.create(definition, {}, {});

            return task.run().then(function() {
                expect(task.options.server).to.equal(server);
                expect(task.options.baseRoute).to.equal(server + '/api/current');
                expect(task.options.filesRoute).to.equal(server + '/api/current/files');
                expect(task.options.nodesRoute).to.equal(server + '/api/current/nodes');
                expect(task.options.testConfigValue)
                    .to.equal('test: ' + Task.configCache.testConfigValue);
            });
        });

        it("should render nested templates", function() {
            definition.options = {
                sourceValue: 'source value',
                nested1: '{{ options.sourceValue }}',
                nested2: '{{ options.nested1 }}',
                nested3: '{{ options.nested2 }}'
            };
            var task = Task.create(definition, {}, {});
            return task.run().then(function() {
                expect(task.options.nested1).to.equal(definition.options.sourceValue);
                expect(task.options.nested2).to.equal(definition.options.sourceValue);
                expect(task.options.nested3).to.equal(definition.options.sourceValue);
            });
        });

        it("should render iteration templates", function() {
            definition.options = {
                testList: [
                    {
                        name: 'item 1'
                    },
                    {
                        name: 'item 2'
                    },
                    {
                        name: 'item 3'
                    }
                ],
                testVal: '{{#options.testList}}{{ name }}.{{/options.testList}}'
            };
            var task = Task.create(definition, {}, {});
            var tempList = _.transform(definition.options.testList, function (result, n) {
                result.push(n.name);
            });
            return task.run().then(function() {
                expect(task.options.testVal).to.equal(tempList.join('.') + '.');
            });
        });

        it("should render condition templates", function() {
            definition.options = {
                testSrc1: 'Test source 1 exist',
                testVal1: '{{#options.testSrc1}}{{ options.testSrc1 }}{{/options.testSrc1}}',
                testVal2: '{{#options.testSrc2}}{{ options.testSrc2 }}{{/options.testSrc2}}'
            };
            var task = Task.create(definition, {}, {});
            return task.run().then(function() {
                expect(task.options.testVal1).to.equal(definition.options.testSrc1);
                expect(task.options.testVal2).to.equal('');
            });
        });

        describe('errors', function() {
            var TemplateRenderError;

            before('Task option rendering errors', function() {
                TemplateRenderError = helper.injector.get('Errors').TemplateRenderError;
            });
        });
    });

    describe("serialization", function() {
        it("should serialize to a JSON object", function() {
            var task = Task.create(noopDefinition, {}, {});
            expect(task).to.have.property('serialize');

            literalCompare(task, task.serialize());
        });

        it("should serialize to a JSON string", function() {
            var taskJson;
            var task = Task.create(noopDefinition, {}, {});

            expect(task).to.have.property('serialize').that.is.a('function');
            expect(function() {
                taskJson = JSON.stringify(task);
            }).to.not.throw(Error);

            var parsed = JSON.parse(taskJson);

            // Re-add properties removed from the serialized object
            // just so our deep.equal comparison is easier.
            parsed.subscriptions = task.subscriptions;
            parsed._jobPromise = task._jobPromise;
            parsed._resolver = task._resolver;

            //expect(task).to.deep.equal(parsed);
            literalCompare(task, parsed);
        });

        it("should serialize a job for an instance", function() {
            var task = Task.create(noopDefinition, {}, {});
            task.instantiateJob();
            expect(task.serialize().job).to.deep.equal(task.job.serialize());
        });
    });
    describe("sku rendering", function() {
        var definition;
        var _nodeId;

        beforeEach(function() {
            definition = _.cloneDeep(noopDefinition);
        });

        it("should render env options if sku id isn't valid", function() {
            var env = helper.injector.get('Services.Environment');
            definition.options = {
                testRenderVal: 'test rendered',
                vendor:'{{env.vendorName}}',
                partNumber:'{{env.detailedInfo.partNumber}}',
                userName:'{{env.detailedInfo.users.name}}'
            };
            _nodeId = '47bd8fb80abc5a6b5e7b10df';
            var task = Task.create(definition, {}, {target: _nodeId});
            var getSkuId = this.sandbox.stub(task,'getSkuId');
            getSkuId.resolves();
            this.sandbox.stub(env,'get').withArgs(
                'config',{},['global']).resolves(
                {"vendorName":'emc',
                    "detailedInfo":{
                        "partNumber":"PN12345",
                        "serialNumber": "SN12345",
                        "users":{
                            "sex":"male",
                            "name":"Frank"
                        }
                    }
                }
            );
            return task.run().then(function()
            {   expect(task.getSkuId).to.have.been.calledOnce;
                expect(env.get).to.have.been.calledOnce;
                expect(task.options.vendor).to.equal('emc');
                expect(task.options.partNumber).to.equal('PN12345');
                expect(task.options.userName).to.equal('Frank');
            });
        });

        it("should render sku and env options if sku id is valid", function() {
            var env = helper.injector.get('Services.Environment');
            definition.options = {
                testRenderVal: 'test rendered',
                vendor:'{{envConfig.vendorName}}',
                partNumber:'{{envConfig.detailedInfo.partNumber}}',
                userName:'{{envConfig.detailedInfo.users.name}}',
                productName:'{{skuConfig.productName}}',
                chassisType:'{{skuConfig.chassisInfo.chassisType}}',
                diskNumber:'{{skuConfig.chassisInfo.diskInfo.diskNumber}}'

            };
            _nodeId = '47bd8fb80abc5a6b5e7b10df';
            var task = Task.create(definition, {}, {target: _nodeId});
            var getSkuId = this.sandbox.stub(task,'getSkuId');
            getSkuId.resolves('sku12345');
            var envGetStub = this.sandbox.stub(env, 'get');
            envGetStub.withArgs('config',{},['sku12345']).resolves(
                {"productName":'viper',
                    "chassisInfo": {
                        "chassisType": 'DAE',
                        "diskInfo":
                        {
                            "diskNumber":'24',
                            "diskType":"SSD"
                        }
                    }
                }
            );
            envGetStub.withArgs('config',{},['sku12345','global']).resolves(
                {"vendorName":'emc',
                    "detailedInfo":{
                        "partNumber":"PN12345",
                        "serialNumber": "SN12345",
                        "users":{
                            "sex":"male",
                            "name":"Frank"
                        }
                    }
                }
            );
            return task.run().then(function()
            {   expect(task.getSkuId).to.have.been.calledOnce;
                expect(env.get).to.have.been.calledTwice;
                expect(task.options.vendor).to.equal('emc');
                expect(task.options.partNumber).to.equal('PN12345');
                expect(task.options.userName).to.equal('Frank');
                expect(task.options.productName).to.equal('viper');
                expect(task.options.chassisType).to.equal('DAE');
                expect(task.options.diskNumber).to.equal('24');
            });
        });

    });

    describe("cancellation/completion", function() {
        var task;
        var eventsProtocol;
        var subscriptionStub;
        var Errors;

        before('task-spec cancellation before', function() {
            eventsProtocol = helper.injector.get('Protocol.Events');
            eventsProtocol.publishTaskFinished = sinon.stub().resolves();
            subscriptionStub = { dispose: sinon.stub().resolves() };
            Errors = helper.injector.get('Errors');
        });

        beforeEach('task-spec-cancellation beforeEach', function() {
            subscriptionStub.dispose.reset();
            eventsProtocol.publishTaskFinished.reset();

            var env = helper.injector.get('Services.Environment');
            task = Task.create(noopDefinition, {}, {});
            var getSkuId = sinon.stub(task,'getSkuId');
            var subscription = {dispose: sinon.stub()};
            taskProtocol.subscribeActiveTaskExists = sinon.stub().resolves(subscription);
            getSkuId.resolves();
            this.sandbox.stub(env,'get').withArgs(
                'config',{},['global']).resolves();

            task.subscriptions = {
                run: subscriptionStub,
                cancel: subscriptionStub
            };
            sinon.spy(task, 'cancel');
            sinon.spy(task, 'stop');
        });

        describe("of task", function() {

            it("should cancel before it has been set to run", function(done) {
                var error = new Errors.TaskCancellationError('test error');
                task.cancel(error);

                setImmediate(function() {
                    try {
                        expect(task.state).to.equal('cancelled');
                        expect(task.error).to.equal(error);
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            });

            it("should cancel", function() {
                task.instantiateJob();
                var error = new Errors.TaskCancellationError('test error');
                task.instantiateJob = function() {
                    task.cancel(error);
                };

                sinon.spy(task.job, 'cancel');
                task.job._run = function() {
                    return Promise.delay(1000);
                };

                return task.run()
                    .then(function() {
                        expect(task.state).to.equal('cancelled');
                        expect(task.error).to.equal(error);
                        expect(task.job.cancel).to.have.been.calledOnce;
                    });
            });

            it("should timeout", function() {
                task.instantiateJob();
                var error = new Errors.TaskTimeoutError('test timeout error');
                task.instantiateJob = function() {
                    task.cancel(error);
                };

                sinon.spy(task.job, 'cancel');
                task.job._run = function() {
                    return Promise.delay(100);
                };

                return task.run()
                    .then(function() {
                        expect(task.state).to.equal('timeout');
                        expect(task.error).to.equal(error);
                        expect(task.job.cancel).to.have.been.calledOnce;
                    });
            });

            it("should cancel on failure to instantiate a job", function() {
                var error = new Error('test instantiate job error');
                task.job = undefined;
                task.instantiateJob = sinon.stub().throws(error);

                return task.run()
                    .then(function() {
                        expect(task.state).to.equal('failed');
                        expect(task.error).to.equal(error);
                    });
            });
        });

        describe("of job", function() {
            beforeEach('task-spec-job-cancellation beforeEach', function() {
                task.instantiateJob();
                sinon.spy(task.job, 'cancel');
                sinon.spy(task.job, '_done');
                task.job._run = function() {
                    return Promise.delay(100);
                };
            });

            it("should cancel a job", function() {
                var error = new Errors.TaskCancellationError('test error');
                task.instantiateJob = function() {
                    task.cancel(error);
                };

                return task.run()
                    .then(function() {
                        expect(task.job.cancel).to.have.been.calledOnce;
                        expect(task.job.cancel).to.have.been.calledWith(error);
                        expect(task.job._done).to.have.been.calledOnce;
                        expect(task.job._done).to.have.been.calledWith(error);
                    });
            });

            it("should manage subscription resource creation and deletion", function() {
                task.instantiateJob = function() {
                    task.cancel(new Errors.TaskCancellationError('test error'));
                };
                task.job.context.target = 'testtarget';
                var subscription = {dispose: this.sandbox.stub()};
                taskProtocol.subscribeActiveTaskExists = sinon.stub().resolves(subscription);
                task.job._subscribeActiveTaskExists = sinon.stub().resolves();
                var jobSubscriptionStub = { dispose: sinon.stub().resolves() };
                task.job.subscriptions = [
                    jobSubscriptionStub, jobSubscriptionStub, jobSubscriptionStub
                ];


                return task.run()
                    .then(function() {
                        expect(task.job._subscribeActiveTaskExists).to.have.been.calledOnce;
                        expect(jobSubscriptionStub.dispose).to.have.been.calledThrice;
                    });
            });
        });
    });
});
