const express       = require('express')
const fs            = require('fs')
const path          = require('path')
const io            = require('socket.io-client');
const events        = require('events');
var clients         = {};

class Server extends events{
    constructor(){
        super();
        this.selected        = "";
        this.forcedStart     = undefined;
        var broadcast       = new Broadcast();
        this.path           = "";

        broadcast.on("gatewayFound",(gateway) => {
            console.log("Server.broadcast.on.gatewayFound");
            this.emit("gatewayFound", gateway);
        });
        broadcast.on("gatewayLost",(gateway) => {
            this.emit("gatewayLost", gateway);
            if(gateway.ip == this.selected){
                this.socket.close();
                this.socket = undefined;
            }
        });

        this.app           = express();
        this.app.use(express.static(path.join(__dirname, 'public')))
        this.app.get('/player', function(req, res) {
          res.sendFile(path.join(__dirname + '/index.html'))
        })
        this.app.get('/', (req, res) => {
          const stat = fs.statSync(this.path)
          const fileSize = stat.size
          const range = req.headers.range
        
          if(this.forcedStart){
              const start = this.forcedStart.start
              const end = this.forcedStart.end
        
              const head = {
                'Content-Length': end - start,
                'Content-Type': 'audio/mp3',
              }
              res.writeHead(200, head)
              fs.createReadStream(this.path, {start, end}).pipe(res)
              return;
          }
        
          if (range) {
            const parts = range.replace(/bytes=/, "").split("-")
            const start = parseInt(parts[0], 10)
            const end = parts[1]
              ? parseInt(parts[1], 10)
              : fileSize-1
            console.log(start);
            console.log(end);
        
            const chunksize = (end-start)+1
            const file = fs.createReadStream(this.path, {start, end})
            const head = {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': 'audio/mp3',
            }
        
            res.writeHead(206, head)
            file.pipe(res)
          } else {
            const head = {
              'Content-Length': fileSize,
              'Content-Type': 'audio/mp3',
            }
            res.writeHead(200, head)
            fs.createReadStream(this.path).pipe(res)
          }
        })
        
        this.app.listen(3000, function () {
          console.log('Listening on port 3000!')
        })
    }
}


// socket.emit("play", {
//     url:  "http://127.0.0.1:3000",
//     load: true
// });

// setTimeout(() => {
//   console.log("pause");
//   socket.emit("pause");
// }, 4000);
// setTimeout(() => {
//     console.log("play");
//     socket.emit("play", {
//         url: "http://127.0.0.1:3000"
//     });
// }, 6000);
// setTimeout(() => {
//     console.log("skip");
//     forcedStart = {
//         start: 4000000,
//         end:  6060777
//     };
//     socket.emit("skipTo", {
//         url: "http://127.0.0.1:3000"
//     });
// }, 10000);

Server.prototype.setClient  = function(ip){
    this.selected = ip;
    this.socket = io.connect("http://localhost:2000");
}
Server.prototype.play       = function(path){
    if(path != "" && path != undefined){
      this.path = path;
    }
    if(this.socket){
        this.socket.emit("play", {
            url: "http://127.0.0.1:3000",
            title: this.path
        });
    }
}
Server.prototype.pause      = function(){
  if(this.socket){
    this.socket.emit("pause");
  }
}
Server.prototype.skipTo     = function(start, stop){
  if(this.socket){
    this.forcedStart.start  = start;
    this.forcedStart.stop   = stop;
    this.socket.emit("skipTo", {
      url: "http://127.0.0.1:3000"
    });
  }
}
Server.prototype.stopServer = function(){
    this.broadcast.stop();
    this.app.close();
}


class Broadcast extends events {
    constructor(){
        super();
        var PORT = 41848;
        var MCAST_ADDR = "233.255.255.255"; //not your IP and should be a Class D address, see http://www.iana.org/assignments/multicast-addresses/multicast-addresses.xhtml
        var dgram = require('dgram'); 
        var server = dgram.createSocket({ type: "udp4", reuseAddr: true }); 
        server.bind(PORT);

        server.on("listening", function(){
            server.setBroadcast(true);
            server.setMulticastTTL(128);
            server.addMembership(MCAST_ADDR);
        });
        
        server.on("message", (message, remote) => {
            message = message.toString();
            if(message == "search audioGateway"){
                console.log(".");
                return;
            }
            // console.log(message, remote);
            var parts = message.split(":");
            if(parts[0] == "audioGateway"){
                if(Object.keys(clients).includes(parts[1]) ){
                    clients[parts[1]].setAlive(true);
                }else{
                    clients[parts[1]] = new Client(parts);
                    clients[parts[1]].on("died", (ip) => {
                        this.emit("gatewayLost", clients[ip]);
                        delete clients[ip];
                    })
                    this.emit("gatewayFound", clients[parts[1]]);
                }
            }
        });
        
        this.interval = setInterval(broadcastNew, 3000);
        
        function broadcastNew() {
            var message = "search audioGateway";
            server.send(message, 0, message.length, PORT,MCAST_ADDR);
        }
    }
}
Broadcast.prototype.stop = function(){
    clearInterval(this.interval);
}


class Client extends events {
    constructor(data){
        super();
        this.ip = data[1];
        this.port = data[2];
        this.place = data[3];
        this.active = new Date().getTime();
        this.timeout = 4000;
        this.interval = setInterval(() => {
            if(this.active < new Date().getTime() - this.timeout){
                this.setAlive(false);
            }
        }, 2000);
    }
}
Client.prototype.setAlive = function(value){
    if(value){
        this.alive = true;
        this.active = new Date().getTime();
    }else{
        this.alive = false;
        clearInterval(this.interval);
        this.emit("died", this.ip);
    }
};


module.exports = Server;