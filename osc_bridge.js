const OSC = require('osc-js');

const args = process.argv.slice(2);

let host = "localhost";
let port = 9129;

if(args.length == 1){
    host = args[0];
} else if(args.length == 2){
    host = args[0];
    port = parseInt(args[1]);
}

const config = {
    reciever: "ws",
    udpClient: {port, host},
    udpServer: {host: "0.0.0.0"},
};
const osc = new OSC({plugin: new OSC.BridgePlugin(config)});

osc.open();

console.log("started bridge");
console.log(config);
