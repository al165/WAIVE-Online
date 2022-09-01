import * as Tone from 'tone';
import './style.css';
import './input-knobs.js';
import './knob.png';
import './slider.png';

import { createKnob, createSelection, createSwitch, Meter } from './gui.js';

const STOPPED = 0;
const STARTED = 1;

const ROOT_URL = "/waive";

Tone.Transport.bpm.value = 110;
Tone.Transport.loop = true;
Tone.Transport.loopEnd = "1m";

let play_btn = document.getElementById("play");

const beatcanvas = document.getElementById("beatgrid");
const beatgrid = beatcanvas.getContext("2d");
const beatarrangementcanvas = document.getElementById("beatgrid-arrangement");
const beatarrangementgrid = beatarrangementcanvas.getContext("2d");

const soundcanvas = document.getElementById("soundgrid");
const soundgrid = soundcanvas.getContext("2d");
const soundarrangementcanvas = document.getElementById("soundgrid-arrangement");
const soundarrangementgrid = soundarrangementcanvas.getContext("2d");

const id = "test";

let drumPattern = [];
let soundPattern = [];
let soundSamples = [];
let soundPlayers = new Tone.Players({baseUrl: ROOT_URL + "/sound/"});


// FX Chains
const DRUM_FX_CHAIN = [
	'compressor', 'eq3', 'vol', 'solo', 'meter',
]

const SOUND_FX_CHAIN = [
	'delay', 'reverb', 'phaser', 'autofilter', 'filter', 'vol', 'solo', 'meter',
]

const MASTER_FX_CHAIN = [
	'meter', 'delay', 'reverb', 'filter', 'eq3', 'compressor', 'limiter', 'gain', 'meter'
]

const NON_BYPASSABLE = ['meter', 'vol', 'solo', 'gain'];

let threshold = 0.2;

let drumSamples = {
	"00_KD": [],
	"01_SD": [],
	"02_HH": [],
}

let drumSampleToLoad = {
    "00_KD": [],
	"01_SD": [],
	"02_HH": [],
}

let drumBuffers = {
    "00_KD": new Tone.ToneAudioBuffer(),
    "01_SD": new Tone.ToneAudioBuffer(),
    "02_HH": new Tone.ToneAudioBuffer(),
}

let drumPlayers = {
    "00_KD": new Tone.Player(),
    "01_SD": new Tone.Player(),
    "02_HH": new Tone.Player(),
}

let drumParts = {
    "00_KD": null,
    "01_SD": null,
    "02_HH": null,
}

const DRUMCOLORS = {
	"00_KD": "#F44",
	"01_SD": "#FA4",
	"02_HH": "#FF8",
}

const drumSampleLabels = {};

const INS_NAMES = {
	0: "00_KD",
	1: "01_SD",
	2: "02_HH",
}


let drumChain = {};
let soundChain = [];
let masterChain = []
let meters = [];


class DrumBar {
	constructor(beat_grid, threshold) {
		this.beat_grid = beat_grid;
		this.parts = {};
		// avoid unneccessary updates
		this.last_threshold = null;

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
    		const ins_name = INS_NAMES[i];
    		let timings = [];
			for(let j=0; j<this.beat_grid[i].length; j++){
				if(this.beat_grid[i][j] < threshold){
    				continue
				}

    			const time = j*48+"i";
    			timings.push([time, "A1"]);
        	}

        	let part = new Tone.Part((time, note) => {
            	if(drumBuffers[ins_name].loaded){
            		drumPlayers[ins_name].start(time, 0, "16t");
            	}
        	}, timings);

			if(this.parts[ins_name]){
    			this.parts[ins_name].dispose();
			}
			this.parts[ins_name] = part;
		}

		this.last_threshold = threshold;
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
}

class SoundBar {
	constructor(pattern, samples){
		this.pattern = pattern;
		this.samples = samples;

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
			soundPlayers.player(val.fn).start(time, 0, val.length)
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


function apiCall(m_type, data) {
    if(!data){
        data = {};
    }

    let parameters = '?';
    for(const key in data){
		parameters += key + "=" + data[key] + "&";
    }

	return fetch(`${ROOT_URL}/api/${m_type}/${id}${parameters}`)
	.then(response => {
		if(!response.ok){
    		throw new Error(`request for ${ROOT_URL}/api/${m_type}/${id}${parameters} failed with status ${response.status}`);
		}
		return response.json();
	})
	.then(data => {
		//console.log(data);
		//document.getElementById("request-result").innerText = "DEBUG:\n" + JSON.stringify(data);
		return data;
	})
	.catch(error => console.log(error));
}


// Beat grid display
function drawBeatGrid() {
    const blockHeight = beatcanvas.height/3;
    const blockWidth = beatcanvas.width/16;

    beatgrid.clearRect(0, 0, beatcanvas.width, beatcanvas.height);
	beatarrangementgrid.fillStyle = "#AAA";
	beatarrangementgrid.fillRect(0, 0, beatarrangementcanvas.width, beatarrangementcanvas.height);

    // draw grid outline
 	for(let j = 0; j <= 16; j++){
     	if(j%8 == 0){
			beatgrid.fillStyle = "#AAA";
			beatgrid.fillRect(j*blockWidth, 0, 4*blockWidth, beatcanvas.height);
     	}
    	beatgrid.strokeStyle = "#666";
    	beatgrid.beginPath();
    	beatgrid.moveTo(j*blockWidth, 0);
    	beatgrid.lineTo(j*blockWidth, beatcanvas.height);
    	beatgrid.stroke();
 	}

	for(let i = 0; i <= 3; i++){
    	beatgrid.strokeStyle = "#666";
    	beatgrid.beginPath();
    	beatgrid.moveTo(0, i*blockHeight);
    	beatgrid.lineTo(beatcanvas.width, i*blockHeight);
    	beatgrid.stroke();
	}

	// Draw triggers
	if(!drumPattern || drumPattern.length == 0){
    	return
	}

	let beat = drumPattern[0];
	let beat_grid = beat.beat_grid;

	for(let i = 0; i < 3; i++){
    	const ins_name = INS_NAMES[i];
		beatgrid.fillStyle = DRUMCOLORS[ins_name];
		beatgrid.strokeStyle = "#F00";

     	for(let j = 0; j < 16; j++){
			if(beat_grid[i][j] < threshold){
    			continue;
			}

			beatgrid.fillRect(j*blockWidth, i*blockHeight, blockWidth, blockHeight);
			beatgrid.strokeRect(j*blockWidth, i*blockHeight, blockWidth, blockHeight);
    	}
	}


	for(let k=0; k<drumPattern.length; k++){
		beat = drumPattern[k];
		beat_grid = beat.beat_grid;

		const barwidth = 2*blockWidth;
		const barheight = beatarrangementcanvas.height;

		beatarrangementgrid.fillStyle = "#444";
		beatarrangementgrid.fillRect(k*barwidth, 0, barwidth-2, barheight);

		beatarrangementgrid.fillStyle = "#CCC";
		beatarrangementgrid.textBaseline = "top";
		beatarrangementgrid.fillText(k+1, k*barwidth + 3, 3);

		for(let i = 0; i < 3; i++){
    		beatarrangementgrid.fillStyle = DRUMCOLORS[INS_NAMES[i]];
    		for(let j = 0; j < 16; j++){
        		if(beat_grid[i][j] < threshold){
            		continue
        		}

        		beatarrangementgrid.fillRect(
            		k*barwidth+j*((barwidth-2)/16),
            		barheight*0.5*(0.5 + i/3),
            		(barwidth-2)/16,
            		(barheight*0.5)/3
        		);
    		}
		}
	}
}

function drawSoundGrid(){
    const blockHeight = soundcanvas.height;
    const blockWidth = soundcanvas.width/16;

    soundgrid.clearRect(0, 0, soundcanvas.width, soundcanvas.height);
	soundarrangementgrid.fillStyle = "#AAA";
	soundarrangementgrid.fillRect(0, 0, soundarrangementcanvas.width, soundarrangementcanvas.height);

 	for(let j = 0; j < 16; j++){
     	if(j%8 == 0){
			soundgrid.fillStyle = "#AAA";
			soundgrid.fillRect(j*blockWidth, 0, 4*blockWidth, beatcanvas.height);
     	}
    	soundgrid.strokeStyle = "#666";
    	soundgrid.beginPath();
    	soundgrid.moveTo(j*blockWidth, 0);
    	soundgrid.lineTo(j*blockWidth, soundcanvas.height);
    	soundgrid.stroke();
 	}

	soundgrid.lineWidth = 4;
 	for(let i = 0; i < 2; i++){
    	soundgrid.strokeStyle = "#666";
    	soundgrid.beginPath();
    	soundgrid.moveTo(0, i*blockHeight-1);
    	soundgrid.lineTo(soundcanvas.width, i*blockHeight-1);
    	soundgrid.stroke();
 	}

	// Draw triggers
	if(!soundPattern || soundPattern.length == 0){
    	return
	}

	const sb = soundPattern[0];
	let start;
	let end;
	for(let i = 0; i < sb.pattern.length; i++){
    	const p = sb.pattern[i];
		start = p[0];
		end = p[1];
		soundgrid.fillStyle = 'hsl(' + 360*start/16 + ', 50%, 50%)';
		soundgrid.fillRect(start*blockWidth+1, 10, (end - start)*blockWidth-2, blockHeight-20);

		const url = sb.samples[i];
		const fp = cleanName(getSamplePath(url)[2]);
		soundgrid.fillStyle = "black";
		soundgrid.textBaseline = "top";
		soundgrid.fillText(fp, start*blockWidth+3, blockHeight/2 - 5);
	}

	const barWidth = blockWidth*2;
	const barHeight = soundarrangementcanvas.height;

	for(let k = 0; k < soundPattern.length; k++){
		soundarrangementgrid.fillStyle = "#444";
		soundarrangementgrid.fillRect(k*barWidth, 0, barWidth-2, barHeight);
		soundarrangementgrid.fillStyle = "#CCC";
		soundarrangementgrid.textBaseline = "top";
		soundarrangementgrid.fillText(k+1, k*barWidth + 3, 3);

    	for(let p of soundPattern[k].pattern){
        	start = p[0];
        	end = p[1];
    		soundarrangementgrid.fillStyle = 'hsl(' + 360*start/16 + ', 50%, 50%)';
    		soundarrangementgrid.fillRect(
        		k*barWidth+start*(barWidth-2)/16,
        		barHeight/2 - 5,
        		(end-start)*(barWidth-2)/16,
        		10
    		);
    	}
	}
}


function getSamplePath(full_path){

	const fp = full_path.split("/");

	const sample_category = fp[fp.length - 3];
	const sample_folder = fp[fp.length - 2];
	const sample_name = fp[fp.length - 1];

	return [sample_category, sample_folder, sample_name];
}

/* wrapper for effect class / bus
    https://github.com/Tonejs/Tone.js/issues/187
*/
class BypassableFX extends Tone.ToneAudioNode {
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


function buildFXChain(fxList, channels=2, bypass=false){
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
    	const fxColor = "hsl(" + (64 * i/fxList.length + 30) + ", 50%, 50%)";
    	fxName.style.backgroundColor = fxColor;
    	fxBox.classList.add("fx-box");
    	fxBox.appendChild(fxName);
    	let fxKnobs = document.createElement("div");
    	fxKnobs.classList.add("fx-knobs");
    	fxBox.appendChild(fxKnobs);

    	switch(fxType){
    		case "delay":
    			fx = new Tone.FeedbackDelay({feedback: 0.0, delayTime: 0.2, wet: 0.5, channels: channels});
    			fxKnobs.appendChild(createKnob("feedback", {fx: fx, default: 0.0}));
    			fxKnobs.appendChild(createKnob("delayTime", {fx: fx, default: 0.2}));
    			break;
    		case "reverb":
    			fx = new Tone.Reverb({wet: 0.7, decay: 1.0, channels: channels});
    			fxKnobs.appendChild(createKnob("decay", {fx: fx, default: 1.0}));
    			fxKnobs.appendChild(createKnob("wet", {fx: fx, default: 0.7}));
    			break;
    		case "compressor":
    			fx = new Tone.Compressor({attack: 0.01, release: 0.1, ratio: 3, threshold: -30, channels: channels});
    			fxKnobs.appendChild(createKnob("attack", {fx: fx, default: 0.01}));
    			fxKnobs.appendChild(createKnob("release", {fx: fx, default: 0.1}));
    			fxKnobs.appendChild(createKnob("ratio", {fx: fx, default: 3, min: 1, max: 10}));
    			fxKnobs.appendChild(createKnob("threshold", {fx: fx, default: -30, min: -60, max: 0}));
    			break;
    		case "lowpass":
    			fx = new Tone.Filter({frequency: 200, type: "lowpass", channels: channels});
    			fxKnobs.appendChild(createKnob("frequency", {fx: fx, default: 20000, min: 40, max: 20000}));
    			break;
    		case "filter":
    			fx = new Tone.Filter({frequency: 2000, type: "lowpass", Q: 1.0, channels: channels});
    			fxKnobs.appendChild(createSelection("type", ["lowpass", "highpass", "bandpass"], fx));
    			fxKnobs.appendChild(createKnob("frequency", {fx: fx, default: 2000, min: 40, max: 15000}));
    			fxKnobs.appendChild(createKnob("Q", {fx: fx, default: 1.0, min: 0, max: 5}));
    			break;
    		case "autofilter":
				fx = new Tone.AutoFilter({baseFrequency: 1000, frequency: 2, octaves: 4, depth: 0.5, wet: 0.5, channels: channels});
    			fxKnobs.appendChild(createKnob("frequency", {fx: fx, default: 2, min: 0.1, max: 20}));
    			fxKnobs.appendChild(createKnob("depth", {fx: fx, default: 0.5, min: 0.0, max: 1.0}));
    			fxKnobs.appendChild(createKnob("wet", {fx: fx, default: 0.5, min: 0.0, max: 1.0}));
    			break;
    		case "phaser":
    			fx = new Tone.Phaser({frequency: 15, octaves: 5, baseFrequency: 1000, channels: channels});
    			fxKnobs.appendChild(createKnob("frequency", {fx: fx, default: 5, min: 0.1, max: 20}));
    			break;
    		case "eq3":
    			fx = new Tone.EQ3({highFrequency: 2000, lowFrequency: 100, channels: channels});
    			fxKnobs.appendChild(createKnob("low", {fx: fx, default: 1.0, max: 5.0, min: -24}));
    			fxKnobs.appendChild(createKnob("mid", {fx: fx, default: 1.0, max: 5.0, min: -24}));
    			fxKnobs.appendChild(createKnob("high", {fx: fx, default: 1.0, max: 5.0, min: -24}));
    			break;
    		case "gain":
    			fx = new Tone.Gain({gain: 0.7, channels: channels});
    			fxKnobs.appendChild(createKnob("gain", {fx: fx, default: 0.7}));
    			break;
    		case "limiter":
    			fx = new Tone.Limiter({threshold: -10, channels: channels});
    			fxKnobs.appendChild(createKnob("threshold", {fx: fx, default: -10, min: -40, max: 0}));
    			break;
    		case "vol":
    			fx = new Tone.PanVol({pan: 0, volume: 0, channels: 2});
    			fxKnobs.appendChild(createKnob("pan", {fx: fx, default: 0, min: -1, max: 1}));
    			fxKnobs.appendChild(createKnob("volume", {fx: fx, default: 0, min: -40, max: 5}));
    			break;
    		case "solo":
    			fx = new Tone.Solo();
    			let sw = createSwitch("", (element) => {
        			fx.solo = element.target.checked;
    			});
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

	//console.log(" == effects channels:");
	for(let i = 0; i < chain.length - 1; i++){
		chain[i].connect(chain[i+1]);
		//console.log(`${fxList[i]} ${chain[i].numberOfInputs} ${chain[i].numberOfOutputs} ${chain[i].channelCount}`);
	}

	return {
		"chain": chain,
		"container": container
	}
}


function setup(){
    // build DRUM FXs chain and controls
    for(let ins_name in drumSamples){
		const channel = document.createElement("div");
		channel.classList.add("ins-channel");
		channel.setAttribute("ins", ins_name);

		// Sample controls
		const sampleRequestControls = document.createElement("div");
		sampleRequestControls.classList.add("sample-request-controls");

		const requestBtn = document.createElement("div");
		requestBtn.className = "request-drum-samples btn";
		requestBtn.innerText = "new sample";
        requestBtn.onclick = () => {
            apiCall("requestDrumSample", {instrument: ins_name})
            .then(data => {
                if(!data || !data["ok"]){
                    console.log("no drum sample data for " + ins_name);
                	return
                }
                const ds = data["drum_samples"];
                drumSampleToLoad[ins_name] = drumSampleToLoad[ins_name].concat(ds);
                updateDrumSamples();
           });
        }
        sampleRequestControls.appendChild(requestBtn);

        const trigBtn= document.createElement("div");
        trigBtn.className = "btn";
        trigBtn.innerText = "▶";
        trigBtn.onclick = () => {
			if(drumBuffers[ins_name].loaded){
    			drumPlayers[ins_name].start(0, 0, "16t");
			}
        }
        sampleRequestControls.appendChild(trigBtn);

        const sampleName = document.createElement("span");
        sampleName.classList.add("drum-sample-name");
        sampleName.innerText = "---";
        drumSampleLabels[ins_name] = sampleName;
        sampleRequestControls.append(sampleName);

		channel.appendChild(sampleRequestControls);

		// FX Chain
		const { chain, container } = buildFXChain(DRUM_FX_CHAIN);
		channel.appendChild(container);

		document.getElementById("drum-channels").appendChild(channel);

    	drumPlayers[ins_name].connect(chain[0]);

		//chain[chain.length - 1].toDestination();
		drumChain[ins_name] = chain;
    }


    // build SYNTH FXs chain
	let { chain, container } = buildFXChain(SOUND_FX_CHAIN);
	const soundChannel = document.createElement("div");
	soundChannel.classList.add("ins-channel");
	soundChannel.appendChild(container);
	document.getElementById("sound-controls").appendChild(soundChannel);
	soundChain = chain;
	//chain[chain.length - 1].toDestination();
	soundPlayers.connect(soundChain[0]);


    // build MASTER FXs chain
    ({ chain, container } = buildFXChain(MASTER_FX_CHAIN, 2, true));
	const masterChannel = document.createElement("div");
	masterChannel.classList.add("ins-channel");
	masterChannel.appendChild(container);
    document.getElementById("master-controls").appendChild(masterChannel);
    masterChain = chain;
    masterChain[masterChain.length - 1].toDestination();
    soundChain[soundChain.length - 1].connect(masterChain[0]);
    for(let ins_name in drumSamples){
        drumChain[ins_name][drumChain[ins_name].length - 1].connect(masterChain[0]);
    }

}

function cleanName(name){
    let result = name;
	result = result.replace(/_+|-/g, " ");
	result = result.replace(/[0-9]/g, "");
	result = result.replace(/.wav|.mp3/, "");
	result = result.trim();
	return result;
}


function updateDrumSamples(){
	for(let ins_name in drumSamples){
    	if(drumSampleToLoad[ins_name] && drumSampleToLoad[ins_name].length > 0){

			const fp = getSamplePath(drumSampleToLoad[ins_name][0]);
            const url = ROOT_URL + "/drum/" + fp[0] + "/" + fp[1] + "/" + fp[2];

            drumBuffers[ins_name].load(url)
            .then((buffer) => {
                drumPlayers[ins_name].stop();
                drumPlayers[ins_name].buffer = buffer;
            });

			const lable = `[ ${drumSampleToLoad[ins_name].length - 1} ] ${cleanName(fp[2])}`;
			drumSampleLabels[ins_name].innerText = lable;
    	}
	}
}

function updateSoundSamples(){
    for(let sb of soundPattern){
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
	// Called at the end of each bar
	// update current measures

	if(drumPattern && drumPattern.length > 1){
    	drumPattern[0].end();
		drumPattern.shift();
		drumPattern[0].start(0);
		drawBeatGrid();
	}

	if(soundPattern && soundPattern.length > 1){
    	soundPattern[0].end();
		soundPattern.shift();
		soundPattern[0].start(0);
		drawSoundGrid();
	}

	updateDrumSamples();
	for(let ins_name in drumSampleToLoad){
    	if(drumSampleToLoad[ins_name]){
        	drumSampleToLoad[ins_name].shift(); // = null;
        	//console.log(`${ins_name} ${drumSampleToLoad[ins_name]}`);
    	}
	}
}


function makeSoundRange(trig){
	let result = [];
	let r = [];
	for(let i=0; i<trig.length; i++){
		if(trig[i] != 1) continue

		if(r.length == 0){
    		r = [i];
		} else {
    		r.push(i);
			result.push(r);
			r = [i];
		}
	}
	if(r.length == 1){
    	r.push(16);
    	result.push(r);
	}

	return result;
}


window.onload = () => {
    // register user
    apiCall("registerSession")
    .then(data => {
        console.log("Register session complete");
    });

	// set draw loop
    setInterval(() => {
    	const p = Tone.Transport.progress;
    	for(let pbar of document.getElementsByClassName("p-bar")){
			pbar.style.left = Math.min(100, p*100) + "%";
    	}

    	for(let meter of meters){
			meter.update();
    	}
    }, 1000/60);

    // Setup controls
    document.getElementById("request-grid").onclick = () => {
        apiCall("requestDrumPattern")
        .then(data => {
            if(!data || !data["ok"]){
                console.log("no drum pattern data");
            	return
            }

			for(let beat_grid of data["beat_grid"]){
				let db = new DrumBar(beat_grid, threshold);
				drumPattern.push(db);
				if(drumPattern.length == 1){
					drumPattern[0].start(0);
				}
			}

           	drawBeatGrid();
        });
    }
    document.getElementById("request-sound-pattern").onclick = () => {
        apiCall("requestSynthData", {key: "trig"})
        .then(data => {
            if(!data || !data["ok"]){
                console.log("no sound pattern data");
            	return
            }

			for(let pattern of data["synth_data"]){
    			const [trig, fns] = pattern;
    			//console.log(pattern);
    			let sb = new SoundBar(makeSoundRange(trig), fns);
				soundPattern.push(sb);
				if(soundPattern.length == 1){
    				soundPattern[0].start(0);
				}
			}
           	updateSoundSamples();
           	drawSoundGrid();
        });
    }

    document.getElementById("request-sound-samples").onclick = () => {
        apiCall("requestSynthData", {key: "synth"})
        .then(data => {
            if(!data || !data["ok"]){
                console.log("no sound pattern data");
            	return
            }

			for(let pattern of data["synth_data"]){
    			const [trig, fns] = pattern;
    			//console.log(pattern);
    			let sb = new SoundBar(makeSoundRange(trig), fns);
				soundPattern.push(sb);
				if(soundPattern.length == 1){
    				soundPattern[0].start(0);
				}
			}
           	updateSoundSamples();
           	drawSoundGrid();
        });
    }

    play_btn.onclick = () => {
        Tone.start();
        if(Tone.Transport.state == "started"){
        	Tone.Transport.stop();
        	play_btn.innerText = "play";
        } else {
        	Tone.Transport.start();
        	play_btn.innerText = "stop";
        }
    }

	document.getElementById("bpm").value = 110;
	document.getElementById("bpm").oninput = function(){
		Tone.Transport.bpm.value = this.value;
    };

    let drumThresholdKnob = document.getElementById("drum-threshold");
	drumThresholdKnob.setAttribute("data-src", "src/knob.png");
	drumThresholdKnob.setAttribute("data-diameter", "50");
	drumThresholdKnob.setAttribute("min", "0");
	drumThresholdKnob.setAttribute("max", "0.5");
	drumThresholdKnob.setAttribute("step","0.01");
	drumThresholdKnob.setAttribute("data-sprites", "127");

    drumThresholdKnob.value = threshold;
    drumThresholdKnob.oninput = function(){
    	threshold = this.value;
       	updateAudioTimes();
    	drawBeatGrid();
    }

	Tone.Transport.schedule(nextBar, "0:0:15");

	setup();
    drawBeatGrid();
    drawSoundGrid();
}
