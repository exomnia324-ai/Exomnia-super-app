from flask import Flask, render_template_string
from flask_socketio import SocketIO, emit, join_room
import os

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

HTML = """

<!DOCTYPE html>
<html>
<head>

<title>Video Call</title>

<style>

body{
background:#111;
color:white;
text-align:center;
font-family:Arial;
}

video{
width:45%;
margin:10px;
border:2px solid white;
}

button{
padding:10px;
font-size:18px;
}

</style>

</head>

<body>

<h2>Real Time Video Call</h2>

<p>Room: <span id="room"></span></p>

<video id="localVideo" autoplay muted></video>
<video id="remoteVideo" autoplay></video>

<br>
<button onclick="startCall()">Start Call</button>

<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>

<script>

const socket = io();

let room = "exomnia";
document.getElementById("room").innerText = room;

socket.emit("join",room);

let localVideo = document.getElementById("localVideo");
let remoteVideo = document.getElementById("remoteVideo");

let peer = new RTCPeerConnection({

iceServers:[
{urls:"stun:stun.l.google.com:19302"}
]

});

navigator.mediaDevices.getUserMedia({
video:true,
audio:true
}).then(stream=>{

localVideo.srcObject = stream;

stream.getTracks().forEach(track=>{
peer.addTrack(track,stream);
});

});

peer.ontrack = e=>{
remoteVideo.srcObject = e.streams[0];
};

peer.onicecandidate = e=>{
if(e.candidate){
socket.emit("candidate",{candidate:e.candidate,room:room});
}
};

socket.on("candidate",data=>{
peer.addIceCandidate(new RTCIceCandidate(data));
});

async function startCall(){

let offer = await peer.createOffer();
await peer.setLocalDescription(offer);

socket.emit("offer",{offer:offer,room:room});

}

socket.on("offer",async data=>{

await peer.setRemoteDescription(new RTCSessionDescription(data));

let answer = await peer.createAnswer();
await peer.setLocalDescription(answer);

socket.emit("answer",{answer:answer,room:room});

});

socket.on("answer",async data=>{
await peer.setRemoteDescription(new RTCSessionDescription(data));
});

</script>

</body>
</html>

"""

@app.route("/")
def index():
    return render_template_string(HTML)

@socketio.on("join")
def join(room):
    join_room(room)

@socketio.on("offer")
def offer(data):
    emit("offer",data["offer"],room=data["room"],include_self=False)

@socketio.on("answer")
def answer(data):
    emit("answer",data["answer"],room=data["room"],include_self=False)

@socketio.on("candidate")
def candidate(data):
    emit("candidate",data["candidate"],room=data["room"],include_self=False)

if __name__ == "__main__":
    port = int(os.environ.get("PORT",10000))
    socketio.run(app,host="0.0.0.0",port=port)
