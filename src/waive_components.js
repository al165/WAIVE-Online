import * as Tone from 'tone';
import { getSamplePath } from './utils.js';

const STOPPED = 0;
const STARTED = 1;


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


export class DrumBar {

	constructor(beat_grid, threshold, ins_names, drum_buffers, drum_players, drum_velocity) {
    	this.ins_names = ins_names;
		this.beat_grid = beat_grid;
		this.drum_buffers = drum_buffers;
		this.drum_players = drum_players;
		this.drum_velocity = drum_velocity;

		this.parts = {};
		this.timings = {};
		// avoid unneccessary updates
		this.last_threshold = null;
		this.midi = null;

		if(threshold){
    		this.update(threshold);
		}
		this.state = STOPPED;
	}

	update(threshold){
    	if(!threshold || threshold == this.last_threshold){
        	//console.log("threshold is " + threshold + " (last threshold " + this.last_threshold + ")");
			return
    	}
		// updates the part with new timings
		for(let i=0; i<this.beat_grid.length; i++){
    		const ins_name = this.ins_names[i];
    		let timings = [];
    		const max_velocity = Math.max(...this.beat_grid[i]);

			for(let j=0; j<this.beat_grid[i].length; j++){
				if(this.beat_grid[i][j] < threshold){
    				continue
				}

    			const time = j*48+"i";
    			timings.push({
					time: time,
					velocity: this.beat_grid[i][j]/max_velocity,
					note: "A1",
					index: j,
				});
        	}

        	let part = new Tone.Part((time, value) => {
            	if(this.drum_buffers[ins_name].loaded){
            		this.drum_players[ins_name].start(time, 0, "16t");
            		this.drum_velocity[ins_name].gain.setValueAtTime(value.velocity, time);
            	}
        	}, timings);

        	this.timings[ins_name] = timings;

			if(this.parts[ins_name]){
    			this.parts[ins_name].dispose();
			}
			this.parts[ins_name] = part;
		}

		this.last_threshold = threshold;
		this.midi = null;
	}

	start(time = 0){
    	this.state = STARTED;
    	for(const ins_name in this.parts){
    		this.parts[ins_name].start(time);
    	}
	}

	stop(){
    	this.state = STOPPED;
    	for(const ins_name in this.parts){
    		this.parts[ins_name].stop();
    	}
	}

	end(){
    	this.state = STOPPED;
    	for(const ins_name in this.parts){
    		this.parts[ins_name].stop();
    		this.parts[ins_name].dispose();
    	}
	}

	toMidi(){
		if(this.midi){
    		return this.midi;
		}

		const track = new MidiWriter.Track();

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

export class SoundBar {
	constructor(pattern, samples, sound_players){
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

			//console.log(`${fn}: ${time} ${length}`);

			timings.push({time: time, fn: fn, length: length});
		}

		this.part = new Tone.Part((time, val) => {
    		if(this.sound_players.has(val.fn)){
    			this.sound_players.player(val.fn).start(time, 0, val.length)
    		}
		}, timings)
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

export class BassBar {
	constructor(notes, synth){
    	this.notes = notes;
    	this.synth = synth;

    	let timings = [];
    	for(let note of notes){
        	const pitch = note[0] + 24;
			const start = note[1];
			const length = note[2];
			const velocity = note[3];

			const time = start*48 + "i";
			const duration = length*48 + "i"; // maybe add a little extra to make portmanto effect??
			const frequency = Tone.Frequency(pitch, "midi").toFrequency();

			timings.push({time: time, frequency: frequency, length: duration, velocity: velocity});
    	}

    	this.part = new Tone.Part((time, val) => {
        	this.synth.triggerAttackRelease(val.frequency, val.length, time);
    	}, timings)
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
