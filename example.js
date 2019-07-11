var audioServer = require("./index.js");

var server = new audioServer();

server.on("gatewayFound", (gateway) => {
    console.log("gefunden:" + gateway.ip);
    server.setClient(gateway.ip);
    server.play("/home/daniel/Musik/Adel Tawil - Ist da Jemand.mp3");

    setTimeout(() => {
        server.pause();
    }, 1000 * 3);

    setTimeout(() => {
        server.play();
    }, 1000 * 5);
});

server.on("gatewayLost", (gateway) => {
    console.log("gatewayLost:" + gateway.ip);
});