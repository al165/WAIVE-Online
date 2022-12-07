import * as Tone from 'tone';
import './style.css';
import './input-knobs.js';
import './knob_digital.png';
import './switch_mute.png';
import './switch_solo.png';
import './slider.png';
const OSC = require('osc-js');

const MidiWriter = require("midi-writer-js");
import AudioRecorder from 'audio-recorder-polyfill';
window.MediaRecorder = AudioRecorder;

import { createKnob, createFXKnob, createSelection, createSwitch, Meter, createBarElement } from './gui.js';
import { download, getSamplePath, apiCall, apiPostCall, cleanName, makeSoundRange } from './utils.js';
import { BypassableFX, DrumBar, SoundBar, BassBar, DrumArrangement, NoteArrangement } from './waive_components.js';

const ROOT_URL = window.location.pathname;
//const ROOT_URL = "https://www.arranlyon.com/waive/";

Tone.Transport.bpm.value = 110;
Tone.Transport.loop = true;
Tone.Transport.loopEnd = "4:0";

let loopLength = 4;

let recorder = new Tone.Recorder();
let recording = false;

let play_btn = document.getElementById("play");

const id = "test";

let drumArrangement = new DrumArrangement();
let threshold = 0.2;
drumArrangement.threshold = threshold;
const drumSampleToLoad = {};
const drumBuffers = {};
const drumPlayers = {};
const drumPlayersVelocity = {};
const drumSampleLabels = {};
const drumSampleURL = {};
const drumSampleZs = {};
drumArrangement.synthCallback = (note, length, velocity, time) => {
    const ins_name = DRUM_MIDI_NAME[note];
	if(drumBuffers[ins_name] && drumBuffers[ins_name].loaded){
		drumPlayers[ins_name].start(time, 0);
		drumPlayersVelocity[ins_name].gain.setValueAtTime(velocity, time);
	}
	Tone.Draw.schedule(() => {
		const a = DRUM_NAMES[ins_name];
		sendOSC("/audio/drum/"+a, velocity);
	}, time);
}

let drumPool = [];
let selectedDrumBar = [];
let drumLastHue = 0;

let bassArrangement = new NoteArrangement(4, 24, "bassline");
let bassPool = [];
let selectedBassBar = [];

let bassSynth = new Tone.MonoSynth({
	"portamento": 0.2,
	"oscillator":{
    	"type": "sawtooth",
	},
	"envelope":{
    	"attack": 0.01,
    	"decay": 0.2,
    	"sustain": 0.2,
    	"release": 1.0,
	},
	"filterEnvelope":{
    	"attack": 0.01,
    	"decay": 0.2,
    	"sustain": 0.2,
    	"release": 1.0,
    	"octaves": 3.0,
	},
	"filter":{
    	"type": "lowpass",
    	"Q": 1.0,
	}
});

bassArrangement.synthCallback = (frequency, length, time) => {
    bassSynth.triggerAttackRelease(frequency, length, time);
    Tone.Draw.schedule(() => {
        sendOSC("/audio/bass", Math.round(Tone.Frequency(frequency, "hz").toMidi()));
    }, time);
};

let soundArrangement = new NoteArrangement(4, 60, "melody");
let soundPool = [];
let selectedSoundBar = [];
let soundSampleZ;

let sampler;
let sample_url;
let samplerParams = {
    attack: 0.0,
    release: 0.0,
}

soundArrangement.synthCallback = (frequency, length, time) => {
    if(sampler){
        sampler.triggerAttackRelease(frequency, length, time);
    }
    Tone.Draw.schedule(() => {
        sendOSC("/audio/melody", Math.round(Tone.Frequency(frequency, "hz").toMidi()));
    }, time);
}

const DRUM_HUES = {
	"00_KD": 60,
	"01_SD": 288,
	"02_HH": 120,
}

const DRUM_NAMES = {
	"00_KD": "kd",
	"01_SD": "sd",
	"02_HH": "hh",
}

const DRUM_LABELS = {
	"00_KD": "kick",
	"01_SD": "snare",
	"02_HH": "hihat",
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

const DRUM_MIDI_NAME = {
	36: "00_KD",
	38: "01_SD",
	42: "02_HH",
}

let drumChain = {};
let soundChain = [];
let bassChain = [];
let masterChain = [];
let meters = [];

// FX Chains
const DRUM_FX_CHAIN = [
	'compressor', 'eq3', 'channel', 'meter',
]

const SOUND_FX_CHAIN = [
	'delay', 'reverb', 'filter', 'channel', 'meter',
]

const SOUND_HUE = 180;
let soundLastHue = SOUND_HUE;

const BASS_FX_CHAIN = [
	'delay', 'eq3', 'channel', 'meter',
]

const BASS_HUE = 339;
let bassLastHue = BASS_HUE;

const MASTER_FX_CHAIN = [
	'meter', 'delay', 'reverb', 'filter', 'eq3', 'compressor', 'limiter', 'gain', 'meter'
]

const NON_BYPASSABLE = ['meter', 'vol', 'solo', 'gain'];

let registeredControls = {};

function registerControl(input, type, ...address){
    const addr = "/" + address.join("/");
    console.log("registered " + type + " control: " + addr);
    registeredControls[addr] = {
        type: type,
        input: input,
    };
}

function registerFXChain(container, name="FX"){
    const fxBoxes = container.querySelectorAll(".fx-box")
    for(const fxBox of fxBoxes){
        const fx_name = fxBox.querySelector(".fx-name").innerText;
        const fxKnobs = fxBox.querySelectorAll(".fx-knob");
        for(const fxKnob of fxKnobs){
            let parameter_name;
            try{
                parameter_name = fxKnob.querySelector(".fx-parameter").innerText;
            } catch {
                continue
            }
            const knob = fxKnob.querySelector("input");
			if(!knob){
    			continue
			}

			if(knob.type == "checkbox"){
				registerControl((args) => {
    				if(args[0] == 1){
        				knob.checked = false;
    				} else {
        				knob.checked = true;
    				}
    				knob.click();
				}, "trigger", name, fx_name, parameter_name);
			} else {
                registerControl(knob, "value", name, fx_name, parameter_name);
			}
        }
        const switches = fxBox.querySelectorAll(".input-switch");
        for(const sw of switches){
            //const parameter_name =
        }
    }
}

const timelineCanvases = document.getElementsByClassName("timeline");

const oscStatus = document.getElementById("osc-status");
let enableOSC = false;

const osc = new OSC({ plugin: new OSC.WebsocketClientPlugin() });
osc.on("open", () => {
    enableOSC = true;
    oscStatus.style.display = "block";
    oscStatus.innerText = "● OSC connected";
    oscStatus.style.color = "#F80";
});
osc.on("close", () => {
    enableOSC = false;
    oscStatus.innerText = "○ OSC disconnected";
    oscStatus.style.color = "#AAA";
})
osc.on("error", (err) => {
    enableOSC = false;
    oscStatus.innerText = "◌ OSC error";
    oscStatus.style.color = "#A00";
    console.log(err);
})

osc.on("/*", (message, rinfo) => {
    const { address, args } = message;
    //console.log(address);
    if(registeredControls[address]){
        let rc = registeredControls[address];
        if(rc.type == "value"){
            const e = new Event("input");
            rc.input.value = args[0];
            rc.input.dispatchEvent(e);
        } else if(rc.type == "trigger"){
			rc.input(args);
        } else if(rc.type == "selection"){
            let e = new Event("input");
            let options = rc.input.getElementsByTagName("option");
            let idx = Math.floor((options.length - 1) * (1 - args[0]));
            options[idx].selected = 'selected';
            rc.input.dispatchEvent(e);
        } else {
            console.log("unknown type " + rc.type);
        }
    } else {
        console.log(`not processed: ${address} : ${args[0]}`);
    }
})

osc.open();

function sendOSC(address, ...data){
    if(!enableOSC){
        return
    }
    let message = new OSC.Message(address, ...data);
    osc.send(message);
}

function drawTimeline(){
    for(const timelineCanvas of timelineCanvases){
        const width = timelineCanvas.width;
        const height = timelineCanvas.height;
        const ctx = timelineCanvas.getContext("2d");
        const barWidth = width/4;

        // background
        ctx.fillStyle = "#434343";
        ctx.fillRect(0, 0, width, height);

        // loop length
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width * loopLength / 4, height);

        // lines
        ctx.lineWidth = 1;
        for(let i = 0; i < 4; i++){
            if(i < loopLength){
            	ctx.strokeStyle = "white";
            	ctx.fillStyle = "white";
            } else {
            	ctx.strokeStyle = "black";
            	ctx.fillStyle = "black";
            }
    		ctx.moveTo(i*barWidth, 0);
    		ctx.lineTo(i*barWidth, height);
    		ctx.stroke();
    		ctx.fillText(i, barWidth * i + 5, 10);
        }

        ctx.strokeStyle = "white";
        ctx.strokeRect(0, 0, width * loopLength / 4 - 2, height - 2);
    }
}

function buildFXChain(fxList, channels=2, bypass=false, baseColor=null){
	let chain = [];
	let container = document.createElement("div");
	container.classList.add("fx-chain-container");

	for(let i = 0; i < fxList.length; i++){
    	let fx;
    	const fxType = fxList[i];
    	const fxBox = document.createElement("div");
    	const fxName = document.createElement("span");
    	fxName.innerText = fxType;
    	fxName.classList.add("fx-name");
    	let fxColor;
        if(baseColor){
        	if(fxType == "meter"){
                fxColor = "#FB9A04";
        	} else {
            	const p = 1 - i / (fxList.length - 2);
                const s = 50 + p*25;
                fxColor = "hsl(" + baseColor + ", " + "100" + "%, " + s + "%)";
        	}
    	} else {
            //fxColor = "hsl(" + (64 * i/fxList.length + 30) + ", 100%, 50%)";
            fxColor = "#8D8D8D";
    	}
    	fxName.style.backgroundColor = fxColor;
    	fxBox.classList.add("fx-box");
    	fxBox.appendChild(fxName);
    	let fxKnobs = document.createElement("div");
    	fxKnobs.classList.add("fx-knobs");
    	fxBox.appendChild(fxKnobs);

    	let knob, knobContainer, sw;

    	switch(fxType){
    		case "delay":
    			fx = new Tone.FeedbackDelay({feedback: 0.0, delayTime: 0.2, wet: 0.5, channels: channels});
    			fxKnobs.appendChild(createFXKnob("feedback", {fx: fx, default: 0.0}, registeredControls));
    			fxKnobs.appendChild(createSelection("delayTime", ["64n", "32n", "16n", "8n"], fx));
    			//fxKnobs.appendChild(createFXKnob("delayTime", {fx: fx, default: 0.2}));
    			break;
    		case "reverb":
    			fx = new Tone.Reverb({wet: 0.7, dry: 1.0, decay: 1.0, channels: channels});
    			fxKnobs.appendChild(createFXKnob("decay", {fx: fx, default: 1.0, min: 0.01, max: 10}));
    			fxKnobs.appendChild(createFXKnob("wet", {fx: fx, default: 0.7}));
    			break;
    		case "compressor":
    			fx = new Tone.Compressor({attack: 0.01, release: 0.1, ratio: 3, threshold: -30, channels: channels});
    			fxKnobs.appendChild(createFXKnob("attack", {fx: fx, default: 0.01}));
    			fxKnobs.appendChild(createFXKnob("release", {fx: fx, default: 0.1}));
    			fxKnobs.appendChild(createFXKnob("ratio", {fx: fx, default: 3, min: 1, max: 10}));
    			fxKnobs.appendChild(createFXKnob("threshold", {fx: fx, default: -30, min: -60, max: 0}));
    			break;
    		case "lowpass":
    			fx = new Tone.Filter({frequency: 200, type: "lowpass", channels: channels});
    			fxKnobs.appendChild(createFXKnob("frequency", {fx: fx, default: 20000, min: 40, max: 20000}));
    			break;
    		case "filter":
    			fx = new Tone.Filter({frequency: 2000, type: "lowpass", Q: 1.0, channels: channels});
    			fxKnobs.appendChild(createSelection("type", ["lowpass", "highpass", "bandpass"], fx));
    			fxKnobs.appendChild(createFXKnob("frequency", {fx: fx, default: 2000, min: 80, max: 15000}));
    			fxKnobs.appendChild(createFXKnob("Q", {fx: fx, default: 1.0, min: 0, max: 5}));
    			break;
    		case "autofilter":
				fx = new Tone.AutoFilter({baseFrequency: 1000, frequency: 2, octaves: 4, depth: 0.5, wet: 0.5, channels: channels});
    			fxKnobs.appendChild(createFXKnob("frequency", {fx: fx, default: 2, min: 0.1, max: 20}));
    			fxKnobs.appendChild(createFXKnob("depth", {fx: fx, default: 0.5, min: 0.0, max: 1.0}));
    			fxKnobs.appendChild(createFXKnob("wet", {fx: fx, default: 0.5, min: 0.0, max: 1.0}));
    			break;
    		case "phaser":
    			fx = new Tone.Phaser({frequency: 15, octaves: 5, baseFrequency: 1000, channels: channels});
    			fxKnobs.appendChild(createFXKnob("frequency", {fx: fx, default: 5, min: 0.1, max: 20}));
    			break;
    		case "eq3":
    			fx = new Tone.EQ3({highFrequency: 2000, lowFrequency: 100, channels: channels});
    			fxKnobs.appendChild(createFXKnob("low", {fx: fx, default: 1.0, max: 5.0, min: -24}));
    			fxKnobs.appendChild(createFXKnob("mid", {fx: fx, default: 1.0, max: 5.0, min: -24}));
    			fxKnobs.appendChild(createFXKnob("high", {fx: fx, default: 1.0, max: 5.0, min: -24}));
    			break;
    		case "gain":
    			fx = new Tone.Gain({gain: 0.7, channels: channels});
    			fxKnobs.appendChild(createFXKnob("gain", {fx: fx, default: 0.7}));
    			break;
    		case "limiter":
    			fx = new Tone.Limiter({threshold: -10, channels: channels});
    			fxKnobs.appendChild(createFXKnob("threshold", {fx: fx, default: -10, min: -40, max: 0}));
    			break;
    		case "vol":
    			fx = new Tone.PanVol({pan: 0, volume: 0, channels: 2});
    			fxKnobs.appendChild(createFXKnob("pan", {fx: fx, default: 0, min: -1, max: 1}));
    			fxKnobs.appendChild(createFXKnob("volume", {fx: fx, default: 0, min: -40, max: 5}));
    			break;
    		case "solo":
    			fx = new Tone.Solo();
    			sw = createSwitch("", (element) => {
        			fx.solo = element.target.checked;
    			});
    			fxKnobs.appendChild(sw);
    			break;
    		case "channel":
    			let panvol = new Tone.PanVol({pan: 0, volume: 0, channels: 2});
    			fxKnobs.appendChild(createFXKnob("pan", {fx: panvol, default: 0, min: -1, max: 1}));
    			fxKnobs.appendChild(createFXKnob("volume", {fx: panvol, default: 0, min: -40, max: 5}));
    			chain.push(panvol);

    			let solo = new Tone.Solo();
    			sw = createSwitch("solo", (element) => {
        			solo.solo = element.target.checked;
    			}, "src/switch_solo.png");
    			fxKnobs.appendChild(sw);
    			chain.push(solo);

    			fx = new Tone.Gain();
    			sw = createSwitch("mute", (element) => {
        			if(element.target.checked){
						fx.gain.rampTo(0, 0.05);
        			} else {
						fx.gain.rampTo(1, 0.05);
        			}
    			}, "src/switch_mute.png");
    			fxKnobs.appendChild(sw);
    			break;
    		case "meter":
    			fx = new Tone.Meter({channels: 2, normalRange: true});
    			let meter = new Meter(fx);
    			fxKnobs.appendChild(meter.getElement());
    			meters.push(meter);
    			break;
    		default:
    			console.log("did not recognise FX " + fxList[i]);
    			continue;
    	}

		if(!NON_BYPASSABLE.includes(fxType)){
        	const bypasssableFx = new BypassableFX(fx);
        	bypasssableFx.bypass = bypass;
        	if(bypass){
    			fxName.style.textDecoration = "line-through";
    			fxName.style.backgroundColor = "lightgray";
        	}

        	fxName.onclick = function(){
            	bypasssableFx.toggleBypass();
    			if(bypasssableFx.bypass){
    				fxName.style.textDecoration = "line-through";
    				fxName.style.backgroundColor = "lightgray";
    			} else {
    				fxName.style.textDecoration = "none";
    				fxName.style.backgroundColor = fxColor;
    			}
        	}

        	chain.push(bypasssableFx);
		} else {
			chain.push(fx);
		}

    	container.appendChild(fxBox);
    }

	for(let i = 0; i < chain.length - 1; i++){
		chain[i].connect(chain[i+1]);
	}

	return {
		"chain": chain,
		"container": container
	}
}

function recordLoop(){
	Tone.Transport.stop();
	play_btn.innerText = "--";
	document.getElementById("download-loop");

	let callback = play_btn.onclick;
	play_btn.onclick = null;

	Tone.Transport.loop = false;
	Tone.Transport.scheduleOnce((time) => {
		startRecording();

	}, 0);

	Tone.Transport.scheduleOnce(() => {
		stopRecording();
		Tone.Transport.stop(0);
		play_btn.onclick = callback;
    	play_btn.innerText = "▶";
    	Tone.Transport.loop = true;
	}, Tone.Transport.loopEnd);

	Tone.Transport.start();
}

function startRecording(){
    console.log("startRecording");
    recording = true;
	recorder.start();
}

async function stopRecording(){
    console.log("stopRecording");
    recording = false;
	const blob = await recorder.stop();
	const url = URL.createObjectURL(blob);

	download(url, "recording.webm");
}

function buildDrumControls(){
    for(let ins_name in DRUM_HUES){
		drumPlayers[ins_name] = new Tone.Player();
		drumPlayersVelocity[ins_name] = new Tone.Gain();
		drumBuffers[ins_name] = new Tone.ToneAudioBuffer();
		drumSampleToLoad[ins_name] = [];

		const channel = document.createElement("div");
		channel.classList.add("ins-channel");
		channel.setAttribute("ins", ins_name);
		//const colourStrip = document.createElement("div");
		//colourStrip.classList.add("stripe");
		//colourStrip.style.backgroundColor = "hsv(" + DRUM_HUES[ins_name] + ", 100%, 100%)";
		//channel.appendChild(colourStrip);

		// Sample controls
		const sampleRequestControls = document.createElement("div");
		sampleRequestControls.classList.add("sample-request-controls");

		const controlsContainer = document.createElement("div");
		controlsContainer.classList.add("controls-container");

		const ins_label = document.createElement("span");
		ins_label.classList.add("ins-label");
		ins_label.innerText = DRUM_LABELS[ins_name];
		sampleRequestControls.appendChild(ins_label);

		const requestNewBtn = document.createElement("div");
		requestNewBtn.className = "request-drum-samples btn";
		requestNewBtn.innerText = "new sample";
        requestNewBtn.onclick = () => {
            apiCall(id, ROOT_URL, "requestDrumSample", {instrument: ins_name})
            .then(data => {
                if(!data || !data["ok"]){
                    console.log("no drum sample data for " + ins_name);
                	return
                }
                const ds = data["drum_samples"];
                drumSampleZs[ins_name] = data["z"];
                drumSampleToLoad[ins_name] = [ds];
                updateDrumSamples();
           });
        }
        controlsContainer.appendChild(requestNewBtn);
        registerControl(() => requestNewBtn.click(), "trigger", "request", ins_name);

		const requestVariationBtn = document.createElement("div");
		requestVariationBtn.className = "request-drum-samples btn";
		requestVariationBtn.innerText = "variation";
        requestVariationBtn.onclick = () => {
            if(!drumSampleZs[ins_name]){
                console.log("cannot request variation of sample");
                return
            }
            apiPostCall(id, ROOT_URL, "requestDrumSample", {instrument: ins_name, z: drumSampleZs[ins_name]})
            .then(data => {
                if(!data || !data["ok"]){
                    console.log("no drum variation of sample data for " + ins_name);
                	return
                }
                const ds = data["drum_samples"];
                const z = data["z"];
                console.log("requestDrumSample");
                console.log(z);
                drumSampleZs[ins_name] = z;
                drumSampleToLoad[ins_name] = [ds];//drumSampleToLoad[ins_name].concat(ds);
                updateDrumSamples();
           });
        }
        controlsContainer.appendChild(requestVariationBtn);
        registerControl(() => requestVariationBtn.click(), "trigger", "variation", ins_name);

        const trigBtn = document.createElement("div");
        trigBtn.className = "btn";
        trigBtn.innerText = "▶";
        trigBtn.onclick = () => {
			if(drumBuffers[ins_name].loaded){
    			drumPlayers[ins_name].start(0, 0);
			}
        }
        controlsContainer.appendChild(trigBtn);

        const downloadBtn = document.createElement("div");
        downloadBtn.className = "btn";
        //downloadBtn.innerText = "";
        downloadBtn.innerHTML = '<i class="nf nf-mdi-download"></i>';

        downloadBtn.onclick = () => {
            if(drumSampleURL[ins_name]){
				const url = drumSampleURL[ins_name].url;
				const fp = drumSampleURL[ins_name].fp;

                console.log(url);
                console.log(fp);
				download(url, fp);
            }
        }
        controlsContainer.appendChild(downloadBtn);
        sampleRequestControls.appendChild(controlsContainer);

        const sampleName = document.createElement("span");
        sampleName.classList.add("drum-sample-name");
        sampleName.innerText = "---";
        sampleName.setAttribute("target", "_blank");
        drumSampleLabels[ins_name] = sampleName;
        sampleRequestControls.append(sampleName);

		channel.appendChild(sampleRequestControls);

		// FX Chain
		const { chain, container } = buildFXChain(DRUM_FX_CHAIN, 2, false, DRUM_HUES[ins_name]);
		registerFXChain(container, ins_name+"FX");
		channel.appendChild(container);

		document.getElementById("drum-channels").appendChild(channel);

    	drumPlayers[ins_name].connect(drumPlayersVelocity[ins_name]);
    	drumPlayersVelocity[ins_name].connect(chain[0]);

		drumChain[ins_name] = chain;
    }
}

function loadNewSamplerSample(data){
    const { sample, note, z } = data;

	const fp = getSamplePath(sample);
    const url = fp[1] + "/" + fp[2];

    const note_val = parseInt(60+note);
    let sampleMap = {};
    sampleMap[note_val] = url;
    sample_url = url;

    const tempSampler = new Tone.Sampler({
        urls: sampleMap,
        baseUrl: ROOT_URL + "sample/",
        onload: () => {
            console.log('loaded sample');
            if(sampler){
                sampler.dispose();
            }
            sampler = tempSampler;
            sampler.connect(soundChain[0]);
            soundSampleZ = z;
			const label = `${cleanName(fp[2])}`;
            document.getElementById("sampler-sample-name").innerText = label;
        }
    });
}


function buildBassControls(){
	const synthBox = document.createElement("div");
	const synthName = document.createElement("span");
	synthName.innerText = "Simple Bass Synth";
	synthName.classList.add("fx-name");

	const synthColor = "hsl(" + BASS_HUE + ", 100%, 80%)";
	synthName.style.backgroundColor = synthColor;
	synthBox.classList.add("fx-box");
	synthBox.appendChild(synthName);

	let synthKnobs = document.createElement("div");
	synthKnobs.classList.add("fx-knobs");
	synthBox.appendChild(synthKnobs);
	document.getElementById("bass-controls").appendChild(synthBox);

	// Amp Env
	let { knobContainer, knob } = createKnob("attack", {default: 0.0});
	knob.oninput = function(){
		bassSynth.envelope.attack = this.value;
	}
	registerControl(knob, "value", "bass", "attack");
	synthKnobs.appendChild(knobContainer);

	({ knobContainer, knob } = createKnob("decay", {default: 0.2}));
	knob.oninput = function(){
		bassSynth.envelope.decay= this.value;
	}
	registerControl(knob, "value", "bass", "decay");
	synthKnobs.appendChild(knobContainer);

	({ knobContainer, knob } = createKnob("sustain", {default: 0.8}));
	knob.oninput = function(){
		bassSynth.envelope.sustain= this.value;
	}
	registerControl(knob, "value", "bass", "sustain");
	synthKnobs.appendChild(knobContainer);

	({ knobContainer, knob } = createKnob("release", {default: 1.0}));
	knob.oninput = function(){
		bassSynth.envelope.release= this.value;
	}
	registerControl(knob, "value", "bass", "release");
	synthKnobs.appendChild(knobContainer);

	// Portmento
	({ knobContainer, knob } = createKnob("portamento", {default: 1.0}));
	knob.oninput = function(){
		bassSynth.portamento= this.value;
	}
	registerControl(knob, "value", "bass", "portamento");
	synthKnobs.appendChild(knobContainer);

	// filter
	let params = {default: 3.0, min: 1.0, max: 6.0};
	({ knobContainer, knob } = createKnob("octaves", params));
	knob.oninput = function(){
    	let val = this.value * (params.max - params.min) + params.min;
    	bassSynth.filterEnvelope.octaves = val;
	}
	registerControl(knob, "value", "bass", "octaves");
	synthKnobs.appendChild(knobContainer);

	params = {default: 1.0, min: 0.2, max: 10.0};
	({ knobContainer, knob } = createKnob("Q", params));
	knob.oninput = function(){
    	let val = this.value * (params.max - params.min) + params.min;
    	bassSynth.set({filter: {Q: val}});
	}
	registerControl(knob, "value", "bass", "q");
	synthKnobs.appendChild(knobContainer);

}

function buildSamplerControls(){
    const channel = document.getElementById("sound-controls");

	const sampleRequestControls = document.createElement("div");
	sampleRequestControls.classList.add("sample-request-controls");

	const controlsContainer = document.createElement("div");
	controlsContainer.classList.add("controls-container");

	const ins_label = document.createElement("span");
	ins_label.classList.add("ins-label");
	ins_label.innerText = "lead";
	sampleRequestControls.appendChild(ins_label);

	const requestNewBtn = document.createElement("div");
	requestNewBtn.className = "request-drum-samples btn";
	requestNewBtn.innerText = "new sample";
    requestNewBtn.onclick = () => {
        apiPostCall(id, ROOT_URL, "requestSamplerSound", {})
        .then(data => {
            if(!data || !data["ok"]){
				console.log("no sampler data");
				//requestNewBtn.click();
				return
            }

            loadNewSamplerSample(data);
        })
    }
    registerControl(() => requestNewBtn.click(), "trigger", "request", "sound_sample");
    controlsContainer.appendChild(requestNewBtn);

	const requestVarBtn = document.createElement("div");
	requestVarBtn.className = "request-drum-samples btn";
	requestVarBtn.innerText = "variation";
    requestVarBtn.onclick = () => {
        if(!soundSampleZ){
            console.log("need to request sound")
			return
        }
        apiPostCall(id, ROOT_URL, "requestSamplerSound", {variaion: true, z: soundSampleZ})
        .then(data => {
            if(!data || !data["ok"]){
				console.log("no sampler data");
				//requestNewBtn.click();
				return
            }

            loadNewSamplerSample(data);
        })
    }
    registerControl(() => requestNewBtn.click(), "trigger", "variation", "sound_sample");
    controlsContainer.appendChild(requestVarBtn);

    const trigBtn = document.createElement("div");
    trigBtn.className = "btn";
    trigBtn.innerText = "▶";
    trigBtn.onclick = () => {
		//drumPlayers[ins_name].start(0, 0);
        if(sampler){
            sampler.triggerAttackRelease(60);
        }
    }
    controlsContainer.appendChild(trigBtn);

    const downloadBtn = document.createElement("div");
    downloadBtn.className = "btn";
    downloadBtn.innerHTML = '<i class="nf nf-mdi-download"></i>';

    downloadBtn.onclick = () => {
        if(sample_url){
            console.log(sample_url)
            download("sample/" + sample_url, "lead.wav");
        }
    }
    controlsContainer.appendChild(downloadBtn);
    
    sampleRequestControls.appendChild(controlsContainer);
    channel.appendChild(sampleRequestControls);

    const sampleName = document.createElement("span");
    sampleName.classList.add("drum-sample-name");
    sampleName.id = "sampler-sample-name";
    sampleName.innerText = "---";
    sampleName.setAttribute("target", "_blank");
    //drumSampleLabels[ins_name] = sampleName;
    sampleRequestControls.append(sampleName);
	const synthBox = document.createElement("div");
	const synthName = document.createElement("span");
	synthName.innerText = "Sampler";
	synthName.classList.add("fx-name");

	const synthColor = "hsl(" + SOUND_HUE + ", 100%, 80%)";
	synthName.style.backgroundColor = synthColor;
	synthBox.classList.add("fx-box");
	synthBox.appendChild(synthName);

	let synthKnobs = document.createElement("div");
	synthKnobs.classList.add("fx-knobs");
	synthBox.appendChild(synthKnobs);
	channel.appendChild(synthBox);

	let { knobContainer, knob } = createKnob("attack", {default: 0.0});
	knob.oninput = function(){
        if(sampler){
            sampler.attack = this.value;
        }
        samplerParams.attack = this.value
	}
	registerControl(knob, "value", "sampler", "attack");
	synthKnobs.appendChild(knobContainer);

	({ knobContainer, knob } = createKnob("release", {default: 0.0}));
	knob.oninput = function(){
        if(sampler){
            sampler.release = this.value;
        }
        samplerParams.release = this.value
	}
	registerControl(knob, "value", "sampler", "release");
	synthKnobs.appendChild(knobContainer);
}

function setup(){
    buildDrumControls();
    buildBassControls();
    buildSamplerControls();

    // build SYNTH FXs chain
	let { chain, container } = buildFXChain(SOUND_FX_CHAIN, 2, false, SOUND_HUE);
	registerFXChain(container, "samplerFX");
	const soundChannel = document.createElement("div");
	soundChannel.appendChild(container);
	document.getElementById("sound-controls").appendChild(soundChannel);
	soundChain = chain;

	// build BASS FXs chain
	({ chain, container } = buildFXChain(BASS_FX_CHAIN, 2, false, BASS_HUE));
	registerFXChain(container, "bassFX");
	const bassChannel = document.createElement("div");
	bassChannel.appendChild(container);
	document.getElementById("bass-controls").appendChild(bassChannel);
	bassChain = chain;
	bassSynth.connect(bassChain[0]);

    // build MASTER FXs chain
    ({ chain, container } = buildFXChain(MASTER_FX_CHAIN, 2, true));
    registerFXChain(container, "masterFX");
	const masterChannel = document.createElement("div");
	masterChannel.classList.add("ins-channel");
	masterChannel.appendChild(container);
    document.getElementById("master-controls").appendChild(masterChannel);
    masterChain = chain;
    masterChain[masterChain.length - 1].toDestination();
    soundChain[soundChain.length - 1].connect(masterChain[0]);
    bassChain[bassChain.length - 1].connect(masterChain[0]);
    for(let ins_name in DRUM_HUES){
        drumChain[ins_name][drumChain[ins_name].length - 1].connect(masterChain[0]);
    }

    masterChain[masterChain.length - 1].connect(recorder);
}

function updateDrumSamples(){
	for(let ins_name in DRUM_HUES){
    	if(drumSampleToLoad[ins_name] && drumSampleToLoad[ins_name].length > 0){

			const fp = getSamplePath(drumSampleToLoad[ins_name][0]);
            const url = ROOT_URL + "drum/" + fp[0] + "/" + fp[1] + "/" + fp[2];

            drumBuffers[ins_name].load(url)
            .then((buffer) => {
                drumPlayers[ins_name].stop();
                drumPlayers[ins_name].buffer = buffer;
            });

			const label = `${cleanName(fp[2])}`;
			drumSampleLabels[ins_name].innerText = label;
			drumSampleURL[ins_name] = {url: url, fp: fp};
    	}
	}
}

function updateSoundSamples(){
    for(let sb of soundArrangement.arrangement){
        if(!sb) continue;
        const urls = sb.samples;
    	for(let url of urls){
    		const fp = getSamplePath(url);
    		if(soundPlayers.has(fp[2])) continue;

		const fn = fp[2].replace('.wav', '.mp3');
    		const u = fp[0] + "/" + fp[1] + "/" + fn;
			soundPlayers.add(fp[2], u);
    	}
    }
}

function updateAudioTimes(){
	for(let db of drumPattern){
		db.update(threshold);
	}
	if(drumPattern.length > 0){
    	drumPattern[0].start(0);
	}
}

function nextBar(){

	updateDrumSamples();
	for(let ins_name in drumSampleToLoad){
    	if(drumSampleToLoad[ins_name]){
        	drumSampleToLoad[ins_name].shift(); // = null;
    	}
	}
}

function selectBar(slot, pool, bar){
	for(const b of pool){
    	b.element.style.borderColor = "black";
	}
	bar.element.style.borderColor = "white";
	slot[0] = bar;
}

function addBar(arrangement, arrangementView, bar){
    arrangement.add(bar);
    arrangement.start(0);
	drawArrangementView(arrangement, arrangementView);
}

function removeBar(i, arrangement, arrangementView){
    arrangement.remove(i);
    arrangement.start(0);
	drawArrangementView(arrangement, arrangementView);
}

function deleteBar(bar, barPool, arrangement, arrangementView, slot, oscAddr=null){
    // remove from pool
    const idx = barPool.indexOf(bar);
    if(idx > -1){
        barPool.splice(idx, 1);
    }

	// remove from selectedSlot
	if(slot[0] == bar){
    	slot[0] = undefined;
    	for(const b of barPool){
        	b.element.style.borderColor = "black";
    	}
	}

    // remove from arrangement
    for(let i = 0; i < arrangement.length; i++){
        if(arrangement.at(i) == bar){
            arrangement.remove(i);
        }
    }

    // redraw arrangementView
    drawArrangementView(arrangement, arrangementView);

    // delete element (animated)
    bar.element.style.maxWidth = "0px";
    bar.element.style.minWidth = "0px";
    setTimeout(() => {
		bar.element.remove()
    }, 200);

    // send oscMsg if possible
	if(oscAddr){
    	sendOSC(oscAddr, barPool.length)
	}
}

function drawArrangementView(arrangement, arrangementView){
    while(arrangementView.hasChildNodes()){
        arrangementView.removeChild(arrangementView.firstChild);
    }
    for(let i = 0; i < arrangement.length; i++){
        const bar = arrangement.at(i);
        if(!bar){
            continue
        }
        const barCanvas = document.createElement("canvas");
        barCanvas.classList.add("bar-arrangement");
        barCanvas.style.left = i*200 + "px";
        arrangementView.appendChild(barCanvas);
        bar.renderToCanvas(barCanvas, true);

        barCanvas.onclick = () => {
            removeBar(i, arrangement, arrangementView);
        }
    }
}

function recievedNewBar(
    data,
    barClass,
    barPool,
    barPoolView,
    arrangement,
    arrangementView,
    slot,
    barName="bar",
    hue=null,
    oscAddr=null,
    noteHue=0,
){
    const notes = data["notes"];
    const z = data["z"];
    const bar = new barClass(notes, hue, noteHue);
    bar.z = z;
    const {barElement, barCanvas, barDelete, barAdd} = createBarElement(barName, bar.hue);
    bar.addElement(barElement);
    bar.element.onclick = (event) => {
        selectBar(slot, barPool, bar);
    }
    bar.element.ondblclick = (event) => {
        addBar(arrangement, arrangementView, bar);
    }
    barAdd.onclick = (event) => {
        addBar(arrangement, arrangementView, bar);
    }

    barDelete.onclick = (event) => {
        event.preventDefault();
        deleteBar(bar, barPool, arrangement, arrangementView, slot, oscMsg);
    }
    barPool.push(bar);
   	barPoolView.appendChild(bar.element);
   	bar.element.click();
   	if(arrangement.isEmpty()){
        addBar(arrangement, arrangementView, bar);
   	}
	bar.renderToCanvas(barCanvas)

	if(oscAddr){
    	sendOSC(oscAddr, barPool.length)
	}

	return bar;
}

window.onload = () => {
    // register user
    apiCall(id, ROOT_URL, "registerSession")
    .then(data => {
        console.log("Register session complete");
    });

	setup();

    // Setup controls
    document.getElementById("request-new-grid").onclick = () => {
        apiCall(id, ROOT_URL, "requestDrumPattern")
        .then(data => {
            if(!data || !data["ok"]){
                console.log("no drum pattern data");
            	return
            }

            recievedNewBar(
                data,
                DrumBar,
                drumPool,
                document.getElementById("drum-pool"),
                drumArrangement,
                document.getElementById("drum-arrangement"),
                selectedDrumBar,
                "~",
                null,
                "/drum/pool",
            )

            //sendOSC("/drum/pool", drumPool.length);

            drumLastHue += 12;
        });
    }
    registerControl(() => document.getElementById("request-new-grid").click(), "trigger", "request", "drums");

    document.getElementById("request-variation-grid").onclick = () => {
        if(!selectedDrumBar[0] || !selectedDrumBar[0].z){
            console.log("not sending POST request (can not make variation)");
            return
        }

        apiPostCall(id, ROOT_URL, "requestDrumPattern", {
            z: selectedDrumBar[0].z,
        })
    	.then(data => {
            if(!data || !data["ok"]){
				console.log("no drum pattern data");
				return
            }

            const hue = selectedDrumBar[0].hue + 10;

            recievedNewBar(
                data,
                DrumBar,
                drumPool,
                document.getElementById("drum-pool"),
                drumArrangement,
                document.getElementById("drum-arrangement"),
                selectedDrumBar,
                "*",
                null,
                "/drum/pool",
            )
    	})
    }
    registerControl(() => document.getElementById("request-variation-grid").click(), "trigger", "variation", "drums");

    document.getElementById("request-new-bassline").onclick = () => {
        apiCall(id, ROOT_URL, "requestBassline", {})
        .then(data => {
            if(!data || !data["ok"]){
				console.log("no bassline data");
				return
            }

            recievedNewBar(
                data,
                BassBar,
                bassPool,
                document.getElementById("bass-pool"),
                bassArrangement,
                document.getElementById("bass-arrangement"),
                selectedBassBar,
                "~ ",
                null,
                "/bass/pool",
                BASS_HUE,
            );

            bassLastHue += 12;
        })
    }
    registerControl(() => document.getElementById("request-new-bassline").click(), "trigger", "request", "bassline");

    document.getElementById("request-variation-bassline").onclick = () => {
        if(!selectedBassBar[0] || !selectedBassBar[0].z){
            console.log("not sending POST request (can not make variation)");
            return
        }

        apiPostCall(id, ROOT_URL, "requestBassline", {
            z: selectedBassBar[0].z,
        })
    	.then(data => {
            if(!data || !data["ok"]){
				console.log("no bassline data");
				return
            }

            const hue = selectedBassBar[0].hue + 10;
            recievedNewBar(
                data,
                BassBar,
                bassPool,
                document.getElementById("bass-pool"),
                bassArrangement,
                document.getElementById("bass-arrangement"),
                selectedBassBar,
                "*",
                null,
                "/bass/pool",
                BASS_HUE,
            );
    	})
    }
    registerControl(() => document.getElementById("request-variation-bassline").click(), "trigger", "variation", "bassline");

    document.getElementById("request-new-melody").onclick = () => {
        apiCall(id, ROOT_URL, "requestMelody", {})
        .then(data => {
            if(!data || !data["ok"]){
				console.log("no melody data");
				return
            }

            recievedNewBar(
                data,
                BassBar,
                soundPool,
                document.getElementById("sampler-pool"),
                soundArrangement,
                document.getElementById("sampler-arrangement"),
                selectedSoundBar,
                "~ ",
                null,
                "/sampler/pool",
                SOUND_HUE,
            );

            soundLastHue += 12;
        })
    }
    registerControl(() => document.getElementById("request-new-melody").click(), "trigger", "request", "melody");

    document.getElementById("request-variation-melody").onclick = () => {
        if(!selectedSoundBar[0] || !selectedSoundBar[0].z){
            console.log("not sending POST request (can not make variation)");
            return
        }
        apiPostCall(id, ROOT_URL, "requestMelody", {
            z: selectedSoundBar[0].z,
        })
    	.then(data => {
            if(!data || !data["ok"]){
				console.log("no melody data");
				return
            }

            const hue = selectedSoundBar[0].hue + 10;
            recievedNewBar(
                data,
                BassBar,
                soundPool,
                document.getElementById("sampler-pool"),
                soundArrangement,
                document.getElementById("sampler-arrangement"),
                selectedSoundBar,
                "*",
                null,
                "/sampler/pool",
                SOUND_HUE,
            );
    	})
    }
    registerControl(() => document.getElementById("request-variation-melody").click(), "trigger", "variation", "melody");

	registerControl((args) => {
    	if(args[0] >= bassPool.length){
        	return
    	}
    	const e = new MouseEvent('dblclick', {
        	view: window, 'bubbles': true, 'cancelable': true,
    	})
		bassPool[args[0]].element.dispatchEvent(e);
		bassPool[args[0]].element.click();
	}, "trigger", "add", "bassline");

	registerControl((args) => {
    	removeBar(args[0], bassArrangement, document.getElementById("bass-arrangement"));
	}, "trigger", "remove", "bassline");

	registerControl((args) => {
		bassPool[args[0]].element.click();
    	deleteBar(bassPool[args[0]], bassPool, bassArrangement, document.getElementById("bass-arrangement"), selectedBassBar, "/bass/pool");
	}, "trigger", "delete", "bassline");

	registerControl((args) => {
    	if(args[0] >= drumPool.length){
        	return
    	}
    	const e = new MouseEvent('dblclick', {
        	view: window, 'bubbles': true, 'cancelable': true,
    	})
		drumPool[args[0]].element.dispatchEvent(e);
		drumPool[args[0]].element.click();
	}, "trigger", "add", "drums");

	registerControl((args) => {
    	removeBar(args[0], drumArrangement, document.getElementById("drum-arrangement"));
	}, "trigger", "remove", "drums");

	registerControl((args) => {
		drumPool[args[0]].element.click();
    	deleteBar(drumPool[args[0]], drumPool, drumArrangement, document.getElementById("drum-arrangement"), selectedDrumBar, "drum/pool");
	}, "trigger", "delete", "drums");

	registerControl((args) => {
    	if(args[0] >= soundPool.length){
        	return
    	}
    	const e = new MouseEvent('dblclick', {
        	view: window, 'bubbles': true, 'cancelable': true,
    	})
		soundPool[args[0]].element.dispatchEvent(e);
		soundPool[args[0]].element.click();
	}, "trigger", "add", "melody");

	registerControl((args) => {
    	removeBar(args[0], soundArrangement, document.getElementById("sampler-arrangement"));
	}, "trigger", "remove", "melody");

	registerControl((args) => {
		soundPool[args[0]].element.click();
    	deleteBar(soundPool[args[0]], soundPool, soundArrangement, document.getElementById("sampler-arrangement"), selectedSoundBar, "/sampler/pool");
	}, "trigger", "delete", "melody");

    play_btn.onclick = () => {
        Tone.start();
        if(Tone.Transport.state == "started"){
        	Tone.Transport.stop();
        	play_btn.innerText = "▶";
        	sendOSC("/audio/playing", 0);
        } else {
        	Tone.Transport.start();
        	play_btn.innerText = "■";
        	sendOSC("/audio/bpm", Tone.Transport.bpm.value);
        	sendOSC("/audio/playing", 1);
        }
    }
    registerControl(() => play_btn.click, "trigger", "transport", "play");

	const bpmElement = document.getElementById("bpm");
	const updateBPM = function(d){
    	let newBpm = Math.round(Tone.Transport.bpm.value + d);
    	newBpm = Math.min(Math.max(60, newBpm), 180);
		Tone.Transport.bpm.value = newBpm;
		bpmElement.children[0].innerText = newBpm;
		sendOSC("/audio/bpm", newBpm);
	}
	bpmElement.children[1].onclick = () => {
    	updateBPM(-1);
    };
	bpmElement.children[2].onclick = () => {
    	updateBPM(1);
    };

	const loopLengthSelection = document.getElementById("loop-length");
    loopLengthSelection.oninput = function(){
        loopLength = this.value;
        const bars = Math.floor(loopLength);
        const quarters = Math.floor(4*loopLength) % 4;
        const sixteenths = Math.floor(16*loopLength) % 4;
        Tone.Transport.loopEnd = `${bars}:${quarters}:${sixteenths}`;
		drawTimeline();
    }
    loopLengthSelection.value = "4";
	registerControl(loopLengthSelection, "selection", "loopLength");

    //document.getElementById("download-loop").onclick = () => {
	//	recordLoop();
    //}

    let drumThresholdKnob = document.getElementById("drum-threshold");
	drumThresholdKnob.setAttribute("data-src", "src/knob_digital.png");
	drumThresholdKnob.setAttribute("data-diameter", "50");
	drumThresholdKnob.setAttribute("min", "0");
	drumThresholdKnob.setAttribute("max", "0.5");
	drumThresholdKnob.setAttribute("step","0.01");
	drumThresholdKnob.setAttribute("data-sprites", "127");

    drumThresholdKnob.value = threshold;
    drumThresholdKnob.oninput = function(){
        drumArrangement.threshold = this.value;
        drumArrangement.updatePart();
        drawArrangementView(drumArrangement, document.getElementById("drum-arrangement"));
    }
    registerControl(drumThresholdKnob, "value", "drums", "threshold");

	const drumMidiDownload = document.getElementById("drum-midi-download");
	drumMidiDownload.onclick = function() {
    	const midi = drumArrangement.toMidi();
		download(midi, "drum_pattern.mid");
	}

	const bassMidiDownload = document.getElementById("bassline-midi-download");
	bassMidiDownload.onclick = function() {
    	const midi = bassArrangement.toMidi();
		download(midi, "bassline.mid");
	}

	const OSCloop = new Tone.Loop((time) => {
    	const now = Tone.Transport.position.split(":");
    	const bar = parseInt(now[0]);
    	const beat = parseInt(now[1]);
    	//const sixteenths = parseInt(now[2]);
    	sendOSC("/audio/transport", bar, beat);
	}, "4n").start(0);

	const transportControlsLoop = new Tone.Loop((time) => {
    	const transportTime = document.getElementById("transport-time");
    	Tone.Draw.schedule(()=>{
        	const time = Tone.Transport.position.slice(0, 5);
        	transportTime.innerText = time;
    	}, time)
	}, "16n").start(0);

	drawTimeline();

	// set draw loop
    setInterval(() => {
    	const p = Tone.Transport.progress;
    	const loopEnd = loopLength * 0.25;
    	for(let pbar of document.getElementsByClassName("p-bar")){
			pbar.style.left = Math.min(100, p*loopEnd*100) + "%";
    	}

    	for(let meter of meters){
			meter.update();
    	}
    }, 1000/30);

	// finally, scale everything to fit the window
	const waive = document.querySelector("#waive");
	console.log(window.innerWidth);
	console.log(waive.offsetWidth);
	let scale = Math.min(1, window.innerWidth / waive.offsetWidth);
	console.log(scale);

	waive.style.transform = "translate(-25%, 0%) scale(" + scale + ")";
	waive.style.width = waive.offsetWidth + "px";

}

window.onresize = () => {
}
