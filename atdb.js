/*
 * amazon tweets database module
 * usage:
 * var atdb = require('./atdb')
 */
var mongo = require('mongodb');

/*
 * dbname - required database name
 * host - optional database host
 * port - optional database port
 */
exports.new = function(dbname, host, port) {
   var host = host || 
      process.env['MONGO_NODE_DRIVER_HOST'] || 
      'localhost';
   var port = port || 
      process.env['MONGO_NODE_DRIVER_PORT'] || 
      mongo.Connection.DEFAULT_PORT;
   return {
      'insert': function (tablename, jsonobj) {
         var db = new mongo.Db(dbname, new mongo.Server(host, port, {}), {});
         db.open(function(err, db) {
             if (err) console.log(err.message);
             db.collection(tablename, function(err, coll) {
                coll.insert(jsonobj, function(err, obj) { 
                   db.close(); 
                   });
                });
            });
      },
      // top n by time period
      // callback params - results
      'top': function (tablename, n, startTime, endTime, callback) {
         var db = new mongo.Db(dbname, new mongo.Server(host, port, {}), {});
         function map() {
            emit(this.asin, {'c':1, 'd':this.domain});
         }
         function reduce(key, values) {
            var sum = 0;
            for (var i = 0; i < values.length; i++) {
               sum += values[i]['c'];
            }
            return {'c':sum, 'd':values[0]['d']};
         }
         function process(err, resCol) {
            if (!resCol) console.log(err.message);
            resCol.find({}, {sort:[['value','desc']], limit:n}, 
                  function(err, cursor) {
                  cursor.toArray(function(err, items) {
                     callback(items);
                        });
                  });
         }
         db.open(function(err, db) {
               db.collection(tablename, function(err, coll) {
                  if (err) console.log(err.message);
                  coll.mapReduce(map, reduce, {'out':'top_tmp', 'query':{'timestamp': {'$gte': startTime, '$lte': endTime} } }, process);
                  });
               });
      }
   };
}


