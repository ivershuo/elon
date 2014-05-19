var when = require('when');

function mix(des, src, map){
	map = map || function(d, s, i){
		if(!(des[i] || (i in des))){
			return s;
		}
		return d;
	}
	if(map === true){
		map = function(d,s){
			return s;
		}
	}
	for (i in src) {
		des[i] = map(des[i], src[i], i, des, src);
		if(des[i] === undefined) delete des[i];
	}
	return des;
}

function Guard(dur, okdata, errData){
	var deferred = when.defer();
	dur = dur || 5000;

	var timer = null;

	mix(deferred.promise,  {
		cancel : function(){
			deferred.reject(errData);
		},
		reset : function(){
			clearTimeout(timer);
			timer = setTimeout(function(){
				deferred.resolve(okdata);
			}, dur);
		},
		stop : function(){
			clearTimeout(timer);
			deferred.resolve(okdata);
		}
	});

	deferred.promise.reset();

	return deferred.promise;
}

module.exports = {
	mix   : mix,
	guard : function(dur, okdata, errData){
		return new Guard(dur, okdata, errData);
	}
}