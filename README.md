# WAIVE - Online

Prototype browser-based interface to WAIVE: the AI that generates dance music from archived sound materials.


In development environment:
```
$ npm install
$ npm run build
```
and
```
$ flask --app server.py run
```

### OSC Bridge
To run OSC message bridge, run:
```
$ node osc_bridge.js [host [port]]
```
and have PD, Max/MSP, etc listen for messages on specified port. Default host, port `localhost:9129`.
