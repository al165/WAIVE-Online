import os
import sys
from flask import Flask, render_template, request, send_from_directory
from flask_cors import CORS

sys.path.extend(["../../REALTIME/", "../../COMMON_UTILS/"])
from waive_server import WaiveServer

# DRUM_ROOT = "../../SAMPLE_IDENTIFICATION/DRUM_SAMPLES/"
# SOUNDS_ROOT = "../../SAMPLE_IDENTIFICATION/SYNTH_SAMPLES_WAV/"
SAMPLES_ROOT = "../../SAMPLE_IDENTIFICATION/"

app = Flask(
    __name__,
    static_folder="dist",
    template_folder="dist",
    static_url_path="",
)
CORS(app, resources={r"/*": {"origins": "*"}})
app.config['CORS_HEADERS'] = 'Content-Type'

ws = WaiveServer()
ws.drum_generator_params["root"] = "../"
ws.synth_generator_params["root"] = "../"
ws.bassline_generator_params["root"] = "../"
ws.melody_generator_params["root"] = "../"
ws.initModels()

msg_q = ws.messageQueue
r_q = ws.returnQueue

ws.start()


@app.route("/apipost", methods=["POST"])
def apiPostRequest():
    data = request.get_json()
    msg_q.put((data['type'], data['id'], data['data']))
    m_type, data = r_q.get()
    return data


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/<func>/<id>", methods=["GET"])
def apiRequest(func, id):
    data = request.args.to_dict()

    msg_q.put((func, id, data))
    m_type, data = r_q.get()

    return data


@app.route("/sample/<group>/<category>/<folder>/<fn>")
def getSampleAudioFile(group, category, folder, fn):
    if group == "drums":
        fn = fn.split('.')[0] + ".mp3"
        return send_from_directory(
            os.path.join(SAMPLES_ROOT, group, category, folder),
            fn,
            as_attachment=False,
        )
    else:
        return send_from_directory(
            os.path.join(SAMPLES_ROOT, group, group, category),
            fn,
            as_attachment=False
        )

# @app.route("/sound/<category>/<folder>/<fn>")
# def getSoundAudioFile(category, folder, fn):
#     return send_from_directory(
#         os.path.join(SOUNDS_ROOT, category, folder),
#         fn,
#         as_attachment=False,
#     )


# @app.route("/sample/<category>/<fn>")
# def getSampleAudio(category, fn):
#     # print(os.path.join(SOUNDS_ROOT, category))
#     return send_from_directory(
#         os.path.join(SOUNDS_ROOT, category),
#         fn,
#         as_attachment=False,
#    )

if __name__ == "__main__":
    app.run(host='0.0.0.0')
