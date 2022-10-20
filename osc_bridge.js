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
    udpServer: {port: 9200, host: "localhost"},
    wsServer: {port: 8080, host: "localhost"},
};
const osc = new OSC({plugin: new OSC.BridgePlugin(config)});

osc.on("/*", (messege, rinfo) => {
    //console.log(messege);
    //console.log(rinfo);
});

osc.on("open", () => {
    console.log("opened");
});

osc.on("close", () => {
    console.log("closed");
});

osc.on("error", (err) => {
    console.log(err);
})

osc.open();

console.log("started bridge");
console.log(config);
