
// Copyright 2015, EMC, Inc.
'use strict';

var di = require('di');

module.exports = secureEraseJobFactory;
di.annotate(secureEraseJobFactory, new di.Provide('Job.Secure.Erase'));
    di.annotate(secureEraseJobFactory,
    new di.Inject(
        'Job.Base',
        'Logger',
        'Assert',
        'Util',
        '_',
        'Services.Encryption',
        'Promise',
        'Job.Linux.Commands',
        'Services.Waterline'
    )
);

function secureEraseJobFactory(
    BaseJob,
    Logger,
    assert,
    util,
    _,
    encrypt,
    Promise,
    exeLinuxCommand,
    waterline
) {
    var logger = Logger.initialize(secureEraseJobFactory);

    /**
     *
     * @param {Object} options
     * @param {Object} context
     * @param {String} taskId
     * @constructor
     */
    function SecureEraseJob(options, context, taskId) {
        var self = this;
        SecureEraseJob.super_.call(self, logger, options, context, taskId);
        self.nodeId = self.context.target;
        self.profile = self.options.profile;
        //OS repository analyze job may pass some options via shared context
        //The value from shared context will override the value in self options.
        self.options = _.assign(self.options, context.repoOptions);

        this._validateOptions();
        this._convertOptions();
        this._encryptPassword();
        this._provideUserCredentials();
    }
    util.inherits(SecureEraseJob, BaseJob);

    SecureEraseJob.prototype.run= function() {
        var self=this;
        waterline.nodes.findByIdentifier(self.nodeId)
        .then(function(nodeId){
            self.validateDriveId();     
        })
        .then(function(driveIdTable){
            //logger if tools doesn't support such drives
        })
        .then(function(){
            self.validateSeMethod();
        })
        .then(function(){
            if 
        })
        .catch(){
        
        }
        
        
        
    };

    SecureEraseJob.prototype.sataHdparmErase = function(driveList) {
    };

    /**
     * @memberOf SecureEraseJob
     *
     * Convert the options
     */
    SecureEraseJob.prototype.scsiSanitizeErase = function(driveList) {
    };

    /**
     * @memberOf SecureEraseJob
     *
     * Encypt the input password.
     */
    SecureEraseJob.prototype.scsiFormatErase = function(driveList) {
    };

    /**
     * @memberof SecureEraseJob
     *
     * Convert the installDisk to correct format
     */
    SecureEraseJob.prototype.scrubErase = function(driveList) {
    };

    /**
     * @memberOf SecureEraseJob
     */
    SecureEraseJob.prototype._deleteHardRaid = function(driveList) {
    };

     /**
     * Search the driveid catalog and lookup the corresponding drive WWID of SATADOM
     * @param {Array} catalog - the catalog data of drive id
     * @param {Boolean} isEsx - True to return the ESXi formated wwid,
     *                          otherwise linux format wwid.
     * @return {String} The WWID of SATADOM. If failed, return null
     */
    SecureEraseJob.prototype._exeErase = function(driveList, tool) {
    };

     /**
     * Search the driveid catalog and lookup the corresponding drive WWID of SATADOM
     * @param {Array} catalog - the catalog data of drive id
     * @param {Boolean} isEsx - True to return the ESXi formated wwid,
     *                          otherwise linux format wwid.
     * @return {String} The WWID of SATADOM. If failed, return null
     */
    SecureEraseJob.prototype.validateOptions = function(option, id ) {
        var driveIdStatus={ "valide":, "invalide"};
        return driveIdStatus;
    };

    SecureEraseJob.prototype._run = function(driveList, nodeId) {
        var self = this;
        Promise.resolve()
        .then(function(){
            self.validateDriveId()
        })
        .then(function(){
            if ( !driveIdStatus.invalide ){
                logger.error();//A mechanism to return status?
            };
            assert.
        })
        .then(function(){
        })

    };

    return SecureEraseJob;
}
