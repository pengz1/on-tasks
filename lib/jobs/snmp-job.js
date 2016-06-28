// Copyright 2015, EMC, Inc.

'use strict';

var di = require('di');

module.exports = snmpJobFactory;
di.annotate(snmpJobFactory, new di.Provide('Job.Snmp'));
di.annotate(snmpJobFactory, new di.Inject(
    'Job.Base',
    'JobUtils.Snmptool',
    'Constants',
    'Logger',
    'Util',
    'Assert',
    'Promise',
    '_',
    'Services.Waterline',
    di.Injector,
    'Protocol.Events'
));

function snmpJobFactory(
    BaseJob,
    SnmpTool,
    Constants,
    Logger,
    util,
    assert,
    Promise,
    _,
    waterline,
    injector,
    protocolEvents
) {
    var logger = Logger.initialize(snmpJobFactory);

    /**
     *
     * @param {Object} options
     * @param {Object} context
     * @param {String} taskId
     * @constructor
     */
    function SnmpJob(options, context, taskId) {
        SnmpJob.super_.call(this, logger, options, context, taskId);
        this.concurrent = {};
        this.maxConcurrent = 1;
        this.routingKey = context.graphId;
        assert.uuid(this.routingKey);
    }

    util.inherits(SnmpJob, BaseJob);

    SnmpJob.prototype.concurrentRequests = function(host, workItemId) {
        assert.string(host);
        assert.string(workItemId);
        if(!_.has(this.concurrent, host)){
            this.concurrent[host] = {};
        }
        if(!_.has(this.concurrent[host], workItemId)){
            this.concurrent[host][workItemId] = 0;
        }
        if(this.concurrent[host][workItemId] >= this.maxConcurrent){
            return true;
        } else {
            return false;
        }
    };

    SnmpJob.prototype.addConcurrentRequest = function(host, workItemId) {
        assert.number(this.concurrent[host][workItemId]);
        this.concurrent[host][workItemId] += 1;
    };

    SnmpJob.prototype.removeConcurrentRequest = function(host, workItemId) {
        assert.number(this.concurrent[host][workItemId]);
        this.concurrent[host][workItemId] -= 1;
    };


    /**
     * @memberOf SnmpJob
     */
    SnmpJob.prototype._run = function() {
        // NOTE: this job will run indefinitely absent user intervention
        var self = this;
        var snmpSubType = '';
        return waterline.workitems.update({name: "Pollers.SNMP"}, {failureCount: 0})
        .then(function() {
            self._subscribeRunSnmpCommand(self.routingKey, function(data) {
                if (self.concurrentRequests(data.host, data.workItemId)) {
                    return;
                }
                self.addConcurrentRequest(data.host, data.workItemId);
                assert.object(data.config, 'SNMP poller data config');
                return Promise.resolve()
                .then(function() {
                    if (data.config.metric) {
                        snmpSubType = "metric:" + data.config.metric;
                        return self._collectMetricData(data)
                        .then(function(result) {
                            data.result = result;
                            return self._publishMetricResult(self.routingKey,
                                    data.config.metric, data);
                        });
                    } else if (data.config.oids){
                        var snmptool = new SnmpTool(data.host, data.community);
                        var options = { numericOutput: true };
                        snmpSubType = "oids:" + data.config.metric;
                        return snmptool.collectHostSnmp(data.config.oids, options)
                        .then(function(result) {
                            data.result = result;
                            return self._publishSnmpCommandResult(self.routingKey, data);
                        });
                    } else {
                        throw new Error("Unknown poller implementation." +
                                   " No recognized config keys");
                    }
                })
                .then(function() {
                    return waterline.workitems.findOne({ id: data.workItemId });
                })
                .then(function(workitem) {
                    var workitemOld = workitem;
                    return Promise.resolve()
                        .then(function(){
                            if (workitemOld.failureCount > 0) {
                                return protocolEvents.publishNodeAlert(workitemOld.node,
                                    {nodeId: workitemOld.node,
                                        obmType: "snmp-obm-service",
                                        state: "accessible",
                                        snmpName: snmpSubType});
                            }
                        })
                        .tap(function(){
                            return waterline.workitems.setSucceeded(null, workitemOld);
                        });
                })
                .catch(function (err) {
                    logger.warning("Failed to capture data through SNMP.", {
                        data: data,
                        error: err
                    });
                    return waterline.workitems.findOne({ id: data.workItemId})
                        .then(function(workitem) {
                            var workitemOld = workitem;
                            return Promise.resolve()
                                .then(function(){
                                    //failure count ascends from 1
                                    if (workitemOld.failureCount === 1) {
                                        return protocolEvents.publishNodeAlert(workitemOld.node,
                                            {nodeId: workitemOld.node,
                                                obmType: "snmp-obm-service",
                                                state: "inaccessible",
                                                snmpName: snmpSubType});
                                    }
                                })
                                .tap(function(){
                                    return waterline.workitems.setFailed(null, workitemOld);
                                });
                        }); 
                })
                .finally(function() {
                    self.removeConcurrentRequest(data.host, data.workItemId);
                });
            });
        })
        .catch(function(err) {
            logger.error("Failed to initialize job", { error:err });
            self._done(err);
        });
    };

    /**
     * @memberOf SnmpJob
     */
    SnmpJob.prototype._collectMetricData = function(data) {
        assert.object(data);
        assert.object(data.config);
        assert.string(data.config.metric);
        var Metric, metric;

        switch (data.config.metric) {
            case Constants.WorkItems.Pollers.Metrics.SnmpInterfaceBandwidthUtilization:
                Metric = injector.get('JobUtils.Metrics.Snmp.InterfaceBandwidthUtilizationMetric');
                metric = new Metric(data.node, data.host, data.community, data.pollInterval);
                break;
            case Constants.WorkItems.Pollers.Metrics.SnmpInterfaceState:
                Metric = injector.get('JobUtils.Metrics.Snmp.InterfaceStateMetric');
                metric = new Metric(data.node, data.host, data.community);
                break;
            case Constants.WorkItems.Pollers.Metrics.SnmpProcessorLoad:
                Metric = injector.get('JobUtils.Metrics.Snmp.ProcessorLoadMetric');
                metric = new Metric(data.node, data.host, data.community);
                break;
            case Constants.WorkItems.Pollers.Metrics.SnmpMemoryUsage:
                Metric = injector.get('JobUtils.Metrics.Snmp.MemoryUsageMetric');
                metric = new Metric(data.node, data.host, data.community);
                break;
            case Constants.WorkItems.Pollers.Metrics.SnmpPduPowerStatus:
                Metric = injector.get('JobUtils.Metrics.Snmp.PduPowerMetric');
                metric = new Metric(data.node, data.host, data.community);
                break;

            default:
                throw new Error("Unknown poller metric name: " + data.config.metric);
        }

        return metric.collectMetricData(data);
    };

    return SnmpJob;
}
