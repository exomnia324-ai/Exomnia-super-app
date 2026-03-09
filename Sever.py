from flask import Flask, render_template
from flask_socketio import SocketIO, emit

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route("/")
def index():
    return render_template("index.html")

@socketio.on("offer")
def handle_offer(data):
    emit("offer", data, broadcast=True, include_self=False)

@socketio.on("answer")
def handle_answer(data):
    emit("answer", data, broadcast=True, include_self=False)

@socketio.on("candidate")
def handle_candidate(data):
    emit("candidate", data, broadcast=True, include_self=False)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)
