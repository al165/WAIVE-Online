![WAIVE-Online Banner](docs/header.jpg)

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
It is possible to connect WAIVE-Online to any software that accepts OSC (Open Sound Control) messages.
At the moment this communication is one way, but future plans are to allow control of WAIVE-Online through OSC.

In order to enable OSC messaging, you need to run an OSC Bridge Server locally on the machine that has WAIVE-Online open in a browser.
WAIVE-Online connects to this server with websockets, and the bridge in turn sends OSC over UDP to any specified address and port.

To install OSC message bridge, run the following commands in a terminal:
```
$ mkdir waive_bridge
$ cd waive_bridge
$ npm init
$ npm install osc-js
```
and save `osc_bridge.js` in the directory.
You will need `npm` installed on you device.

To run OSC message bridge server, use the command
```
$ node osc_bridge.js [host [port]]
```
from within the `waive_bridge` folder, and you can optionally specify a host ip, or host and port (without the square brackets), e.g. `node osc_bridge.js 192.168.123.45 9001`.
Default host and port are `localhost 9129`.
While the server is running, refresh WAIVE-Online in the browser to connect and there should be a "OSC connected" text in the transport window.
Now, Max/MSP, PureData etc can listen for OSC messages on the specified port.

The OSC address space is as follows:
```
/audio
  /bpm          : int        beats per minute
  /transport    : int int    bar:beat
  /playing      : bool       playing state
  /drum
    /kd         : float      kick drum velocity
    /sd         : float      snare drum velocity
    /hh         : float      high hat velocity
  /bass         : int        bass MIDI note
  /sound        : string     sample name
```
Examples:
- `/audio/transport 1 2` means third beat of the second bar (beats and bars are zero indexed).
- `/audio/drum/sd 0.75` means a snare drum has just been triggered with a velocity (strength) of 0.75.
Velocity values are in the range 0-1.
