import * as Tone from 'tone';
import { getSamplePath, makeSoundRange } from './utils.js';
const MidiWriter = require('midi-writer-js');

const STOPPED = 0;
const STARTED = 1;

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

const DRUM_HUES = {
	"00_KD": 60,
	"01_SD": 288,
	"02_HH": 120,
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

    constructor(hue=null){
        this.state = STOPPED;
        this.z = null;
        this.hue = hue;
        this.element = null;
        this.hover_element = null;
    }

    renderToCanvas(canvas, grid=False){
        return;
    }

    addElement(el){
        this.element = el;
    }

    addHoverElement(el){
        this.hover_element = el;
        this.hover_element.style.display = "none";
        if(!this.element){
            return
        }
        this.element.appendChild(el);

        this.element.onmouseenter = () => {
            this.hover_element.style.display = "block";
        }
        this.element.onmouseleave = () => {
            this.hover_element.style.display = "none";
        }
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
    constructor(pattern, hue=null){
        super(hue);
        // pattern = [trig, fns] !!
        console.log(pattern);
        this.trig = makeSoundRange(pattern[0])
        this.samples = pattern[1];
    }

    renderToCanvas(canvas, grid=false){
        const ctx = canvas.getContext("2d");
        const barHeight = canvas.height;
        const gridWidth = canvas.width/16;
        const sampleHeight = Math.max(8, barHeight/5);
        const top = (barHeight - sampleHeight)/2;

        ctx.fillStyle = "hsl(180, 100%, 50%)";
        ctx.fillRect(0, 0, canvas.width, barHeight);

        for(let i=0; i < this.trig.length; i++){
            const p = this.trig[i];
            const start = p[0];
            const end = p[1];
            ctx.fillStyle = 'hsl(' + 360*start/16 + ', 50%, 50%)';
            ctx.fillRect(start*gridWidth, top, (end - start)*gridWidth, sampleHeight);
        }
    }
}

export class BassBar extends Bar {
    constructor(notes, hue=null, noteHue=339){
        super(hue);
        this.notes = notes;
        this.noteHue = noteHue;
    }

    renderToCanvas(canvas, grid=false){
        const ctx = canvas.getContext("2d");
        const noteHeight = canvas.height/12;
        const gridWidth = canvas.width/16;

        if(grid){
            for(let i = 0; i < 12; i++){
                if(WHITE_KEYS.indexOf(i) >= 0){
                    ctx.fillStyle = "#313131";
                } else {
                    ctx.fillStyle = "#161616";
                }
                ctx.fillRect(0, canvas.height - (i+1)*noteHeight, canvas.width, noteHeight);
            }
        }

        ctx.fillStyle = "hsl(" + this.noteHue + ", 100%, 50%)";
        for(const note of this.notes){
            const top = canvas.height - (note[0]+1)*noteHeight;
            const start = gridWidth*note[1];
            const length = gridWidth*note[2];
            ctx.fillRect(start, top, length, noteHeight);
        }
    }
}

export class DrumBar extends Bar {
    constructor(beat_grid, hue=null){
        super(hue);
        this.beat_grid = beat_grid;
        this.threshold = 0.2;
    }

    renderToCanvas(canvas, grid=false){
        const ctx = canvas.getContext("2d");
        const barwidth = canvas.width;
        const barHeight = canvas.height;

        ctx.fillStyle = "#444";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if(grid){
            for(let j = 0; j <= 16; j++){
                if(j%8 == 0){
                    ctx.fillStyle = "#333";
                    ctx.fillRect(j*barwidth/16, 0, barwidth/4, barHeight);
                }
                ctx.strokeStyle = "#666";
                ctx.beginPath();
                ctx.moveTo(j*barwidth/16, 0);
                ctx.lineTo(j*barwidth/16, barHeight);
                ctx.stroke();
            }
            for(let i = 0; i <= 3; i++){
                ctx.strokeStyle = "#666";
                ctx.beginPath();
                ctx.moveTo(0, i*barHeight/3);
                ctx.lineTo(barwidth, i*barHeight/3);
                ctx.stroke();
            }
        }

        for(let i = 0; i < 3; i++){
            ctx.fillStyle = "hsl(" + DRUM_HUES[DRUM_KEYS[i]] + ", 100%, 50%)";
            for(let j = 0; j < 16; j++){
                if(this.beat_grid[i][j] < this.threshold){
                    continue
                }

                let velocity = this.beat_grid[i][j];

                ctx.fillRect(
                    j*(barwidth/16),
                    (i+(1-velocity))*(barHeight/3),
                    barwidth/16,
                    (barHeight/3)*(velocity),
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


export class NoteArrangement extends Arrangement {

    constructor(length=4, midiOffset=24, midiName="notes"){
       super(length);
       this.midiOffset = midiOffset;
       this.midiName = midiName;
    }

    updatePart(){
        this.timings = [];
        for(let i = 0; i < this.length; i++){
            if(!this.arrangement[i]){
                continue;
            }
            for(let note of this.arrangement[i].notes){
                const pitch = note[0] + this.midiOffset;
                const quarter = Math.floor(note[1] / 4);
                const sixteenth = note[1] % 4;
                const velocity = note[3];

                const time = `${i}:${quarter}:${sixteenth}`;
                const duration = note[2];

                const length = `0:${Math.floor(duration / 4)}:${duration % 4}`
                //const length = duration * Math.floor(Tone.Transport.PPQ / 2) + "i"; // maybe add a little extra to make portmanto effect??
                const frequency = Tone.Frequency(pitch, "midi").toFrequency();

                this.timings.push({time, frequency, length, velocity, pitch, duration});
            }
        }

        this.midi = null;

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

        const track = new MidiWriter.Track();
        track.setTimeSignature(4, 4);
        track.setTempo(Tone.Transport.bpm.value);
        track.addTrackName(this.midiName);
        track.addText("Generated by WAIVE");
        track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 0}));

        for(const event of this.timings){
            const {length, pitch, velocity, time, duration} = event;
            const startTick = Tone.Ticks(time);
            const startMidiTick = Math.floor(128 * startTick / Tone.Transport.PPQ);

            track.addEvent(new MidiWriter.NoteEvent({
                pitch: pitch,
                duration: "T" + duration * 32,
                velocity: Math.floor(velocity*100),
                startTick: startMidiTick,
            }));

        }

        const midi = new MidiWriter.Writer(track);
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

        this.midi = null;

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
        track.setTimeSignature(4, 4);
        track.setTempo(Tone.Transport.bpm.value);
        track.addTrackName("track");
        track.addText("Generated by WAIVE");
        track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 0}));

        for(const event of this.timings){
            const {time, velocity, note, length} = event;

            const startTick = Tone.Ticks(time);
            const startMidiTick = Math.floor(128 * startTick / Tone.Transport.PPQ);

            track.addEvent(new MidiWriter.NoteEvent({
                pitch: note,
                duration: "16",
                velocity: Math.floor(velocity*100),
                startTick: startMidiTick,
                channel: 10,
            }));
        }

        const midi = new MidiWriter.Writer(track);
        this.midi = midi.dataUri();

        return this.midi;
    }
}


export class SoundArrangement extends Arrangement {

    updatePart(){
        this.timings = [];

        for(let i = 0; i < this.length; i++){
            if(!this.arrangement[i]){
                continue
            }

            const pattern = this.arrangement[i].trig;
            const samples = this.arrangement[i].samples;


            for(let j = 0; j < pattern.length; j++){
                const start = pattern[j][0];
                const end = pattern[j][1];

                const quarter = Math.floor(start/4);
                const sixteenth = start % 4;
                const time = `${i}:${quarter}:${sixteenth}`;
                const length = (end - start)*48 + "i";
                const fn = getSamplePath(samples[j])[2];

                this.timings.push({time: time, fn: fn, length: length});
            }
        }

        if(this.part){
            this.part.dispose();
        }

        this.part = new Tone.Part((time, val) => {
            this.synthCallback(time, val.fn, val.length);
        }, this.timings);

        this.part.start(0);
    }
}
