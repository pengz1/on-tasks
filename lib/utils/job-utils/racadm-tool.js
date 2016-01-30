// Copyright 2015, EMC, Inc.

'use strict';

var fs = require('fs');
var child_process = require('child_process'); // jshint ignore:line

var di = require('di');

module.exports = racadmFactory;
di.annotate(racadmFactory, new di.Provide('JobUtils.RacadmTool'));
di.annotate(racadmFactory, new di.Inject('Promise', 'JobUtils.RacadmCommandParser'));
function racadmFactory(Promise, racadmParser) {

    //function cifsShareFolder(){}

    function  RacadmTool() {
        this.shareFolderUser = 'onrack';
        this.shareFolderPassword = 'onrack';
        this.retries = 8;
    }
    /*
    Wrapper utility for shelling out and using racadm tool to interact
    with a network attached Dell iDRAC

    usage: racadm [options...] <command>

    -r hostname    Remote host name for LAN interface
    -u username    Remote session username
    -p password    Remote session password

    Some commands like "racadm get -f" might take dozens of seconds,
    timeout is requireed in this case.
    */
    RacadmTool.prototype.runCommand = function(host, user, password, command) {
        return new Promise(function (resolve, reject) {
            fs.exists('/opt/dell/srvadmin/sbin/racadm', function(exists) {
                if (!exists) {
                    reject("racadm tool isn't hosted on the local machine" +
                                        " at /opt/dell/srvadmin/sbin/racadm");
                    return;
                }
                var timeout = 60000;
                var options = { timeout: timeout };
                if (host && user && password && command) {
                    child_process.exec( // jshint ignore:line
                            '/opt/dell/srvadmin/sbin/racadm -u '+user+
                                ' -r '+host+' -p '+password+" " + command,
                            options,
                            function(error, stdout, stderr) {
                                if (error) {
                                    error.stderr = stderr;
                                    reject(error);
                                } else {
                                    resolve(stdout);
                                }
                    });
                } else {
                    if (!host && command) {
                        child_process.exec('/opt/dell/srvadmin/sbin/racadm ' + command, // jshint ignore:line
                            options,
                            function(error, stdout, stderr) {
                                if (error) {
                                    error.stderr = stderr;
                                    reject(error);
                                } else {
                                    resolve(stdout);
                                }
                            });
                    } else if (!user) {
                        reject("user not defined");
                    } else if (!password) {
                        reject("password not defined");
                    } else {
                        reject("command not defined");
                    }
                }
            });
        });
    };

    /**
     * Returns a promise with the results or errors of enabling IPMI over lan
     *
     * @param host
     * @param user
     * @param password
     * @param count
     */
    RacadmTool.prototype.enableIpmi = function(host, user, password) {
        return this.runCommand(host, user, password, "set iDRAC.IPMILan.Enable 1");
    };

    /**
     * Returns a promise with the results or errors of disabling IPMI over lan
     *
     * @param host
     * @param user
     * @param password
     * @param count
     */
    RacadmTool.prototype.disableIpmi = function(host, user, password) {
        return this.runCommand(host, user, password, "set iDRAC.IPMILan.Enable 0");
    };

    /**
     * Returns a promise with the software inventory
     *
     * @param host
     * @param user
     * @param password
     */
    RacadmTool.prototype.getSoftwareList = function(host, user, password) {
        //return this.runCommand(host, user, password, "swinvetory");
        this.runCommand(host, user, password, "swinventory")
            .then(function(consoleOutput){
                return Promise.resolve({softwareInventory: racadmParser.softwareListData(consoleOutput)});
            })
            .catch(function(err){
                return Promise.resolve({error: err});
            });
    };

    /**
     * Returns a promise with the software inventory
     *
     * @param host
     * @param user
     * @param password
     * @param jobId -  job id created by iDRAC
     */
    RacadmTool.prototype.getJobStatus = function(host, user, password, jobId) {
        this.runCommand(host, user, password, "jobqueue -i view " + jobId)
            .then(function(consoleOutput){
                return Promise.resolve({jobStatus: racadmParser.getJobStatus(consoleOutput)});
            })
            .catch(function(err){
                return Promise.resolve({error: err});
            });
    };

    RacadmTool.prototype.waitJobDone = function(host, user, password, jobId, retryCount, delay) {
        var self = this;
        //for (var i = 0; i<retries; i+=1) {
        self.getJobStatus(host,user,password,jobId)
            .then(function(out){
                if (out.jobStatus.status === 'Completed'){
                    return Promise.resolve(out);
                } else if (out.jobStatus.status === 'Failed'){
                    return Promise.resolve({error: 'Job Failed during process',
                    jobStatus: out.jobStatus});
                } else {
                    if (retryCount < self.retries) {
                        return Promise.delay(delay)
                            .then(function () {
                                retryCount += 1;
                                delay = 2 * delay;
                                return self.waitJobDone(host, user, password,
                                    jobId, retryCount, delay);
                            });
                    } else {
                        return Promise.resolve({error: 'Job Timeout',
                            jobStatus: out.jobStatus});
                    }
                }
            });
    };

    /**
     * Returns a promise with the results or errors of getting BIOS configure
     *
     * @param host
     * @param user
     * @param password
     * @param cifsConfig - Object includes samba password, username and bios.xml file path
     */

    RacadmTool.prototype.getBiosConfig = function(host, user, password, cifsConfig) {
        /*
        this.runCommand(host, user, password, "get -f bios.xml -c " + biosFqdd +
            " -u " + this.shareFolderUser + " -p " + this.shareFolderPassword + " -l " + path)
            .then(function(consoleOutput){
                var jobId = racadmParser.getJobId(consoleOutput).jobId;
                this.getJobStatus();
            });
            */
    };

    /**
     * Returns a promise with the results or errors of getting RAID configure
     *
     * @param host
     * @param user
     * @param password
     * @param raidFqdd - RAID full qualified (Dell) device descriptor, FQDD
     * @param path - CIFS/NFS share folder path
     */
    RacadmTool.prototype.getRaidConfig = function(host, user, password, raidFqdd, path) {
        return this.runCommand(host, user, password, "get -f raid.xml -c " + raidFqdd +
            " -u " + this.shareFolderUser + " -p " + this.shareFolderPassword + " -l " + path);
    };

    /**
     * Returns a promise with the results or errors of getting all server configure
     *
     * @param host
     * @param user
     * @param password
     * @param path - path to store xml file
     */
    RacadmTool.prototype.getAllConfig = function(host, user, password, path) {
        if (path.indexOf('//') === 0) {
            return this.runCommand(host, user, password, "get -f config.xml -t xml -u " +
                this.shareFolderUser + " -p " + this.shareFolderPassword + " -l " + path);
        } else{
            return this.runCommand(host, user, password, "get -f " + path + "/config.xml -t xml");
        }
    };

    /**
     * Returns a promise with the results or errors of setting BIOS configure
     *
     * @param host
     * @param user
     * @param password
     * @param cifsConfig - Object includes samba password, username and bios.xml file path
     */
    RacadmTool.prototype.setBiosConfig = function(host, user, password, cifsConfig) {
        var commandPromise, command ='';
        var cifsUser = cifsConfig.user || this.shareFolderUser,
            cifsPassword = cifsConfig.password || this.shareFolderPassword;
        if (!cifsConfig.filePath){
            return Promise.resolve({ error: 'XML file path is invalid'});
        }

        var filePath = cifsConfig.filePath,
            filename = cifsConfig.filePath.slice(filePath.lastIndexOf('/')+1),
            path = cifsConfig.filePath.slice(0, filePath.lastIndexOf('/'));
        if (cifsConfig.filePath.indexOf('//') === 0) {
            command = "set -f " + filename + " -t xml " +
                " -u " + cifsUser + " -p " + cifsPassword + " -l " + path;
        } else if (cifsConfig.filePath.indexOf('/') === 0) {
            command = "set -f " + path + "/" + filename + " -t xml";
        } else {
            return Promise.resolve({ error: 'XML file path is invalid'});
        }
        console.log(racadmParser.getJobId('JID_123131'));

        return this.runCommand(host, user, password, command)
            .then(function(consoleOutput){
                console.log("------------Get consoleOutupt----------------");
                console.log(consoleOutput);
                return racadmParser.getJobId(consoleOutput);
            })
            .then(function(jobId){
                console.log("============Got JobID=============" + jobId);
                return this.waitJobDone(host, user, password, jobId, 0, 500);
            })
            .catch(function(err){
                return Promise.resolve({error: err});
            });

    };

    /**
     * Returns a promise with the results or errors of invoking identify on
     *
     * @param host
     * @param user
     * @param password
     */
    /*RacadmTool.prototype.setRaidConfig = function(host, user, password) {
        return this.runCommand(host, user, password, "chassis identify on");
    };*/

    /**
     * Returns a promise with the results or errors of setting all server configure
     *
     * @param host
     * @param user
     * @param password
     * @param path - path that stores configure.xml file
     */
    RacadmTool.prototype.setAllConfig = function(host, user, password, path) {
        if (path.indexOf('//') === 0) {
            return this.runCommand(host, user, password, "set -f config.xml -u " +
                this.shareFolderUser + " -p " + this.shareFolderPassword + " -l " + path);
        } else{
            return this.runCommand(host, user, password, "set -f " + path + "/config.xml");
        }
    };

    /**
     * Returns a promise with the results or errors of updating iDRAC firmware
     *
     * @param host
     * @param user
     * @param password
     * @param path - image path
     */
    RacadmTool.prototype.updateIdracFirmware = function(host, user, password, path) {
        return this.runCommand(host, user, password, "update -f firming.d7 -u " +
            this.shareFolderUser + " -p " + this.shareFolderPassword + " -l " + path);
    };

    /**
     * Returns a promise with the results or errors of invoking -v sdr -c
     *
     * @param host
     * @param user
     * @param password
     */
    /*RacadmTool.prototype.updateBios = function(host, user, password) {
        return this.runCommand(host, user, password, "-v sdr");
    };*/

    /**
     * Returns a promise with the results or errors of invoking sel
     *
     * @param host
     * @param user
     * @param password
     */
    /*RacadmTool.prototype.updateRaidFirmware = function(host, user, password) {
        return this.runCommand(host, user, password, "sel");
    };*/

    return new RacadmTool();
}
