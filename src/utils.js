
export function download(href, filename) {
	var a = document.createElement("a");
	a.style = "display: none";
	a.href = href;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
}

export function getSamplePath(full_path){
	const fp = full_path.split("/");

	const sample_category = fp[fp.length - 3];
	const sample_folder = fp[fp.length - 2];
	const sample_name = fp[fp.length - 1];

	return [sample_category, sample_folder, sample_name];
}

export function cleanName(name){
    let result = name;
	result = result.replace(/_+|-/g, " ");
	result = result.replace(/[0-9]/g, "");
	result = result.replace(/.wav|.mp3/, "");
	result = result.trim();
	return result;
}

export function apiCall(id, root, m_type, data) {
    if(!data){
        data = {};
    }

    let parameters = '?';
    for(const key in data){
		parameters += key + "=" + data[key] + "&";
    }

	return fetch(`${root}api/${m_type}/${id}${parameters}`)
	.then(response => {
		if(!response.ok){
    		throw new Error(`request for ${root}api/${m_type}/${id}${parameters} failed with status ${response.status}`);
		}
		return response.json();
	})
	.then(data => {
		return data;
	})
	.catch(error => console.log(error));
}

export function makeSoundRange(trig){
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
