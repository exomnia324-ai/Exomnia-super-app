from flask import Flask, render_template_string, request
from flask_socketio import SocketIO, emit
import os

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

users = {}

HTML = """

<!DOCTYPE html>
<html>

<head>

<title>Exomnia Call</title>

<style>

body{
background:#111;
color:white;
font-family:Arial;
text-align:center;
}

video{
width:45%;
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

<p>Your ID: <span id="myid"></span></p>

<input id="friend" placeholder="Friend ID">
<button onclick="call()">Call</button>

<br>

<video id="localVideo" autoplay muted></video>
<video id="remoteVideo" autoplay></video>

<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>

<script>

const socket = io();

let myid = Math.random().toString(36).substring(2,8);
document.getElementById("myid").innerText = myid;

socket.emit("register",myid);

let peer = new RTCPeerConnection({
iceServers:[
{urls:"stun:stun.l.google.com:19302"}
]
});

let localVideo=document.getElementById("localVideo");
let remoteVideo=document.getElementById("remoteVideo");

navigator.mediaDevices.getUserMedia({
video:true,
audio:true
}).then(stream=>{

localVideo.srcObject=stream;

stream.getTracks().forEach(track=>{
peer.addTrack(track,stream);
});

});

peer.ontrack=e=>{
remoteVideo.srcObject=e.streams[0];
};

peer.onicecandidate=e=>{
if(e.candidate){
socket.emit("candidate",{
candidate:e.candidate,
to:window.friend
});
}
};

function call(){

window.friend=document.getElementById("friend").value;

peer.createOffer().then(offer=>{

peer.setLocalDescription(offer);

socket.emit("offer",{
offer:offer,
to:window.friend
});

});

}

socket.on("offer",async data=>{

window.friend=data.from;

await peer.setRemoteDescription(new RTCSessionDescription(data.offer));

let answer=await peer.createAnswer();

await peer.setLocalDescription(answer);

socket.emit("answer",{
answer:answer,
to:data.from
});

});

socket.on("answer",async data=>{

await peer.setRemoteDescription(new RTCSessionDescription(data.answer));

});

socket.on("candidate",data=>{
peer.addIceCandidate(new RTCIceCandidate(data.candidate));
});

</script>

</body>
</html>

"""

@app.route("/")
def index():
    return render_template_string(HTML)

@socketio.on("register")
def register(id):
    users[id]=request.sid

@socketio.on("offer")
def offer(data):
    sid=users.get(data["to"])
    if sid:
        emit("offer",{"offer":data["offer"],"from":request.sid},room=sid)

@socketio.on("answer")
def answer(data):
    sid=users.get(data["to"])
    if sid:
        emit("answer",{"answer":data["answer"]},room=sid)

@socketio.on("candidate")
def candidate(data):
    sid=users.get(data["to"])
    if sid:
        emit("candidate",{"candidate":data["candidate"]},room=sid)

if __name__=="__main__":
    port=int(os.environ.get("PORT",10000))
    socketio.run(app,host="0.0.0.0",port=port)
