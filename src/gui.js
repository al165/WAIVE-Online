
export function getDefault(props, name, def){
    if(props[name] != null){
        return props[name];
    } else {
		return def;
    }
}

export function createKnob(name, params={}){
	let knobContainer = document.createElement("div");
	knobContainer.classList.add("fx-knob");

	let knob = document.createElement("input");
	knob.setAttribute("type", "range");
	knob.classList.add("input-knob");

	knob.setAttribute("data-diameter", getDefault(params, "size", 50));
	knob.setAttribute("min", "0"); //getDefault(params, "min", 0.0));
	knob.setAttribute("max", "1"); //getDefault(params, "max", 1.0));
	knob.setAttribute("step","0.01"); // getDefault(params, "step", 0.01));
	knob.setAttribute("data-src", "src/knob.png");
	knob.setAttribute("data-sprites", "127");
	if(params["default"] != null){
		let _min = getDefault(params, "min", 0.0);
		let _max = getDefault(params, "max", 1.0);
		knob.value = (params["default"] - _min) / (_max - _min);
	}

	knobContainer.appendChild(knob);

	let label = document.createElement("span");
	label.classList.add("fx-parameter");
	label.innerText = name;
	knobContainer.appendChild(label);

	if(params["fx"]){
		knob.oninput = function(){
    		let _min = getDefault(params, "min", 0.0);
    		let _max = getDefault(params, "max", 1.0);
    		let val = this.value * (_max - _min) + _min;
    		//console.log(name + " " + val);
    		let newValue = {};
    		newValue[name] = val;
			params["fx"].set(newValue);
		}
	}

	return knobContainer;
}

export function createSwitch(name, onchange){
	let switchContainer = document.createElement("div");
	switchContainer.classList.add("fx-knob");

	let sw = document.createElement("input");
	sw.setAttribute("type", "checkbox");
	sw.className = "input-switch";
	switchContainer.appendChild(sw);

	let label = document.createElement("span");
	label.classList.add("fx-name");
	label.innerText = name;
	switchContainer.appendChild(label);

	sw.onchange = onchange;

	return switchContainer;
}

export function createSelection(name, choices, fx){
	let select = document.createElement("select");
	select.name = name;
	select.id = name;
	for(const c of choices){
		let option = document.createElement("option");
		option.value = c;
		option.text = c;
		select.appendChild(option);
	}

	select.onchange = function(){
    	let newValue = {};
    	newValue[name]=  this.value;
		fx.set(newValue);
	}

	return select;
}


export class Meter{
	constructor(fx){
    	this.fx = fx;

    	this.container = document.createElement("div");
    	this.container.classList.add("meter-bg");
    	this.level = document.createElement("div");
    	this.level.classList.add("meter-level");
    	this.container.appendChild(this.level);
	}

	getElement(){
		return this.container;
	}

	update(){
		let vals = this.fx.getValue();
		if(!Array.isArray(vals)){
			vals = [vals];
		}
		let v = vals.reduce((a, b) => Math.max(a, b), 0);
		this.level.style.height = (v*100) + "%";
	}
}






