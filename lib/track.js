var Ws           = require('ws'),
	EventEmitter = require('events').EventEmitter,
	util         = require('util'),
	uuid         = require('uuid'),
	JsonRPc      = require('jr2-helper'),
	utils        = require('./utils.js');

var JR_PROTOCOL = 'jsonrpc2';

var mix = utils.mix,
	Guard = utils.guard;

var protocolsHandle = function(protList, cb){
	if(protList.length){
		if(protList.indexOf(JR_PROTOCOL) > -1){
			cb(true, JR_PROTOCOL);
		} else {
			cb(true, protList[0] || undefined);
		}
	} else {
		cb(true, undefined);
	}
}

var msgParse = function(message, protocol){
	var message = message.toString();
	if(protocol === JR_PROTOCOL){
		return JsonRPc.parse(message, true);
	}
	return message;
}

var send = Ws.prototype.send;
mix(Ws.prototype, {
	_send : send,
	send  : function(msg){
		if(this.readyState === Ws.OPEN){
			this._send(msg);
		}
		this.guard.reset();
	}
}, true);

function Track(port, opts){
	if(!(this instanceof Track)){
		return new Track(port, opts);
	}
	this.init(port, opts);
}

util.inherits(Track, EventEmitter);
mix(Track.prototype, {
	init : function(port, opts){
		if (typeof port === 'object') {
			opts = port;
		}

		var opts = mix({
			timeout : 5,
			handleProtocols : protocolsHandle,
			msgParse : msgParse
		}, opts, true);
		mix(opts, {
			port : port
		});
		this.opts = opts;
		this.clients = {};

		var wss = new Ws.Server(opts);
		this.wss = wss;
		this.handles();
	},
	handles : function(){
		var self = this,
			wss  = this.wss;
		wss.on('headers', function(headersData){
			self.emit('headers', headersData);
		});
	},
	start : function(){
		var self     = this,
			opts     = this.opts,
			timeout  = opts.timeout,
			msgParse = opts.msgParse,
			wss      = this.wss;
		wss.on('connection', function(ws){
			var cid      = uuid.v4().replace(/-/g, ''),
				protocol = ws.protocol,
				guard    = Guard(timeout * 60 * 1000);
			
			ws.guard = guard;
			ws.cid   = cid;
			self.clients[cid] = ws;

			ws.on('error', function(message) {
				self.emit('clientError', {
					cid : cid,
					err : err
				});
			});
			ws.on('close', function() {
				self.clients[cid] = null;
				guard.stop();
				ws.guard = null;
				self.emit('clientClose', cid);
			});
			ws.on('message', function(message) {
				if(msgParse){
					message = msgParse(message, protocol);
				}
				self.emit('message', {
					cid : cid,
					msg : message
				});
				guard.reset();
			});

			guard.then(function(){
				ws.close();
			});

			self.emit('connection', cid);
		});		
	},
	sendTo : function(cids, msg){
		cids = util.isArray(cids) ? cids : [cids];
		for(var i = 0, l = cids.length; i < l; i++){
			var client = this.clients[cids[i]];
			client && client.send(msg);
		}
	},
	broadcast : function(msg) {
		var clientIds = Object.keys(this.clients);
		this.sendTo(clientIds, msg);
	},
	getWs : function(cid){
		var client = this.clients[cid];
		return client ? client : null;
	},
	getReq : function(cid){
		var client = this.clients[cid];
		return client ? client.upgradeReq : null;
	},
	close : function(cid, code, data){
		var client = this.clients[cid];
		client && client.close(code, data);
	},
	stop : function(){
		var cids = Object.keys(this.clients);
		for(var i = 0, l = cids.length; i < l; i++){
			var client = this.clients[cids[i]];
			client && client.close();
		}
		this.wss.close();
		this.wss = null;
	}
});

Track.JSONRPC2_ERROR_CODES = JsonRPc.ERROR_CODES;
Track.utils                = utils;

module.exports = Track;