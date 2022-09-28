import * as Tone from 'tone';
import { getSamplePath } from './utils.js';

const STOPPED = 0;
const STARTED = 1;

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

const DRUMCOLORS = {
	"00_KD": "#F44",
	"01_SD": "#FA4",
	"02_HH": "#FF8",
}

const DRUM_NAMES = {
	"00_KD": "kick",
	"01_SD": "snare",
	"02_HH": "hat",
}

const DRUM_KEYS = {
	0: "00_KD",
	1: "01_SD",
	2: "02_HH",
}

const DRUM_MIDI_MAP = {
	"00_KD": 36,
	"01_SD": 38,
	"02_HH": 42,
}

/* wrapper for effect class / bus
    https://github.com/Tonejs/Tone.js/issues/187
*/
export class BypassableFX extends Tone.ToneAudioNode {
  constructor(fx, bypass=false) {
    super();
    this.effect = fx; //new options.effect(options.options); // create effectNode in constructor
    this._bypass = bypass;
    this._lastBypass = bypass;

    // audio signal is constantly passed through this node, 
    // but processed by effect only, if bypass prop is set to `false` 
    this.input = new Tone.Gain();
    this.output = new Tone.Gain();

    this.effect.connect(this.output);

    this.activate(!bypass); // initialize input node connection
  }

  get bypass() {
    return this._bypass;
  }

  set bypass(val) {
    if (this._lastBypass === val) return;

    this._bypass = Boolean(val);
    this.activate(!val);
    this._lastBypass = val;
  }
  
  /*
 activate effect (connect input node), if bypass == false
 */
  activate(doActivate) {
    if (doActivate) {
      this.input.disconnect();
      this.input.connect(this.effect);
    } else {
      this.input.disconnect();
      this.input.connect(this.output);
    }
  }
 
  toggleBypass() {
    this.bypass = !this._bypass;
  }

  dispose() {
    super.dispose();
    this.effect.dispose();
    return this;
  }
}



class Bar {

    constructor(hue=0){
        this.state = STOPPED;
        this.z = null;
        this.hue = hue;
        this.element = null;
    }

    renderToCanvas(canvas, grid=False){
        return;
    }

	start(time=0){
		this.state = STARTED;
		this.part.start(time);
	}

	stop(){
    	this.state = STOPPED;
    	this.part.stop();
	}

	end(){
		this.stop();
		this.part.dispose();
	}

}

export class SoundBar extends Bar {
	constructor(pattern, samples, sound_players, hue=0){
		super(hue);
		this.pattern = pattern;
		this.samples = samples;
		this.sound_players = sound_players;

		let timings = [];
		for(let i = 0; i < pattern.length; i++){
			const start = pattern[i][0];
			const end = pattern[i][1];

			const time = start*48 + "i";
			const length = (end - start)*48 + "i";
			const fn = getSamplePath(samples[i])[2];

			timings.push({time: time, fn: fn, length: length});
		}

		this.part = new Tone.Part((time, val) => {
    		if(this.sound_players.has(val.fn)){
    			this.sound_players.player(val.fn).start(time, 0, val.length)
    		}
		}, timings)

	}
}

export class BassBar extends Bar {
	constructor(notes, hue=0){
    	super(hue);
    	this.notes = notes;
	}

	renderToCanvas(canvas, grid=false){
        const ctx = canvas.getContext("2d");
        const noteHeight = canvas.height/12;
        const gridWidth = canvas.width/16;

        if(grid){
        	for(let i = 0; i < 12; i++){
            	if(WHITE_KEYS.indexOf(i) >= 0){
        	    	ctx.fillStyle = "#CCC";
            	} else {
        	    	ctx.fillStyle = "#AAA";
            	}
            	ctx.fillRect(0, canvas.height - (i+1)*noteHeight, canvas.width, noteHeight);
        	}
        }

    	ctx.fillStyle = "#222";
    	for(const note of this.notes){
    		const top = canvas.height - (note[0]+1)*noteHeight;
    		const start = gridWidth*note[1];
    		const length = gridWidth*note[2];
    		ctx.fillRect(start, top, length, noteHeight);
    	}
	}
}

export class DrumBar extends Bar {
    constructor(beat_grid, hue=0){
        super(hue);
        this.beat_grid = beat_grid;
        this.threshold = 0.2;
    }

    renderToCanvas(canvas, grid=false){
        const ctx = canvas.getContext("2d");
		const barwidth = canvas.width;
		const barheight = canvas.height;

    	ctx.fillStyle = "#AAA";
    	ctx.fillRect(0, 0, canvas.width, canvas.height);

        if(grid){
         	for(let j = 0; j <= 16; j++){
             	if(j%8 == 0){
        			ctx.fillStyle = "#AAA";
        			ctx.fillRect(j*barwidth/16, 0, barwidth/4, barheight);
             	}
            	ctx.strokeStyle = "#666";
            	ctx.beginPath();
            	ctx.moveTo(j*barwidth/16, 0);
            	ctx.lineTo(j*barwidth/16, barheight);
            	ctx.stroke();
         	}
        	for(let i = 0; i <= 3; i++){
            	ctx.strokeStyle = "#666";
            	ctx.beginPath();
            	ctx.moveTo(0, i*barheight/3);
            	ctx.lineTo(barwidth, i*barheight/3);
            	ctx.stroke();
        	}
        }

		for(let i = 0; i < 3; i++){
    		ctx.fillStyle = DRUMCOLORS[DRUM_KEYS[i]];
    		for(let j = 0; j < 16; j++){
        		if(this.beat_grid[i][j] < this.threshold){
            		continue
        		}

        		let velocity = this.beat_grid[i][j];

        		ctx.fillRect(
            		j*(barwidth/16),
            		(i+(1-velocity))*(barheight/3),
            		barwidth/16,
            		(barheight/3)*(velocity),
        		);
    		}
		}
    }
}


class Arrangement {
	constructor(length = 4){
    	this.length = length;
    	this.arrangement = [];
    	this.part = null;
    	this.synthCallback = () => {};
    	this.midi = null;
    	this.timings = null;
	}

	isEmpty(){
		for(let i = 0; i < this.length; i++){
    		if(this.arrangement[i]){
        		return false;
    		}
		}
		return true;
	}

	add(bar){
		for(let i = 0; i < this.length; i++){
    		if(!this.arrangement[i]){
            	this.arrangement[i] = bar;
            	break;
    		}
		}
		this.updatePart();
    }

    remove(i){
		this.arrangement[i] = null;
		this.updatePart();
    }

    at(i){
		return this.arrangement[i];
    }

    updatePart() {
        return
    }

    start(time=0){
		this.part.start(time);
    }

    stop(){
        this.part.stop();
    }
}


export class BassArrangement extends Arrangement {

    updatePart(){
        this.timings = [];
		for(let i = 0; i < this.length; i++){
    		if(!this.arrangement[i]){
            	continue;
    		}
        	for(let note of this.arrangement[i].notes){
            	const pitch = note[0] + 24;
            	const quarter = Math.floor(note[1] / 4);
    			const sixteenth = note[1] % 4;
    			const velocity = note[3];

    			const time = `${i}:${quarter}:${sixteenth}`;
    			const length = note[2] * 48 + "i"; // maybe add a little extra to make portmanto effect??
    			const frequency = Tone.Frequency(pitch, "midi").toFrequency();

    			this.timings.push({time, frequency, length, velocity, pitch});
        	}
		}


		if(this.part){
    		this.part.dispose();
		}

		this.part = new Tone.Part((time, val) => {
    		this.synthCallback(val.frequency, val.length, time);
		}, this.timings)

		this.part.start(0);
    }

    toMidi(){
        if(this.midi){
            return this.midi;
        }

        console.log("NOT IMPLEMENTED YET");
        return;

		const track = new MidiWriter.Track();

		for(const event of this.timings){
			const {length, pitch, velocity, time} = event;
			const startTick = Math.floor(time*512/16);

			track.addEvent(new MidiWriter.NoteEvent({
    			pitch: pitch,
    			duration: "16",
    			velocity: Math.floor(velocity*100),
    			startTick: startTick,
			}));
		}

		const midi = new MidiWriter.Writer(track);
		console.log(midi.dataUri());
		this.midi = midi.dataUri();

		return this.midi;
    }
}


export class DrumArrangement extends Arrangement {

    updatePart(){
		this.timings = [];
		for(let i = 0; i < this.length; i++ ){
    		if(!this.arrangement[i]){
        		continue;
    		}
    		this.arrangement[i].threshold = this.threshold;
    		const beat_grid = this.arrangement[i].beat_grid;
    		for(let j = 0; j < beat_grid.length; j++){
        		for(let k = 0; k < beat_grid[j].length; k++){
					if(beat_grid[j][k] < this.threshold){
    					continue
					}

					const quarter = Math.floor(k/4);
					const sixteenth = k % 4;
    				const time = `${i}:${quarter}:${sixteenth}`;

    				const velocity = beat_grid[j][k];
    				const note = DRUM_MIDI_MAP[DRUM_KEYS[j]];
    				const length = "48i";

    				this.timings.push({time, note, length, velocity});
        		}
    		}
		}

		if(this.part){
    		this.part.dispose();
		}

		this.part = new Tone.Part((time, val) => {
    		this.synthCallback(val.note, val.length, val.velocity, time);
		}, this.timings)

		this.part.start(0);

    }

	toMidi(){
		if(this.midi){
    		return this.midi;
		}

		const track = new MidiWriter.Track();

		return;

		for(const ins_name in this.timings){
			for(const event of this.timings[ins_name]){
    			const time = event.index;
    			const velocity = event.velocity;
    			const startTick = Math.floor(time*512/16);
    			const pitch = DRUM_MIDI_MAP[ins_name];

    			track.addEvent(new MidiWriter.NoteEvent({
        			pitch: pitch,
        			duration: "16",
        			velocity: Math.floor(velocity*100),
        			startTick: startTick,
        			channel: 10,
    			}));
			}
		}

		const midi = new MidiWriter.Writer(track);
		console.log(midi.dataUri());
		this.midi = midi.dataUri();

		return this.midi;
	}
}
