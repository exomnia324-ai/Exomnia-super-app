from flask import Flask, render_template_string, request
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
font-family:Arial;
text-align:center;
}

video{
width:40%;
margin:10px;
border:2px solid white;
}

input{
padding:10px;
font-size:16px;
}

button{
padding:10px;
font-size:18px;
margin:5px;
}

</style>

</head>

<body>

<h2>Video Call</h2>

<p>Your Room ID:</p>

<input id="myroom" placeholder="Enter your ID">

<br><br>

<input id="friend" placeholder="Friend Room ID">

<button onclick="startCall()">Start Call</button>

<br>

<video id="localVideo" autoplay muted></video>
<video id="remoteVideo" autoplay></video>

<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>

<script>

const socket = io();

let peer;

let localVideo=document.getElementById("localVideo");
let remoteVideo=document.getElementById("remoteVideo");

let localStream;

navigator.mediaDevices.getUserMedia({
video:true,
audio:true
}).then(stream=>{

localStream=stream;

localVideo.srcObject=stream;

});

function createPeer(){

peer=new RTCPeerConnection({

iceServers:[
{urls:"stun:stun.l.google.com:19302"}
]

});

localStream.getTracks().forEach(track=>{
peer.addTrack(track,localStream);
});

peer.ontrack=e=>{
remoteVideo.srcObject=e.streams[0];
};

peer.onicecandidate=e=>{
if(e.candidate){

socket.emit("candidate",{
candidate:e.candidate,
room:window.room
});

}
};

}

function startCall(){

let myroom=document.getElementById("myroom").value;
let friend=document.getElementById("friend").value;

window.room=[myroom,friend].sort().join("-");

socket.emit("join",window.room);

createPeer();

peer.createOffer().then(offer=>{

peer.setLocalDescription(offer);

socket.emit("offer",{
offer:offer,
room:window.room
});

});

}

socket.on("offer",async data=>{

createPeer();

await peer.setRemoteDescription(new RTCSessionDescription(data));

let answer=await peer.createAnswer();

await peer.setLocalDescription(answer);

socket.emit("answer",{
answer:answer,
room:window.room
});

});

socket.on("answer",async data=>{

await peer.setRemoteDescription(new RTCSessionDescription(data));

});

socket.on("candidate",data=>{

peer.addIceCandidate(new RTCIceCandidate(data));

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

if __name__=="__main__":
    port=int(os.environ.get("PORT",10000))
    socketio.run(app,host="0.0.0.0",port=port)
