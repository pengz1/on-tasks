// Copyright 2017, Dell EMC, Inc.

'use strict';

var di = require('di');

module.exports = ucsJobFactory;
di.annotate(ucsJobFactory, new di.Provide('Job.Ucs'));
di.annotate(ucsJobFactory, new di.Inject(
    'Job.Base',
    'Logger',
    'Util',
    'Promise',
    'Services.Waterline',
    'JobUtils.UcsTool',
    'Services.Configuration',
    'Services.Encryption',
    'Errors'));

function ucsJobFactory(
    BaseJob,
    Logger,
    util,
    Promise,
    waterline,
    UcsTool,
    configuration,
    encryption,
    errors) {
    var logger = Logger.initialize(ucsJobFactory);

    /**
     *
     * @param {Object} options
     * @param {Object} context
     * @param {String} taskId
     * @constructor
     */
    function UcsJob(options, context, taskId) {
        UcsJob.super_.call(this, logger, options, context, taskId);
        this.routingKey = options.serviceId || context.graphId;
        this.nodeId = options.nodeId;
    }

    util.inherits(UcsJob, BaseJob);

    /**
     * Initialize basic configuration for the job.
     **/
    UcsJob.prototype.initJob = function(data) {
        var self = this;

        return waterline.obms.findByNode(data.node, 'ucs-obm-service', true)
            .then(function(obm) {
                if (!obm) {
                    throw new errors.NotFoundError('Failed to find ucs obm settings');
                }
                self.userConfig = {
                    "ucsUser": obm.config.ucsUser,
                    "ucsPassword": encryption.decrypt(obm.config.ucsPassword),
                    "ucsHost": obm.config.ucsHost
                };
            });
    };

    /**
     * @function _run
     * @description the jobs internal run method
     **/
    UcsJob.prototype._run = function() {
        var self = this;

        return waterline.workitems.update({
                name: "Pollers.UCS"
            }, {
                failureCount: 0
            })
            .then(function() {
                return self._subscribeUcsCommand(self.routingKey, function(data) {
                    return Promise.resolve(self.initJob(data))
                        .then(function() {
                            return self.getPowerMonitoring();
                        })
                        .then(function(result) {
                            data.result = result.body;
                            return self._publishUcsCommandResult(
                                self.routingKey, data.config.command, data);
                        })
                        .then(function() {
                            return waterline.workitems.findOne({
                                id: data.workItemId
                            });
                        })
                        .then(function(workitem) {
                            return waterline.workitems.setSucceeded(null, null, workitem);
                        });
                });
            });
    };

    return UcsJob;
}
