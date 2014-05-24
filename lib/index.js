var utils        = require('./utils.js'),
	Track        = require('./track.js'),
	EventEmitter = require('events').EventEmitter,
	when         = require('when'),
	Musk         = require('musk'),
	path         = require('path'),
	fs           = require('fs'),
	util         = require('util'),
	Client       = Musk.Client,
	mix          = utils.mix;

function exit(msg){
	console.error(Array.prototype.join.call(arguments, ' '));
	process.exit();
}

var proxyObj = {};
mix(proxyObj, EventEmitter.prototype);

function Elon(opts){
	var root = opts && opts.root || process.cwd();
	this.opts = mix({
		root    : root,
		modPath : root + '/app/mod',
		actpath : root + '/app/act'
	}, opts, true);
};
mix(Elon.prototype, {
	addMods  : function(mods){
		var _mods = this._mods || {};
		if(arguments.length === 2){
			_mods[mods] = arguments[1];
		} else {
			for(var name in mods){
				var mod = mods[name];
				if(mod.file){
					var pre = mod.file.substr(0,1) === '/' ? '' : process.cwd(),
						filePath = path.join(pre, mod.file);
					if(fs.existsSync(filePath)){
						_mods[name] = require(filePath);
					} else {
						exit('file : ', filePath, 'is not exists');
					}
				} else if (mod.sock || mod.ws || mod.http) {
					var type = Object.keys(mod)[0],
						argv = util.isArray(mod[type]) ? mod[type] : [mod[type]],
						srv  = Client.create(type, argv);
					_mods[name] = srv.ready();
					srv.on('err', function(err){
						exit('mode "', name, '"error. ->', err);
					});
				} else {
					exit('mod', name, 'config error : ');
				}
			}
		}
		this._mods = _mods;
		_mods = null;
	},
	addLocalModules : function(modulesPath){
		if(!fs.existsSync(modulesPath)){
			return;
		}
		var modFiles = fs.readdirSync(modulesPath),
			localModConf = {};
		for(var i = 0, l = modFiles.length; i < l; i++){
			var file = modFiles[i],
				name = path.basename(file).toLowerCase().replace(/\.(js|json|node)$/, '')
				ext  = path.extname(file).toLowerCase().replace('.', '')
			if(ext === 'js' || ext === 'json' || ext === 'node'){
				var modName = name.replace(/[^a-zA-Z0-9](\w)/g, function(m, c){
					return c.toUpperCase();
				});
				localModConf[modName] = {
					'file' : path.join(modulesPath, file)
				}
			}
		}
		return localModConf;
	},
	initActivitys : function(actPath){
		var acts = this.addLocalModules(actPath);
		for(var k in acts){
			var actMod = require(acts[k].file);
			if(actMod.init){
				actMod.init(this.track, this.mods, proxyObj);
			}
		}
	},
	initMods : function(){
		var self = this,
			defer = when.defer();
		this.addMods(this.addLocalModules(this.opts.modPath));
		var _mods      = this._mods,
			modsKeys   = Object.keys(_mods),
			modsValues = [],
			mods       = {};
		for(var name in _mods){
			modsValues.push(_mods[name]);
		}

		when.settle(modsValues).then(function(pmods){
			if(pmods.length){
				for(var i = 0, l = pmods.length; i < l; i++){
					var mod = pmods[i];
					if(mod.state === 'fulfilled'){
						mods[modsKeys[i]] = mod.value;
					} else if(mod.state === 'rejected'){
						exit(mod.reason);
					}
					if(i == l - 1){
						self.mods = mods;
						defer.resolve();
					}
				}
			} else {
				self.mods = [];
				defer.resolve();
			}
		});
		return defer.promise;
	},
	startTrack : function(port, opts){
		var track = new Track(port, opts);
		this.track = track;
		track.start();
	},
	run : function(port, opts){
		var self = this;
		return this.initMods().then(function(){
			self.startTrack(port, opts);
			self.initActivitys(self.opts.actpath);
			return {
				track : self.track,
				mods  : self.mods,
				proxy : proxyObj
			}
		});
	},
	stop : function(){
		this.mods = null;
		this.track.stop();
	}
});

Elon.utils = utils;
Elon.Track = Track;
Elon.Musk  = Musk;

module.exports = Elon;