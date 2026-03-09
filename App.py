from flask import Flask, render_template_string
from flask_socketio import SocketIO, emit

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

HTML_PAGE = """

<!DOCTYPE html>
<html>
<head>
<title>Video Call App</title>
<style>

body{
background:black;
color:white;
text-align:center;
font-family:Arial;
}

video{
width:45%;
border:2px solid white;
margin:5px;
}

button{
padding:10px 20px;
font-size:18px;
}

</style>
</head>

<body>

<h2>Simple Video Call</h2>

<video id="localVideo" autoplay muted></video>
<video id="remoteVideo" autoplay></video>

<br>
<button onclick="startCall()">Start Call</button>

<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>

<script>

const socket = io();

let localVideo = document.getElementById("localVideo");
let remoteVideo = document.getElementById("remoteVideo");

let peer = new RTCPeerConnection();

navigator.mediaDevices.getUserMedia({video:true,audio:true})
.then(stream=>{
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
socket.emit("candidate",e.candidate);
}
};

socket.on("candidate",candidate=>{
peer.addIceCandidate(new RTCIceCandidate(candidate));
});

async function startCall(){

let offer = await peer.createOffer();
await peer.setLocalDescription(offer);

socket.emit("offer",offer);

}

socket.on("offer",async offer=>{

await peer.setRemoteDescription(new RTCSessionDescription(offer));

let answer = await peer.createAnswer();
await peer.setLocalDescription(answer);

socket.emit("answer",answer);

});

socket.on("answer",async answer=>{
await peer.setRemoteDescription(new RTCSessionDescription(answer));
});

</script>

</body>
</html>

"""

@app.route("/")
def index():
    return render_template_string(HTML_PAGE)

@socketio.on("offer")
def offer(data):
    emit("offer",data,broadcast=True,include_self=False)

@socketio.on("answer")
def answer(data):
    emit("answer",data,broadcast=True,include_self=False)

@socketio.on("candidate")
def candidate(data):
    emit("candidate",data,broadcast=True,include_self=False)

if __name__ == "__main__":
    socketio.run(app,host="0.0.0.0",port=10000)
