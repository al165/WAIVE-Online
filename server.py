import os
import sys
from flask import Flask, render_template, request, send_from_directory

sys.path.extend(["../../REALTIME/", "../../COMMON_UTILS/"])
from waive_server import WaiveServer

DRUM_ROOT = "../../SAMPLE_IDENTIFICATION/DRUM_SAMPLES/"
SOUNDS_ROOT = "../../SAMPLE_IDENTIFICATION/SYNTH_SAMPLES/"

app = Flask(
    __name__,
    static_folder="dist",
    template_folder="dist",
    static_url_path="",
)

ws = WaiveServer()
ws.drum_generator_params["root"] = "../"
ws.synth_generator_params["root"] = "../"

msg_q = ws.messageQueue
r_q = ws.returnQueue

ws.start()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/<func>/<id>", methods=["GET"])
def apiRequest(func, id):
    data = request.args.to_dict()

    msg_q.put((func, id, data))
    m_type, data = r_q.get()

    return data


@app.route("/drum/<category>/<folder>/<fn>")
def getDrumAudioFile(category, folder, fn):
    return send_from_directory(
        os.path.join(DRUM_ROOT, category, folder),
        fn,
        as_attachment=False,
    )


@app.route("/sound/<category>/<folder>/<fn>")
def getSoundAudioFile(category, folder, fn):
    return send_from_directory(
        os.path.join(SOUNDS_ROOT, category, folder),
        fn,
        as_attachment=False,
    )
