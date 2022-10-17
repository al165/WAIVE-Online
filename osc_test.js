const OSC = require("osc-js");

const osc = new OSC({ plugin: new OSC.DatagramPlugin() })
osc.open({ port: 9200 })

osc.on("/*", message => {
    console.log(message);
})
